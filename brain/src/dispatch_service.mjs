import { UUID } from './contract.mjs';
import { enrichDocument } from './content_pipeline.mjs';
import { proposeDraftPullRequest } from './draft_publisher.mjs';

export class SqlWorkJournal {
  constructor(storage, clock = Date.now) {
    this.storage = storage; this.sql = storage.sql; this.clock = clock;
    this.sql.exec('CREATE TABLE IF NOT EXISTS enrichment_work(receipt TEXT PRIMARY KEY,owner TEXT,status TEXT NOT NULL,lease INTEGER NOT NULL,result TEXT,attempts INTEGER NOT NULL DEFAULT 1)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS enrichment_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,receipt TEXT NOT NULL,status TEXT NOT NULL,at INTEGER NOT NULL)');
  }
  claim(receipt) {
    if (!UUID.test(receipt)) throw new Error('Valid durable receipt required');
    return this.storage.transactionSync(() => {
      const row = [...this.sql.exec('SELECT * FROM enrichment_work WHERE receipt=?', receipt)][0];
      if (row?.status === 'COMPLETE') return { status: 'REPLAY_SUPPRESSED', result: JSON.parse(row.result) };
      if (row && (row.lease > this.clock() || row.attempts >= 3)) return { status: row.attempts >= 3 ? 'ENRICHMENT_QUARANTINED' : 'LEASE_BUSY' };
      const owner = crypto.randomUUID();
      this.sql.exec('INSERT INTO enrichment_work(receipt,owner,status,lease) VALUES(?,?,?,?) ON CONFLICT(receipt) DO UPDATE SET owner=excluded.owner,status=excluded.status,lease=excluded.lease,attempts=attempts+1', receipt, owner, 'CLAIMED', this.clock() + 60000);
      this.sql.exec('INSERT INTO enrichment_audit(receipt,status,at) VALUES(?,?,?)', receipt, 'CLAIMED', this.clock());
      return { status: 'CLAIMED', owner };
    });
  }
  complete(receipt, owner, result) {
    this.storage.transactionSync(() => {
      const row = [...this.sql.exec('SELECT owner,lease FROM enrichment_work WHERE receipt=?', receipt)][0];
      if (!row || row.owner !== owner || row.lease <= this.clock()) throw new Error('Enrichment lease lost; reconcile before completion');
      this.sql.exec('UPDATE enrichment_work SET status=?,result=?,lease=0 WHERE receipt=?', 'COMPLETE', JSON.stringify(result), receipt);
      this.sql.exec('INSERT INTO enrichment_audit(receipt,status,at) VALUES(?,?,?)', receipt, result.status, this.clock());
    });
  }
}

export async function processReceipt(receiptId, ports, config = {}) {
  const preliminary = await ports.readControls();
  if (preliminary.globalPaused || preliminary.sourcePaused?.[config.sourceType]) return { status: 'PAUSED_WITH_DURABLE_RECEIPT', remoteMutationPerformed: false };
  const queued = await ports.readReceipt(receiptId);
  if (queued.status !== 'WAITING_REVIEW') return { status: 'PENDING_DISPATCH', remoteMutationPerformed: false };
  const claimed = ports.journal.claim(receiptId);
  if (claimed.status !== 'CLAIMED') return claimed;
  // This shared module has no network transport or credentials. Live readers,
  // extractors and publishers must be explicitly authorized port implementations.
  const controls = await ports.readControls();
  if (controls.globalPaused || controls.sourcePaused?.[config.sourceType]) {
    // Preserve the claim for explicit health-checked reconciliation; do not
    // silently clear a lease or restart work after an emergency pause.
    return { status: 'PAUSED_WITH_DURABLE_RECEIPT', remoteMutationPerformed: false };
  }
  const event = await ports.readEnvelope(receiptId);
  if (!event || event.sourceType !== config.sourceType) throw new Error('Receipt/source scope mismatch');
  const enriched = await enrichDocument(event, ports.content);
  if (enriched.status === 'PRIVATE_REVIEW') {
    const result = { status: 'PRIVATE_REVIEW', reason: enriched.reason, draftIds: [], aiProviderCalls: 0, remoteMutationPerformed: false };
    ports.journal.complete(receiptId, claimed.owner, result); return result;
  }
  const draftIds = []; const publications = [];
  for (const draft of enriched.publicDrafts) {
    const latest = await ports.readControls();
    if (latest.globalPaused || latest.sourcePaused?.[event.sourceType]) return { status: 'PAUSED_WITH_DURABLE_RECEIPT', remoteMutationPerformed: false };
    const saved = await ports.drafts.save(draft);
    if (saved.status === 'STALE_PREVIEW_IGNORED') continue;
    const publication = await proposeDraftPullRequest(draft, ports.publisher, config.publicationMode || 'dry-run');
    draftIds.push(draft.draftId); publications.push(publication.status);
  }
  const result = { status: 'DRAFTS_PREPARED_FOR_REVIEW', draftIds, publications, aiProviderCalls: 0, remoteMutationPerformed: false };
  ports.journal.complete(receiptId, claimed.owner, result); return result;
}
