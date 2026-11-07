// Isolated security admission layer. No provider transport, secret persistence or deployment.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX = /^[0-9a-f]{64}$/;
const NONCE = /^[0-9a-f]{32}$/;
const KEY_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SOURCE = new Set(['staging', 'drive', 'gmail', 'site', 'github', 'news']);
const trusted = new WeakSet();
const admitted = new WeakMap();
const claimed = new WeakSet();
const admissionAttempted = new WeakSet();
const terminalOutcomes = new WeakSet();

export class GuardDenied extends Error {
  constructor(code, status = 403) { super(code); this.name = 'GuardDenied'; this.code = code; this.status = status; }
}
const reject = (code, status) => { throw new GuardDenied(code, status); };
const safeCode = s => typeof s === 'string' && /^[A-Z0-9_]{1,60}$/.test(s) ? s : 'UNCLASSIFIED';
const safeId = s => typeof s === 'string' && (UUID.test(s) || HEX.test(s)) ? s : null;

export function createMonitor(write, clock = Date.now) {
  if (typeof write !== 'function') throw new TypeError('Log sink required');
  const counters = { admitted: 0, denied: 0, retries: 0, failed: 0, completed: 0 };
  const latencyBuckets = { lt100: 0, lt1000: 0, lt10000: 0, gte10000: 0 };
  function record({ status, code, correlationId, receiptId, attempt = 0, latencyMs = 0 } = {}) {
    const allowed = new Set(['ADMITTED', 'DENIED', 'RETRY', 'FAILED', 'COMPLETED']);
    if (!allowed.has(status) || !Number.isSafeInteger(attempt) || attempt < 0 || attempt > 20 ||
        !Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 3600000) reject('INVALID_TELEMETRY', 422);
    const key = ({ ADMITTED: 'admitted', DENIED: 'denied', RETRY: 'retries', FAILED: 'failed', COMPLETED: 'completed' })[status];
    counters[key]++;
    latencyBuckets[latencyMs < 100 ? 'lt100' : latencyMs < 1000 ? 'lt1000' : latencyMs < 10000 ? 'lt10000' : 'gte10000']++;
    // Strict output allowlist: never serialize caller payload, headers, tokens, errors or prompts.
    const line = {
      service: 'archelaos-brain-security', at: new Date(clock()).toISOString(),
      status, code: safeCode(code), correlationId: safeId(correlationId),
      receiptId: safeId(receiptId), attempt, latencyMs: Math.round(latencyMs)
    };
    write(JSON.stringify(line));
    return line;
  }
  return { record, snapshot: () => ({
    counters: { ...counters }, latencyBuckets: { ...latencyBuckets }
  }) };
}

export async function verifySignedTask(request, body, keyring, nonceStore, now = Date.now()) {
  if (!(request instanceof Request) || typeof body !== 'string' || body.length > 32768 ||
      !keyring || typeof keyring.resolve !== 'function' || !nonceStore || typeof nonceStore.claim !== 'function')
    reject('AUTH_UNAVAILABLE', 401);
  const timestamp = request.headers.get('x-archelaos-timestamp') || '';
  const signature = request.headers.get('x-archelaos-signature') || '';
  const nonce = request.headers.get('x-archelaos-nonce') || '';
  const keyId = request.headers.get('x-archelaos-key-id') || '';
  const seconds = Number(timestamp);
  if (!/^[0-9]{10}$/.test(timestamp) || !HEX.test(signature) || !NONCE.test(nonce) ||
      !KEY_ID.test(keyId) || !Number.isFinite(now) || Math.abs(now - seconds * 1000) > 300000)
    reject('UNAUTHORIZED', 401);
  let identity;
  try { identity = await keyring.resolve(keyId); } catch { reject('AUTH_UNAVAILABLE', 401); }
  if (!identity || typeof identity.secret !== 'string' || identity.secret.length < 43 ||
      !Array.isArray(identity.permissions) || !Array.isArray(identity.sources))
    reject('UNAUTHORIZED', 401);
  const url = new URL(request.url);
  const signed = [request.method, url.pathname + url.search, timestamp, nonce, body].join('\n');
  let ok = false;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(identity.secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signatureBytes = Uint8Array.from(signature.match(/../g), x => Number.parseInt(x, 16));
    ok = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(signed));
  } catch { reject('UNAUTHORIZED', 401); }
  if (!ok) reject('UNAUTHORIZED', 401);
  let payload;
  try { payload = JSON.parse(body); } catch { reject('INVALID_SIGNED_PAYLOAD', 422); }
  if (!payload || payload.schemaVersion !== 1 || !UUID.test(payload.correlationId) ||
      !SOURCE.has(payload.sourceType) || !payload.charge || typeof payload.charge !== 'object' ||
      !HEX.test(payload.charge.reservationId))
    reject('INVALID_SIGNED_PAYLOAD', 422);
  if (!identity.permissions.includes('ai.invoke') || !identity.sources.includes(payload.sourceType))
    reject('FORBIDDEN_SCOPE', 403);
  let fresh;
  try { fresh = await nonceStore.claim(keyId, nonce, now + 300001, now); }
  catch { reject('REPLAY_STORE_UNAVAILABLE', 503); }
  if (fresh !== true) reject('REPLAY_DETECTED', 409);
  const context = Object.freeze({ source: payload.sourceType, correlationId: payload.correlationId, charge: Object.freeze({ ...payload.charge }) });
  trusted.add(context);
  return context;
}

function requireTrusted(context) {
  if (!context || !trusted.has(context)) reject('UNTRUSTED_AUTH_CONTEXT', 403);
}
async function controlsHealthy(readControls, source) {
  if (typeof readControls !== 'function') return false;
  try {
    const c = await readControls();
    return c && c.globalPaused === false && c.aiPaused === false &&
      c.sourcePaused && typeof c.sourcePaused === 'object' &&
      Object.hasOwn(c.sourcePaused, source) && c.sourcePaused[source] === false;
  } catch { return false; }
}
const stop = (code, monitor, ctx, now, start) => {
  monitor?.record({ status: 'DENIED', code, correlationId: ctx?.correlationId,
    latencyMs: Math.max(0, now() - start) });
  return { status: 'DENIED', code, providerCalls: 0 };
};

export async function admitTask(context, ports, policy = {}, now = Date.now) {
  const start = now();
  try { requireTrusted(context); }
  catch { return stop('UNTRUSTED_AUTH_CONTEXT', ports?.monitor, context, now, start); }
  const denial = code => stop(code, ports?.monitor, context, now, start);
  // Never re-admit a signed identity after an ambiguous reserve/alert outcome.
  // A new operation requires a fresh signed event and canonical durable id.
  if (admissionAttempted.has(context)) return denial('TASK_ADMISSION_REPLAY');
  admissionAttempted.add(context);
  // Only the Brain's single durable ledger may be injected. No local balances.
  if (policy.enabled !== true || policy.coverageConfirmed !== true || policy.mode !== 'guarded' ||
      policy.monthlyMicroEur !== 20000000) return denial('AI_DISABLED_OR_COVERAGE_UNVERIFIED');
  if (!ports?.rate || !ports?.breaker || !ports?.ledger || !ports?.alerts ||
      typeof ports.rate.consume !== 'function' || typeof ports.breaker.before !== 'function' ||
      typeof ports.ledger.reserve !== 'function' || typeof ports.alerts.deliverOnce !== 'function')
    return denial('SECURITY_PORT_UNAVAILABLE');
  if (!await controlsHealthy(ports.readControls, context.source)) return denial('KILL_SWITCH_OR_CONTROLS_UNAVAILABLE');
  try {
    if (await ports.rate.consume('ai:' + context.source, now()) !== true) return denial('RATE_LIMITED');
    if (await ports.breaker.before('provider:' + context.charge.provider, now()) !== true) return denial('CIRCUIT_OPEN');
  } catch { return denial('SECURITY_STORE_UNAVAILABLE'); }
  let reservation;
  try { reservation = await ports.ledger.reserve(context.charge); }
  catch { return denial('LEDGER_UNAVAILABLE_OR_INSUFFICIENT'); }
  if (!reservation || reservation.duplicate === true || !Number.isSafeInteger(reservation.amountMicroEur) ||
      reservation.amountMicroEur < 1 || reservation.amountMicroEur > policy.monthlyMicroEur)
    return denial('RESERVATION_RECONCILIATION_REQUIRED');
  try {
    for (const t of reservation.alerts || [])
      if (![75, 90].includes(t) || await ports.alerts.deliverOnce('ai:' + reservation.month + ':' + t, t) !== true)
        return denial('ALERT_DELIVERY_UNCONFIRMED');
    for (const t of reservation.providerAlerts || [])
      if (![75, 90].includes(t) || await ports.alerts.deliverOnce('provider:' + reservation.month + ':' + t, t) !== true)
        return denial('ALERT_DELIVERY_UNCONFIRMED');
  } catch { return denial('ALERT_DELIVERY_UNCONFIRMED'); }
  if (!await controlsHealthy(ports.readControls, context.source)) return denial('PAUSED_AFTER_RESERVATION');
  admitted.set(context, context.charge.reservationId);
  ports.monitor?.record({ status: 'ADMITTED', code: 'BUDGET_RESERVED', correlationId: context.correlationId,
    latencyMs: Math.max(0, now() - start) });
  return { status: 'RESERVED', reservationId: context.charge.reservationId,
    amountMicroEur: reservation.amountMicroEur, providerCalls: 0 };
}

export async function claimAuthorizedCall(context, ports) {
  try { requireTrusted(context); } catch { return { authorized: false, code: 'UNTRUSTED_AUTH_CONTEXT' }; }
  const id = admitted.get(context);
  if (!id || claimed.has(context)) return { authorized: false, code: 'NOT_ADMITTED_OR_ALREADY_CLAIMED' };
  if (!await controlsHealthy(ports?.readControls, context.source)) return { authorized: false, code: 'KILL_SWITCH_OR_CONTROLS_UNAVAILABLE' };
  try {
    const result = await ports.ledger.claim(id);
    if (result?.authorized !== true) return { authorized: false, code: 'LEDGER_CLAIM_REJECTED' };
    claimed.add(context);
    return { authorized: true, reservationId: id };
  } catch { return { authorized: false, code: 'LEDGER_CLAIM_UNAVAILABLE' }; }
}

export async function settleVerifiedCall(context, ports, evidence, now = Date.now) {
  try { requireTrusted(context); } catch { return { settled: false, code: 'UNTRUSTED_AUTH_CONTEXT' }; }
  if (terminalOutcomes.has(context)) return { settled: false, code: 'OUTCOME_ALREADY_RECORDED' };
  if (!claimed.has(context) || !admitted.has(context) || evidence?.billingEvidenceVerified !== true ||
      !Number.isSafeInteger(evidence.actualMicroEur) || evidence.actualMicroEur < 0)
    return { settled: false, code: 'USAGE_RECONCILIATION_REQUIRED' };
  try {
    await ports.ledger.settle(admitted.get(context), evidence.actualMicroEur);
    await ports.breaker.record('provider:' + context.charge.provider, true, now());
    terminalOutcomes.add(context);
    ports.monitor?.record({ status: 'COMPLETED', code: 'USAGE_SETTLED', correlationId: context.correlationId,
      latencyMs: evidence.latencyMs ?? 0 });
    return { settled: true };
  } catch { return { settled: false, code: 'SETTLEMENT_UNCONFIRMED' }; }
}

export async function recordFailedCall(context, ports, now = Date.now) {
  try { requireTrusted(context); } catch { return { recorded: false }; }
  if (!claimed.has(context) || terminalOutcomes.has(context)) return { recorded: false };
  try {
    await ports.breaker.record('provider:' + context.charge.provider, false, now());
    terminalOutcomes.add(context);
    ports.monitor?.record({ status: 'FAILED', code: 'PROVIDER_OUTCOME_UNKNOWN', correlationId: context.correlationId });
    // Reservation is deliberately NOT refunded: uncertain provider charges require reconciliation.
    return { recorded: true, reservationHeld: true };
  } catch { return { recorded: false, reservationHeld: true }; }
}
