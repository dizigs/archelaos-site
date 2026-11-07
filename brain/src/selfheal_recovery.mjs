// Scoped, reviewed evidence gate for the EXISTING canonical BrainCoordinator.
// Only the named private BrainRecoveryPort may call the verification path.
// This module never executes a repair, merges code, deploys, or invokes AI.
import { Rejected, digest } from './contract.mjs';


const REPO = 'dizigs/archelaos-site';
const RULESET = 26357426;
const REVIEW_FIELDS = ['receiptId','repository','commit','evidenceId','code','resource','reviewOnly','autoMerge','deploy','retryBudget','ledgerOwner','bindingScope','requiredCiHalted'];
const SHA = /^[a-f0-9]{40}$/;
const MAX_ROWS = 250;
const API = 'https://api.github.com/repos/' + REPO;
const MINUTE = 60_000;

export const SELFHEAL_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS selfheal_ci_proofs(receipt_id TEXT PRIMARY KEY,fingerprint TEXT UNIQUE NOT NULL,source TEXT NOT NULL,repository TEXT NOT NULL,commit_sha TEXT NOT NULL,evidence_id TEXT NOT NULL,resource TEXT NOT NULL,code TEXT NOT NULL,required_check TEXT NOT NULL,run_attempt INTEGER NOT NULL,evidence_digest TEXT NOT NULL,issued INTEGER NOT NULL,expires INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS selfheal_review_intents(receipt_id TEXT PRIMARY KEY,created INTEGER NOT NULL,status TEXT NOT NULL, FOREIGN KEY(receipt_id) REFERENCES selfheal_ci_proofs(receipt_id))',
  'CREATE TABLE IF NOT EXISTS selfheal_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,receipt_id TEXT NOT NULL,at INTEGER NOT NULL,code TEXT NOT NULL)'
];

function reject(code, status = 423) { throw new Rejected(code, status); }
function rows(sql, query, ...values) { return [...sql.exec(query, ...values)]; }
function exact(record, fields) {
  return record && typeof record === 'object' && !Array.isArray(record) &&
    Object.getPrototypeOf(record) === Object.prototype &&
    Object.keys(record).length === fields.length &&
    fields.every(key => Object.hasOwn(record, key));
}

export function validateCiFinding(input, now = Date.now()) {
  // Independently enforce the Self-Heal CI subset inside brain/**.
  // This self-contained validation is required for workerd's module sandbox:
  // importing ../../automation outside the Brain root prevents runtime startup.
  const fields = ['schemaVersion','source','repository','code','resource','commit','observedAt','evidenceId'];
  if (!exact(input, fields) || input.schemaVersion !== 1 ||
      input.repository !== REPO || input.source !== 'github_actions' ||
      input.code !== 'CI_FAILURE' || input.resource !== '/ci' ||
      !SHA.test(input.commit || '') ||
      !/^actions:[1-9][0-9]{0,19}$/.test(input.evidenceId || '') ||
      typeof input.observedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(input.observedAt)) {
    reject('SELFHEAL_FINDING_REJECTED', 422);
  }
  const observed = Date.parse(input.observedAt);
  if (!Number.isSafeInteger(now) || !Number.isFinite(observed) ||
      observed > now + 5 * MINUTE || observed < now - 7 * 86400_000 ||
      JSON.stringify(input).length > 1200) {
    reject('SELFHEAL_FINDING_STALE_OR_UNBOUNDED', 422);
  }
  return Object.freeze({
    schemaVersion:1, source:'github_actions',repository:REPO,code:'CI_FAILURE',
    resource:'/ci',commit:input.commit,evidenceId:input.evidenceId,observedAt:input.observedAt
  });
}

async function githubGet(path, token, fetchImpl) {
  if (typeof token !== 'string' || token.length < 43) reject('GITHUB_READ_CREDENTIAL_UNAVAILABLE', 503);
  if (typeof fetchImpl !== 'function') reject('GITHUB_READ_PORT_UNAVAILABLE', 503);
  let response;
  try {
    response = await fetchImpl(API + path, {
      method: 'GET', redirect: 'error', cache: 'no-store',
      headers: {
        authorization: 'Bearer ' + token,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'archelaos-brain-private-selfheal'
      },
      signal: AbortSignal.timeout(4000)
    });
  } catch { reject('GITHUB_PROVENANCE_UNAVAILABLE', 503); }
  if (response?.status !== 200) reject('GITHUB_PROVENANCE_UNAVAILABLE', 503);
  let data;
  try {
    const size = Number(response.headers?.get?.('content-length') || '0');
    if (size > 150000) reject('GITHUB_EVIDENCE_TOO_LARGE', 503);
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 150000) reject('GITHUB_EVIDENCE_TOO_LARGE', 503);
    data = JSON.parse(raw);
  } catch { reject('GITHUB_EVIDENCE_MALFORMED', 503); }
  return data;
}

export async function verifyRequiredCiFromGithub(input, {
  token, fetchImpl = fetch, now = Date.now()
} = {}) {
  const f = validateCiFinding(input, now);
  const runId = f.evidenceId.slice('actions:'.length);
  const run = await githubGet('/actions/runs/' + runId, token, fetchImpl);
  const runUpdated = Date.parse(run?.updated_at);
  if (String(run?.id) !== runId || run?.repository?.full_name !== REPO ||
      run?.head_sha !== f.commit || run?.status !== 'completed' ||
      run?.conclusion !== 'failure' || !Number.isSafeInteger(run?.run_attempt) ||
      run.run_attempt < 1 || !Number.isFinite(runUpdated) ||
      runUpdated > now + 5 * MINUTE || now - runUpdated > 20 * MINUTE) {
    reject('REQUIRED_CI_RUN_UNVERIFIED', 403);
  }
  const mainBranch = run.event === 'push' ? run.head_branch === 'main' :
    run.event === 'pull_request' && Array.isArray(run.pull_requests) &&
      run.pull_requests.some(pr => pr?.base?.ref === 'main' && pr?.head?.sha === f.commit);
  if (!mainBranch) reject('REQUIRED_CI_BRANCH_UNVERIFIED', 403);
  const ruleset = await githubGet('/rulesets/' + RULESET, token, fetchImpl);
  if (ruleset?.id !== RULESET || ruleset?.source !== REPO ||
      ruleset?.enforcement !== 'active' || ruleset?.target !== 'branch' ||
      !ruleset?.conditions?.ref_name?.include?.includes('~DEFAULT_BRANCH')) {
    reject('REQUIRED_CI_RULESET_UNVERIFIED', 403);
  }
  const requirements = ruleset.rules?.find(rule => rule.type === 'required_status_checks');
  const requiredNames = requirements?.parameters?.required_status_checks?.map(check => check.context);
  if (!Array.isArray(requiredNames) || requiredNames.length === 0 ||
      requiredNames.some(name => typeof name !== 'string' || name.length < 3)) {
    reject('REQUIRED_CI_RULESET_UNVERIFIED', 403);
  }
  const checks = await githubGet('/commits/' + f.commit + '/check-runs?per_page=100', token, fetchImpl);
  if (!Array.isArray(checks?.check_runs) || !Number.isSafeInteger(checks.total_count) ||
      checks.total_count !== checks.check_runs.length || checks.total_count > 100) {
    reject('REQUIRED_CI_CHECK_INVENTORY_INCOMPLETE', 403);
  }
  const check = checks.check_runs.find(item =>
    requiredNames.includes(item.name) && item.status === 'completed' &&
    item.conclusion === 'failure' && item.check_suite?.id === run.check_suite_id &&
    Number.isSafeInteger(item.id) && item.id > 0);
  if (!check) reject('REQUIRED_CI_FAILURE_NOT_CONFIRMED', 403);
  const evidenceDigest = await digest(JSON.stringify({
    repository: REPO, sha: f.commit, runId, runAttempt: run.run_attempt,
    checkId: check.id, checkName: check.name, rulesetId: RULESET
  }));
  return Object.freeze({ verified: true, runAttempt: run.run_attempt,
    requiredCheck: check.name, evidenceDigest, observedAtMs: runUpdated });
}

function proofView(row, controlState, now) {
  const halted = controlState.sourcePaused?.github === true;
  if (controlState.globalPaused || !halted || row.expires <= now)
    reject('SELFHEAL_BRAIN_HALT_OR_RECEIPT_UNVERIFIED', 423);
  return {
    verified: true, issuer: 'central-brain', bindingScope: 'selfheal.recover',
    repository: row.repository, source: row.source,
    code: row.code, resource: row.resource, commit: row.commit_sha,
    evidenceId: row.evidence_id, receiptId: row.receipt_id,
    expiresAtMs: row.expires, provenanceVerified: true,
    killSwitchesVerified: true, paused: false, incidentAuthorized: true,
    repairWritesAllowed: false, builderRoutingAllowed: true,
    readOnlyProbeAllowed: false,
    requiredCi: {
      verdict: 'FAILED', required: true, commit: row.commit_sha,
      evidenceId: row.evidence_id, runAttempt: row.run_attempt,
      chainHaltReadback: halted
    }
  };
}

export async function recordVerifiedCi(storage, input, evidence, now = Date.now()) {
  const f = validateCiFinding(input, now);
  if (evidence?.verified !== true || !Number.isSafeInteger(evidence.runAttempt) ||
      evidence.runAttempt < 1 || typeof evidence.requiredCheck !== 'string' ||
      evidence.requiredCheck.length < 3 || !/^[a-f0-9]{64}$/.test(evidence.evidenceDigest || '') ||
      !Number.isFinite(evidence.observedAtMs) ||
      now - evidence.observedAtMs > 20 * MINUTE ||
      evidence.observedAtMs > now + 5 * MINUTE) reject('SELFHEAL_PROVIDER_EVIDENCE_INVALID', 403);
  const fingerprint = await digest([f.repository,f.commit,f.evidenceId,f.code,f.resource].join('|'));
  return storage.transactionSync(() => {
    const sql = storage.sql;
    const global = rows(sql, 'SELECT value FROM controls WHERE name=?', 'global')[0];
    if (global?.value !== 0) reject('SELFHEAL_GLOBAL_PAUSED', 423);
    const existing = rows(sql, 'SELECT * FROM selfheal_ci_proofs WHERE fingerprint=?', fingerprint)[0];
    if (!existing) {
      const total = rows(sql, 'SELECT COUNT(*) AS n FROM selfheal_ci_proofs')[0]?.n;
      if (!Number.isSafeInteger(total) || total >= MAX_ROWS) reject('SELFHEAL_CAPACITY_REACHED', 429);
      const source = rows(sql, 'SELECT value FROM controls WHERE name=?', 'source:github')[0];
      if (source?.value !== 1) {
        sql.exec('INSERT INTO controls(name,value) VALUES(?,1) ON CONFLICT(name) DO UPDATE SET value=1',
          'source:github');
        sql.exec('UPDATE controls SET value=value+1 WHERE name=?', 'revision');
        const revision = rows(sql, 'SELECT value FROM controls WHERE name=?', 'revision')[0]?.value;
        sql.exec('INSERT INTO control_audit(at,code,revision,scope) VALUES(?,?,?,?)',
          now, 'SELFHEAL_REQUIRED_CI_CHAIN_HALTED', revision, 'source:github');
      }
      const receiptId = crypto.randomUUID();
      sql.exec('INSERT INTO selfheal_ci_proofs(receipt_id,fingerprint,source,repository,commit_sha,evidence_id,resource,code,required_check,run_attempt,evidence_digest,issued,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        receiptId, fingerprint, f.source, f.repository, f.commit, f.evidenceId, f.resource, f.code,
        evidence.requiredCheck, evidence.runAttempt, evidence.evidenceDigest, now, now + 4 * MINUTE);
      sql.exec('INSERT INTO selfheal_audit(receipt_id,at,code) VALUES(?,?,?)',
        receiptId, now, 'REQUIRED_CI_PROVENANCE_VERIFIED');
    } else if (existing.evidence_digest !== evidence.evidenceDigest ||
               existing.run_attempt !== evidence.runAttempt ||
               existing.expires <= now) {
      reject('SELFHEAL_RECEIPT_CONFLICT_OR_EXPIRED', 409);
    }
    const row = rows(sql, 'SELECT * FROM selfheal_ci_proofs WHERE fingerprint=?', fingerprint)[0];
    const sourceHalted = rows(sql, 'SELECT value FROM controls WHERE name=?', 'source:github')[0]?.value === 1;
    return proofView(row, {
      globalPaused: rows(sql, 'SELECT value FROM controls WHERE name=?', 'global')[0]?.value === 1,
      sourcePaused: { github: sourceHalted }
    }, now);
  });
}

export function storeSelfHealReview(storage, plan, controlState, now = Date.now()) {
  if (!exact(plan, REVIEW_FIELDS) || plan.repository !== REPO ||
      !SHA.test(plan.commit || '') || plan.code !== 'CI_FAILURE' ||
      plan.resource !== '/ci' || plan.reviewOnly !== true ||
      plan.autoMerge !== false || plan.deploy !== false || plan.retryBudget !== 0 ||
      plan.ledgerOwner !== 'canonical-brain' || plan.bindingScope !== 'selfheal.recover' ||
      plan.requiredCiHalted !== true) {
    reject('SELFHEAL_REVIEW_SCOPE_REJECTED', 422);
  }
  return storage.transactionSync(() => {
    const sql = storage.sql;
    const row = rows(sql, 'SELECT * FROM selfheal_ci_proofs WHERE receipt_id=?', plan.receiptId)[0];
    if (!row || row.repository !== plan.repository || row.commit_sha !== plan.commit ||
        row.evidence_id !== plan.evidenceId || row.code !== plan.code ||
        row.resource !== plan.resource) reject('SELFHEAL_RECEIPT_MISMATCH', 403);
    proofView(row, controlState, now);
    const previous = rows(sql, 'SELECT * FROM selfheal_review_intents WHERE receipt_id=?', row.receipt_id)[0];
    if (!previous) {
      sql.exec('INSERT INTO selfheal_review_intents(receipt_id,created,status) VALUES(?,?,?)',
        row.receipt_id, now, 'PENDING_MANUAL_REVIEW');
      sql.exec('INSERT INTO selfheal_audit(receipt_id,at,code) VALUES(?,?,?)',
        row.receipt_id, now, 'REVIEW_INTENT_ONLY_NO_EXECUTION');
    } else if (previous.status !== 'PENDING_MANUAL_REVIEW') {
      reject('SELFHEAL_REVIEW_RECONCILIATION_REQUIRED', 409);
    }
    const saved = rows(sql, 'SELECT status FROM selfheal_review_intents WHERE receipt_id=?', row.receipt_id)[0];
    if (saved?.status !== 'PENDING_MANUAL_REVIEW') reject('SELFHEAL_REVIEW_READBACK_UNVERIFIED', 503);
    return {accepted:true, receiptId:row.receipt_id, verifiedReadback:true,
      reviewOnly:true, ledgerOwner:'canonical-brain', requiredCiHaltedReadback:true,
      autoMergeAllowed:false, deployAllowed:false, aiCalls:0, status:saved.status,
      duplicate:Boolean(previous)};
  });
}

export function deniedHealthProbe(probe) {
  // A probe contains NO receiptId and cannot establish evidence provenance.
  // Do not mark website health as independently verified from caller metadata.
  return {verified:false, readOnly:true,
    resource:typeof probe?.resource === 'string' ? probe.resource : null,
    health:'NON_RETRYABLE', code:'SELFHEAL_HEALTH_PROVENANCE_NOT_IMPLEMENTED'};
}
