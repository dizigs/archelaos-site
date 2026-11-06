// Proposed private Brain -> Self-Heal signed sender. OFF / not wired to runtime.
// This is NOT a new coordinator or ledger. The caller must supply the existing
// canonical BrainCoordinator SQLite storage with SELFHEAL_SCHEMA installed.
// Never retry an UNKNOWN outcome; only independent durable readback can settle it.
import { Rejected } from './contract.mjs';
import { validateCiFinding } from './selfheal_recovery.mjs';

const REPO = 'dizigs/archelaos-site';
const SHA = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/;
const SCOPE = 'selfheal.recover';
const ISSUER = 'canonical-brain';

export const SELFHEAL_OUTBOX_SCHEMA = Object.freeze([
  'CREATE TABLE IF NOT EXISTS selfheal_signed_outbox(receipt_id TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE, claimed_at INTEGER NOT NULL, status TEXT NOT NULL CHECK(status = \'UNKNOWN\'))'
]);

const deny = code => { throw new Rejected(code, 423); };
const select = (sql, statement, ...params) => [...sql.exec(statement, ...params)];
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

function requireStaging(env, now) {
  const exp = Date.parse(env?.STAGING_EXPIRES_AT || '');
  const pinned = env?.BRAIN_SELFHEAL_APPROVED_SHA;
  if (!Number.isSafeInteger(now) || env?.ENVIRONMENT !== 'staging' ||
      env?.BRAIN_SELFHEAL_DISPATCH_ENABLED !== 'true' ||
      env?.BRAIN_SELFHEAL_RECOVERY_ENABLED !== 'true' ||
      env?.BRAIN_SELFHEAL_BINDING_ATTESTED !== 'true' ||
      !SHA.test(pinned || '') || pinned === '0'.repeat(40) ||
      pinned !== env?.DEPLOY_SHA ||
      !Number.isFinite(exp) || exp <= now || exp > now + 60 * 60_000 ||
      typeof env?.HEALER_EVENT_HMAC_KEY !== 'string' ||
      env.HEALER_EVENT_HMAC_KEY.length < 43 ||
      typeof env?.HEALER?.attemptRecovery !== 'function')
    deny('SELFHEAL_SIGNED_DISPATCH_DISABLED');
}

function claimFromCanonicalLedger(storage, receiptId, now, nonce) {
  if (!UUID.test(receiptId || '') || !/^[a-f0-9]{32}$/.test(nonce) ||
      typeof storage?.transactionSync !== 'function' ||
      typeof storage?.sql?.exec !== 'function')
    deny('CANONICAL_OUTBOX_UNAVAILABLE');
  return storage.transactionSync(() => {
    const sql = storage.sql;
    const proof = select(sql, 'SELECT * FROM selfheal_ci_proofs WHERE receipt_id=?', receiptId)[0];
    const controls = Object.fromEntries(select(sql,
      'SELECT name,value FROM controls WHERE name IN (?,?,?)',
      'global', 'ai', 'source:github').map(row => [row.name, row.value]));
    // Trust ONLY the provider-verified, durable Brain proof, never caller data.
    if (!proof || proof.source !== 'github_actions' ||
        proof.repository !== REPO || proof.code !== 'CI_FAILURE' ||
        proof.resource !== '/ci' || !SHA.test(proof.commit_sha || '') ||
        !/^actions:[1-9][0-9]{0,19}$/.test(proof.evidence_id || '') ||
        !HEX64.test(proof.evidence_digest || '') ||
        !Number.isSafeInteger(proof.run_attempt) || proof.run_attempt < 1 ||
        !Number.isSafeInteger(proof.issued) || !Number.isSafeInteger(proof.expires) ||
        proof.issued > now || proof.expires <= now || proof.expires > proof.issued + 4 * 60_000 ||
        controls.global !== 0 || controls.ai !== 1 || controls['source:github'] !== 1)
      deny('CANONICAL_CI_PROOF_OR_HALT_UNVERIFIED');
    // UNKNOWN is persisted BEFORE signing or contacting the other Worker.
    const existing = select(sql,
      'SELECT receipt_id FROM selfheal_signed_outbox WHERE receipt_id=?', receiptId)[0];
    if (existing) deny('SIGNED_DISPATCH_ALREADY_CLAIMED');
    const count = select(sql, 'SELECT COUNT(*) AS n FROM selfheal_signed_outbox')[0]?.n;
    if (!Number.isSafeInteger(count) || count >= 250) deny('SIGNED_DISPATCH_CAPACITY_REACHED');
    sql.exec('INSERT INTO selfheal_signed_outbox(receipt_id,nonce,claimed_at,status) VALUES(?,?,?,?)',
      receiptId, nonce, now, 'UNKNOWN');
    return {
      schemaVersion: 1, source: proof.source, repository: proof.repository,
      code: proof.code, resource: proof.resource, commit: proof.commit_sha,
      observedAt: new Date(now).toISOString(), evidenceId: proof.evidence_id
    };
  });
}

export async function signCanonicalRecoveryFinding(finding, secret, now, nonce) {
  if (typeof secret !== 'string' || secret.length < 43 ||
      !Number.isSafeInteger(now) || !/^[a-f0-9]{32}$/.test(nonce || ''))
    deny('SIGNED_ENVELOPE_MATERIAL_UNVERIFIED');
  // Revalidate identity and exact metadata independently before signing.
  const payload = JSON.stringify(validateCiFinding(finding, now));
  if (new TextEncoder().encode(payload).byteLength > 1200)
    deny('SIGNED_FINDING_TOO_LARGE');
  const data = [SCOPE, ISSUER, String(now), nonce, payload].join('\n');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(data))));
  return Object.freeze({schemaVersion:1,issuer:ISSUER,scope:SCOPE,
    issuedAtMs:now,nonce,payload,signature});
}

// Not exported through a public HTTP or private WorkerEntrypoint.
// No runtime caller is currently wired. A single RPC response is not proof
// of downstream durable readback; every outcome remains UNKNOWN by design.
export async function attemptOneSignedSelfHealDelivery(storage, env, receiptId, now = Date.now()) {
  requireStaging(env, now);
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const finding = claimFromCanonicalLedger(storage, receiptId, now, nonce);
  try {
    const envelope = await signCanonicalRecoveryFinding(finding,
      env.HEALER_EVENT_HMAC_KEY, now, nonce);
    await env.HEALER.attemptRecovery(envelope);
  } catch {
    return Object.freeze({status:'UNKNOWN',receiptId,needsIndependentReadback:true,
      safeToRetry:false,code:'HEALER_DELIVERY_UNVERIFIED'});
  }
  return Object.freeze({status:'UNKNOWN',receiptId,needsIndependentReadback:true,
    safeToRetry:false,code:'HEALER_DURABLE_ACK_NOT_ATTESTED'});
}
