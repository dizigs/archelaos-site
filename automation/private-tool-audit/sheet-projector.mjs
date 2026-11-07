// SOURCE ONLY: no Google authentication, HTTP handler, Worker binding, or scheduler.
// The private Sheet LOG is the sole operational journal; a private SQLite receipt
// queue is an ingestion source, never a competing work/task status ledger.
const ID = /^[a-z][a-z0-9-]{1,47}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TASK = /^[A-Z0-9][A-Z0-9:._-]{0,95}$/;
const HASH = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const GENESIS = '0'.repeat(64);
const OUTCOMES = new Set(['PASS', 'FAIL', 'BLOCKED', 'UNKNOWN', 'SKIPPED']);

export class ProjectionFault extends Error {
  constructor(code) { super(code); this.name = 'ProjectionFault'; this.code = code; }
}
function validReceipt(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) ||
      !Number.isSafeInteger(r.seq) || r.seq < 1 ||
      typeof r.source !== 'string' || !ID.test(r.source) ||
      typeof r.event_id !== 'string' || !UUID.test(r.event_id) ||
      typeof r.tool_id !== 'string' || !ID.test(r.tool_id) ||
      typeof r.command_id !== 'string' || !ID.test(r.command_id) ||
      !OUTCOMES.has(r.outcome) ||
      (r.task_id !== null && (typeof r.task_id !== 'string' || !TASK.test(r.task_id))) ||
      (r.commit_sha !== null && (typeof r.commit_sha !== 'string' || !SHA.test(r.commit_sha))) ||
      (r.evidence_url !== null && !validEvidence(r.evidence_url)) ||
      !Number.isSafeInteger(r.server_at) || r.server_at < 0 ||
      typeof r.receipt_hash !== 'string' || !HASH.test(r.receipt_hash) ||
      typeof r.prev_hash !== 'string' || !HASH.test(r.prev_hash)) {
    throw new ProjectionFault('INVALID_SOURCE_RECEIPT');
  }
}
function validEvidence(value) {
  if (typeof value !== 'string' || value.length > 240) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'github.com' &&
      u.username === '' && u.password === '' && u.search === '' && u.hash === '' &&
      u.pathname.startsWith('/dizigs/archelaos-site/');
  } catch { return false; }
}
function validateCheckpoint(value) {
  if (!value || !Number.isSafeInteger(value.seq) || value.seq < 0 ||
      typeof value.hash !== 'string' || !HASH.test(value.hash) ||
      (value.seq === 0 && value.hash !== GENESIS)) {
    throw new ProjectionFault('INVALID_CHECKPOINT');
  }
}
export function eventKey(receipt) { return receipt.source + ':' + receipt.event_id; }

// Exactly A:R, matching the EXISTING private LOG tab, with immutable event key
// in column H and provider receipt hash in N. No spreadsheet formulas or raw input.
export function toSheetRow(receipt) {
  validReceipt(receipt);
  const time = new Date(receipt.server_at);
  if (Number.isNaN(time.getTime())) throw new ProjectionFault('INVALID_SOURCE_RECEIPT');
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(time);
  return [
    local + ' Europe/Athens', receipt.task_id ?? '',
    receipt.tool_id + ' / ' + receipt.command_id, receipt.outcome,
    receipt.evidence_url ?? '', receipt.source,
    'Signed receipt #' + receipt.seq + ' (source only; no live activation)',
    eventKey(receipt), receipt.source + ':' + receipt.seq, receipt.task_id ?? '',
    receipt.outcome, receipt.tool_id, receipt.command_id, receipt.receipt_hash,
    '1', 'UNKNOWN', time.toISOString(),
    'Verified projection of signed event ' + receipt.seq + '; no raw payload or secrets',
  ];
}

function findVerified(observed, receipts) {
  if (!Array.isArray(observed)) throw new ProjectionFault('SHEET_READBACK_INVALID');
  const requested = new Map(receipts.map(r => [eventKey(r), r.receipt_hash]));
  const found = new Set();
  for (const entry of observed) {
    if (!entry || typeof entry.eventKey !== 'string' ||
        !requested.has(entry.eventKey) || !HASH.test(entry.receiptHash ?? '')) {
      throw new ProjectionFault('SHEET_READBACK_INVALID');
    }
    if (found.has(entry.eventKey)) throw new ProjectionFault('DUPLICATE_SHEET_EVENT');
    if (requested.get(entry.eventKey) !== entry.receiptHash) {
      throw new ProjectionFault('SHEET_EVENT_HASH_CONFLICT');
    }
    found.add(entry.eventKey);
  }
  return found;
}

// Caller-owned trusted adapters only. gate.runExclusive MUST provide an
// authenticated, cross-process, fenced single writer. checkpoint.compareAndSet
// MUST be durable. sheet.findByEventKeys MUST read the whole canonical H/N key
// space, report duplicates and never return stale cached data. No adapters are
// wired to Google here; deployment or OAuth is a separate security gate.
export function createSheetProjector({ source, sheet, checkpoint, gate, limit = 25 }) {
  if (!source || typeof source.list !== 'function' ||
      !sheet || typeof sheet.findByEventKeys !== 'function' ||
      typeof sheet.appendRows !== 'function' ||
      !checkpoint || typeof checkpoint.read !== 'function' ||
      typeof checkpoint.compareAndSet !== 'function' ||
      !gate || typeof gate.runExclusive !== 'function' ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new ProjectionFault('TRUSTED_ADAPTERS_REQUIRED');
  }
  return Object.freeze({
    projectOnce: () => gate.runExclusive(async () => {
      const current = await checkpoint.read();
      validateCheckpoint(current);
      const receipts = await source.list({ after: current.seq, limit });
      if (!Array.isArray(receipts) || receipts.length > limit) {
        throw new ProjectionFault('SOURCE_PAGE_INVALID');
      }
      if (receipts.length === 0) return { status: 'IDLE', checkpoint: current.seq };
      let previous = current.hash;
      const keys = new Set();
      for (let i = 0; i < receipts.length; i++) {
        const r = receipts[i];
        validReceipt(r);
        if (r.seq !== current.seq + i + 1) throw new ProjectionFault('SOURCE_SEQUENCE_GAP');
        if (r.prev_hash !== previous) throw new ProjectionFault('SOURCE_HASH_CHAIN_BROKEN');
        const key = eventKey(r);
        if (keys.has(key)) throw new ProjectionFault('SOURCE_DUPLICATE_EVENT');
        keys.add(key);
        previous = r.receipt_hash;
      }
      const lookup = [...keys];
      const existing = findVerified(await sheet.findByEventKeys(lookup), receipts);
      const missing = receipts.filter(r => !existing.has(eventKey(r)));
      if (missing.length) {
        // A provider timeout may occur AFTER an append was committed. Never
        // advance the checkpoint until a separate, full exact-ID readback.
        await sheet.appendRows(missing.map(toSheetRow));
      }
      const confirmed = findVerified(await sheet.findByEventKeys(lookup), receipts);
      if (confirmed.size !== receipts.length) throw new ProjectionFault('SHEET_RECEIPT_GAP');
      const next = { seq: receipts.at(-1).seq, hash: previous };
      if (await checkpoint.compareAndSet(current, next) !== true) {
        throw new ProjectionFault('CHECKPOINT_CONFLICT');
      }
      return { status: 'VERIFIED', checked: receipts.length,
        appended: missing.length, checkpoint: next.seq };
    }),
  });
}
