// Private canonical Brain -> Self-Heal recovery event authentication.
// Exact signed bytes, independent durable nonce, no network or write authority.
import { parseFinding } from './policy.mjs';

const SCOPE = 'selfheal.recover';
const ISSUER = 'canonical-brain';
const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ENVELOPE_KEYS = new Set(['schemaVersion', 'issuer', 'scope', 'issuedAtMs', 'nonce', 'payload', 'signature']);

export class RecoveryAuthDenied extends Error {
  constructor(code) { super(code); this.name = 'RecoveryAuthDenied'; this.code = code; }
}
const deny = code => { throw new RecoveryAuthDenied(code); };
const isRecord = value => value && typeof value === 'object' &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export async function verifySignedRecoveryEvent(envelope, secret, nonces, now = Date.now()) {
  if (!isRecord(envelope) || Object.keys(envelope).length !== ENVELOPE_KEYS.size ||
      Object.keys(envelope).some(key => !ENVELOPE_KEYS.has(key)) ||
      envelope.schemaVersion !== 1 || envelope.issuer !== ISSUER || envelope.scope !== SCOPE ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(envelope.issuedAtMs) ||
      Math.abs(envelope.issuedAtMs - now) > 300_000 ||
      typeof envelope.nonce !== 'string' || !HEX32.test(envelope.nonce) ||
      typeof envelope.signature !== 'string' || !HEX64.test(envelope.signature) ||
      typeof envelope.payload !== 'string' ||
      new TextEncoder().encode(envelope.payload).length > 1200)
    deny('INVALID_RECOVERY_ENVELOPE');
  if (typeof secret !== 'string' || secret.length < 43 ||
      typeof nonces?.claim !== 'function') deny('RECOVERY_AUTH_UNAVAILABLE');
  const message = [SCOPE, ISSUER, String(envelope.issuedAtMs), envelope.nonce, envelope.payload].join('\n');
  let valid = false;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = Uint8Array.from(envelope.signature.match(/../g), pair => Number.parseInt(pair, 16));
    valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(message));
  } catch { deny('INVALID_RECOVERY_SIGNATURE'); }
  if (!valid) deny('INVALID_RECOVERY_SIGNATURE');
  let finding;
  try { finding = parseFinding(JSON.parse(envelope.payload), now); }
  catch { deny('INVALID_SIGNED_FINDING'); }
  let claimed;
  try { claimed = await nonces.claim(ISSUER + ':' + SCOPE, envelope.nonce, now + 300_001, now); }
  catch { deny('RECOVERY_NONCE_STORE_UNAVAILABLE'); }
  if (claimed !== true) deny('RECOVERY_REPLAY_DETECTED');
  return finding;
}
