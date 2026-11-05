// Durable, fail-closed recovery orchestration. External authority must be supplied
// by a trusted Brain Service binding: caller-supplied booleans are not evidence.
export const MAX_RECOVERY_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = Object.freeze([30_000, 120_000]);
const REPOSITORY = 'dizigs/archelaos-site';
const SHA = /^[0-9a-f]{40}$/;
const EVIDENCE = /^(?:actions:[1-9][0-9]{0,19}|pages:[a-f0-9-]{36})$/;
const SEVERITIES = Object.freeze({
  SONAR_SECURITY_FINDING: 'P0', CI_FAILURE: 'P1',
  LIVE_HEALTH_FAILURE: 'P1', HTML_ESCAPED_TEXT: 'P2',
  DEPLOYMENT_UNVERIFIED: 'P1'
});
const REVIEW_CODES = new Set(['CI_FAILURE', 'HTML_ESCAPED_TEXT']);
const NEVER_AUTO = new Set(['SONAR_SECURITY_FINDING', 'DEPLOYMENT_UNVERIFIED']);
const PROBE_CODE = 'LIVE_HEALTH_FAILURE';
const LIMIT = 2000;

export class RecoveryBlocked extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'RecoveryBlocked'; }
}
function requireSafe(ok, code) { if (!ok) throw new RecoveryBlocked(code); }
function response(status, extras = {}) { return { status, ...extras, autoMergeAllowed: false, deployAllowed: false }; }
function outcomeCode(err) {
  return err instanceof RecoveryBlocked ? err.code : 'UNVERIFIED_OR_UNKNOWN_OUTCOME';
}
export function severityFor(code) {
  requireSafe(Object.hasOwn(SEVERITIES, code), 'UNRECOGNIZED_INCIDENT');
  return SEVERITIES[code];
}
export function validateVerifiedReceipt(f, receipt, now) {
  requireSafe(receipt?.verified === true && receipt.issuer === 'central-brain' &&
    receipt.repository === REPOSITORY && receipt.commit === f.commit &&
    receipt.evidenceId === f.evidenceId && receipt.code === f.code &&
    receipt.resource === f.resource && receipt.paused === false &&
    receipt.incidentAuthorized === true && receipt.repairWritesAllowed === false &&
    typeof receipt.receiptId === 'string' && /^[0-9a-f-]{36}$/.test(receipt.receiptId) &&
    Number.isSafeInteger(receipt.expiresAtMs) && receipt.expiresAtMs > now &&
    receipt.expiresAtMs <= now + 5 * 60_000, 'BRAIN_PROOF_UNVERIFIED');
  return receipt;
}
async function stableId(f) {
  const data = new TextEncoder().encode(`${REPOSITORY}|${f.code}|${f.resource}|${f.commit}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export class RecoveryLedger {
  constructor(storage) {
    requireSafe(typeof storage?.transactionSync === 'function' && typeof storage?.sql?.exec === 'function', 'DURABLE_STORAGE_REQUIRED');
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS recoveries (
      id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, code TEXT NOT NULL,
      severity TEXT NOT NULL, state TEXT NOT NULL, attempt INTEGER NOT NULL,
      next_at INTEGER NOT NULL, last_reason TEXT NOT NULL, updated INTEGER NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS recoveries_state ON recoveries(state,next_at)');
  }
  read(id) { return [...this.sql.exec('SELECT * FROM recoveries WHERE id=?', id)][0] || null; }
  claim(id, fingerprint, code, severity, now) {
    return this.storage.transactionSync(() => {
      const prev = this.read(id);
      if (prev) {
        requireSafe(prev.fingerprint === fingerprint, 'RECOVERY_FINGERPRINT_CONFLICT');
        if (prev.state !== 'WAITING') return { status: 'REPLAY_BLOCKED', state: prev.state, attempt: prev.attempt };
        if (prev.next_at > now) return { status: 'BACKOFF', nextAttemptAt: prev.next_at, attempt: prev.attempt };
        if (prev.attempt >= MAX_RECOVERY_ATTEMPTS) return { status: 'CIRCUIT_OPEN' };
        this.sql.exec("UPDATE recoveries SET state='CLAIMED',attempt=attempt+1,updated=? WHERE id=?", now, id);
        return { status: 'CLAIMED', attempt: prev.attempt + 1 };
      }
      const total = [...this.sql.exec('SELECT COUNT(*) AS n FROM recoveries')][0].n;
      requireSafe(total < LIMIT, 'RECOVERY_CAPACITY_REACHED');
      this.sql.exec('INSERT INTO recoveries(id,fingerprint,code,severity,state,attempt,next_at,last_reason,updated) VALUES(?,?,?,?,?,?,?,?,?)',
        id, fingerprint, code, severity, 'CLAIMED', 1, 0, 'IN_PROGRESS', now);
      return { status: 'CLAIMED', attempt: 1 };
    });
  }
  finish(id, state, attempt, reason, now) {
    requireSafe(['RECOVERED', 'ROUTED', 'WAITING', 'CIRCUIT_OPEN', 'HUMAN_REQUIRED', 'UNKNOWN'].includes(state), 'INVALID_RECOVERY_STATE');
    requireSafe(/^[A-Z0-9_]{3,64}$/.test(reason), 'INVALID_RECOVERY_REASON');
    return this.storage.transactionSync(() => {
      const old = this.read(id);
      requireSafe(old?.state === 'CLAIMED' && old.attempt === attempt, 'RECOVERY_RECONCILIATION_REQUIRED');
      const next = state === 'WAITING' ? now + RETRY_BACKOFF_MS[attempt - 1] : 0;
      this.sql.exec('UPDATE recoveries SET state=?,next_at=?,last_reason=?,updated=? WHERE id=?', state, next, reason, now, id);
      return { state, nextAttemptAt: next || null };
    });
  }
}

// One action per invocation. Never loop or sleep, and never auto-resume UNKNOWN.
// No direct GitHub write, deploy, shell execution, provider retry or AI call.
export async function recover(f, ledger, ports, now = Date.now()) {
  const severity = Object.hasOwn(SEVERITIES, f?.code) ? severityFor(f.code) : 'P0';
  const blocked = (reason) => response('BLOCKED', { reason, severity, chainHalted: true });
  if (!f || f.repository !== REPOSITORY || !SHA.test(f.commit || '') ||
      !EVIDENCE.test(f.evidenceId || '') || !Object.hasOwn(SEVERITIES, f.code)) return blocked('UNTRUSTED_FINDING');
  if (typeof ports?.verifyBrainReceipt !== 'function') return blocked('BRAIN_PORT_MISSING');
  let receipt;
  try { receipt = validateVerifiedReceipt(f, await ports.verifyBrainReceipt(f), now); }
  catch { return blocked('BRAIN_PROOF_UNVERIFIED'); }
  if (NEVER_AUTO.has(f.code)) return response('HUMAN_REQUIRED', { severity, chainHalted: true, reason: 'NO_AUTOMATED_REMEDIATION' });
  if (REVIEW_CODES.has(f.code) && receipt.builderRoutingAllowed !== true)
    return blocked('BUILDER_ROUTE_NOT_AUTHORIZED');
  if (f.code === PROBE_CODE && receipt.readOnlyProbeAllowed !== true)
    return blocked('PROBE_NOT_AUTHORIZED');
  const id = await stableId(f);
  const fingerprint = JSON.stringify([f.code, f.resource, f.commit, f.evidenceId, receipt.receiptId]);
  let claim;
  try { claim = ledger.claim(id, fingerprint, f.code, severity, now); }
  catch (e) { return blocked(outcomeCode(e)); }
  if (claim.status !== 'CLAIMED') return response(claim.status, {
    severity, chainHalted: true, attempt: claim.attempt || 0, nextAttemptAt: claim.nextAttemptAt || null
  });
  let state = 'UNKNOWN', reason = 'UNVERIFIED_OR_UNKNOWN_OUTCOME';
  try {
    if (REVIEW_CODES.has(f.code)) {
      requireSafe(typeof ports?.routeBuilderReview === 'function', 'BRAIN_ROUTER_MISSING');
      const result = await ports.routeBuilderReview({
        receiptId: receipt.receiptId, repository: REPOSITORY, commit: f.commit,
        evidenceId: f.evidenceId, code: f.code, resource: f.resource,
        reviewOnly: true, autoMerge: false, deploy: false, retryBudget: 0
      });
      requireSafe(result?.accepted === true && result?.receiptId === receipt.receiptId &&
        result?.reviewOnly === true && result?.verifiedReadback === true,
      'BRAIN_ROUTING_UNVERIFIED');
      state = 'ROUTED'; reason = 'BUILDER_REVIEW_REQUESTED';
    } else {
      requireSafe(typeof ports?.readOnlyProbe === 'function', 'PROBE_PORT_MISSING');
      const result = await ports.readOnlyProbe({
        repository: REPOSITORY, resource: f.resource, commit: f.commit,
        evidenceId: f.evidenceId, readOnly: true
      });
      requireSafe(result?.verified === true && result?.readOnly === true &&
        result?.resource === f.resource, 'PROBE_EVIDENCE_UNVERIFIED');
      if (result.health === 'HEALTHY') { state = 'RECOVERED'; reason = 'READ_ONLY_HEALTH_VERIFIED'; }
      else if (result.health === 'TRANSIENT') {
        state = claim.attempt >= MAX_RECOVERY_ATTEMPTS ? 'CIRCUIT_OPEN' : 'WAITING';
        reason = state === 'CIRCUIT_OPEN' ? 'RETRY_LIMIT_EXHAUSTED' : 'TRANSIENT_HEALTH_FAILURE';
      } else { state = 'HUMAN_REQUIRED'; reason = 'NON_RETRYABLE_FAILURE'; }
    }
  } catch (e) {
    // An exception after an external call is ambiguous: NEVER silently retry it.
    reason = outcomeCode(e);
  }
  try {
    const final = ledger.finish(id, state, claim.attempt, reason, now);
    return response(final.state, { severity, reason, incidentId: id,
      attempt: claim.attempt, nextAttemptAt: final.nextAttemptAt,
      chainHalted: final.state !== 'RECOVERED' });
  } catch { return blocked('DURABLE_FINISH_UNCONFIRMED'); }
}