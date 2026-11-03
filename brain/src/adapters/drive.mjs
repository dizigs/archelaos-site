import { AdapterBlocked, boundedPage, deliver, enabled, metadataEvent, sameSecret } from './common.mjs';
import { digest } from '../contract.mjs';

// Google changes.watch notifications are wake-ups, not trusted file revisions.
// The approved changes feed is authoritative; checkpoint only durable delivery.
export async function handleDriveNotification(notification, config, deps, store, now = Date.now()) {
  enabled(config, deps, ['listChanges', 'readApprovedMetadata', 'enqueue']);
  if (['channelId', 'resourceId', 'approvedDriveId'].some(key => typeof config[key] !== 'string' || !config[key] || config[key].length > 1024)) throw new AdapterBlocked('DRIVE_SOURCE_CONFIGURATION_REQUIRED');
  const header = new Headers(notification.headers);
  if (header.get('x-goog-channel-id') !== config.channelId || header.get('x-goog-resource-id') !== config.resourceId || !await sameSecret(header.get('x-goog-channel-token'), config.channelToken)) throw new AdapterBlocked('DRIVE_CHANNEL_UNVERIFIED');
  if (!Number.isFinite(config.channelExpiresAt) || config.channelExpiresAt <= now) throw new AdapterBlocked('DRIVE_CHANNEL_EXPIRED');
  const state = header.get('x-goog-resource-state');
  if (state === 'sync') return { status: 'CHANNEL_SYNC_ONLY', receipts: [], renewalRequired: config.channelExpiresAt - now < 86400000 };
  if (state !== 'change') throw new AdapterBlocked('DRIVE_NOTIFICATION_UNSUPPORTED');
  const key = 'drive:' + await digest(config.channelId);
  return store.withLease(key, now, async lease => {
    let cursor = store.getCursor(key); if (!cursor) throw new AdapterBlocked('DRIVE_START_CURSOR_REQUIRED');
    const receipts = [];
    for (let count = 0; count < 5; count++) {
      const page = await deps.listChanges({ cursor, driveId: config.approvedDriveId, supportsAllDrives: true, includeItemsFromAllDrives: true });
      const items = boundedPage(page);
      for (const change of items) {
        if (change.removed === true) { store.record(key, 'SOURCE_REMOVAL_REVIEW_REQUIRED', now); continue; }
        if (change.driveId !== config.approvedDriveId || typeof change.fileId !== 'string' || typeof change.revision !== 'string') throw new AdapterBlocked('DRIVE_APPROVED_SCOPE_MISMATCH');
        const metadata = await deps.readApprovedMetadata({ fileId: change.fileId, revision: change.revision, driveId: config.approvedDriveId });
        const event = await metadataEvent('drive', change.fileId, change.revision, change.fileId + ':' + change.revision, metadata, now);
        receipts.push(await deliver(event, deps));
      }
      const checkpoint = page.nextPageToken || page.newStartPageToken;
      if (typeof checkpoint !== 'string' || !checkpoint || checkpoint.length > 1024 || checkpoint === cursor && (page.nextPageToken || items.length)) throw new AdapterBlocked('DRIVE_CHECKPOINT_UNVERIFIABLE');
      if (checkpoint !== cursor) store.saveCursor(key, checkpoint, lease, now);
      cursor = checkpoint;
      if (!page.nextPageToken) return { status: 'DURABLE_EVENTS_RECORDED', receipts, renewalRequired: config.channelExpiresAt - now < 86400000 };
    }
    return { status: 'CONTINUATION_REQUIRED', receipts, renewalRequired: true };
  });
}
