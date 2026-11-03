import { AdapterBlocked, boundedPage, deliver, enabled, metadataEvent } from './common.mjs';
import { digest } from '../contract.mjs';

export async function handleGmailPush(push, config, deps, store, now = Date.now()) {
  enabled(config, deps, ['verifyOidc', 'listHistory', 'readApprovedMetadata', 'enqueue']);
  const principal = await deps.verifyOidc(push.authorization, { audience: config.audience, serviceAccountEmail: config.serviceAccountEmail });
  if (principal?.verified !== true || principal.audience !== config.audience || principal.email !== config.serviceAccountEmail || principal.emailVerified !== true || !['https://accounts.google.com', 'accounts.google.com'].includes(principal.issuer) || !Number.isFinite(principal.expiresAt) || principal.expiresAt <= now) throw new AdapterBlocked('PUBSUB_OIDC_UNVERIFIED');
  if (push.subscription !== config.subscription || push.data?.emailAddress !== config.mailbox || !/^[0-9]{1,32}$/.test(push.data?.historyId || '')) throw new AdapterBlocked('GMAIL_APPROVED_SCOPE_MISMATCH');
  const key = 'gmail:' + await digest(config.mailbox);
  return store.withLease(key, now, async lease => {
    const saved = store.getCursor(key); if (!saved) throw new AdapterBlocked('GMAIL_START_HISTORY_REQUIRED');
    let cursor, pageToken;
    if (/^[0-9]{1,32}$/.test(saved)) cursor = saved;
    else {
      let continuation; try { continuation = JSON.parse(saved); } catch { throw new AdapterBlocked('GMAIL_CHECKPOINT_UNVERIFIABLE'); }
      cursor = continuation.historyId; pageToken = continuation.pageToken;
      if (!/^[0-9]{1,32}$/.test(cursor) || typeof pageToken !== 'string' || pageToken.length > 800) throw new AdapterBlocked('GMAIL_CHECKPOINT_UNVERIFIABLE');
    }
    if (!pageToken && BigInt(push.data.historyId) <= BigInt(cursor)) return { status: 'NOTIFICATION_ALREADY_COVERED', receipts: [] };
    const receipts = [];
    for (let count = 0; count < 5; count++) {
      let page;
      try { page = await deps.listHistory({ cursor, pageToken, mailbox: config.mailbox, labelId: config.approvedLabelId }); }
      catch (error) { if (error.code === 'HISTORY_NOT_FOUND') throw new AdapterBlocked('GMAIL_RECONCILIATION_REQUIRED'); throw error; }
      for (const message of boundedPage(page)) {
        if (!message.labelIds?.includes(config.approvedLabelId)) throw new AdapterBlocked('GMAIL_UNAPPROVED_LABEL');
        const metadata = await deps.readApprovedMetadata({ mailbox: config.mailbox, messageId: message.id, historyId: message.historyId });
        const event = await metadataEvent('gmail', message.id, message.historyId, message.id + ':' + message.historyId, metadata, now);
        event.eventType = 'source.message.received';
        receipts.push(await deliver(event, deps));
      }
      if (page.nextPageToken) {
        if (typeof page.nextPageToken !== 'string' || page.nextPageToken.length > 800 || page.nextPageToken === pageToken) throw new AdapterBlocked('GMAIL_CHECKPOINT_UNVERIFIABLE');
        pageToken = page.nextPageToken;
        store.saveCursor(key, JSON.stringify({ historyId: cursor, pageToken }), lease, now);
      } else {
        if (!/^[0-9]{1,32}$/.test(page.historyId || '') || BigInt(page.historyId) < BigInt(cursor)) throw new AdapterBlocked('GMAIL_CHECKPOINT_UNVERIFIABLE');
        store.saveCursor(key, page.historyId, lease, now);
      }
      if (!page.nextPageToken) return { status: 'DURABLE_EVENTS_RECORDED', receipts };
    }
    return { status: 'CONTINUATION_REQUIRED', receipts };
  });
}
