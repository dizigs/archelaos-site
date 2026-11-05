// Opt-in, source-scoped connector for the EXISTING Brain staging Worker.
// Integration library only: does not create or deploy a Worker.
import { validateEvent, UUID } from '../../brain/src/contract.mjs';

const TARGET = 'https://brain.internal'; // Cloudflare service binding, never public fetch.
const POLICY = Object.freeze({
  'archelaos-automation-bridge': {
    drive: ['source.file.created', 'source.file.updated'],
    gmail: ['source.message.received']
  },
  'archelaos-librarian-staging': {
    drive: ['source.file.created', 'source.file.updated'],
    news: ['news.search.completed']
  }
});
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const RECEIPT_KEY_ID = 'brain-capability-receipts-v1';
const SIGNED_AUDIENCES = Object.freeze({ delivery: 'source.receipt.ack.v1', readback: 'source.receipt.readback.v1' });
async function verifySourceEnvelope(envelope, sourceType, audience, verificationKey, now) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      envelope.schemaVersion !== 1 || envelope.audience !== audience ||
      envelope.principal !== sourceType + '-v1' || envelope.keyId !== RECEIPT_KEY_ID ||
      !Number.isSafeInteger(envelope.issuedAtMs) ||
      !Number.isFinite(now) || Math.abs(envelope.issuedAtMs - now) > 300000 ||
      typeof envelope.receiptSignature !== 'string' || !HEX64.test(envelope.receiptSignature)) {
    throw new IntegrationBlocked('RECEIPT_SIGNATURE_INVALID');
  }
  const { receiptSignature, ...signed } = envelope;
  const bytes = Uint8Array.from(receiptSignature.match(/../g), pair => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', encode(verificationKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const message = audience + '\n' + JSON.stringify(signed);
  if (!await crypto.subtle.verify('HMAC', key, bytes, encode(message))) {
    throw new IntegrationBlocked('RECEIPT_SIGNATURE_INVALID');
  }
  return signed;
}
const RECEIPT_STATES = new Set(['QUEUED', 'RUNNING', 'WAITING_REVIEW', 'DONE', 'RETRY_WAIT', 'DLQ', 'QUARANTINED']);
const encode = value => new TextEncoder().encode(value);

export class IntegrationBlocked extends Error {
  constructor(code) { super(code); this.name = 'IntegrationBlocked'; this.code = code; }
}
function requireUuid(value, code = 'INVALID_RECEIPT_ID') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new IntegrationBlocked(code);
}
async function limitedJson(response, max = 2048) {
  const reader = response.body?.getReader();
  if (!reader) throw new IntegrationBlocked('EMPTY_RESPONSE');
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) throw new IntegrationBlocked('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(length); let offset = 0;
  for (const c of chunks) { data.set(c, offset); offset += c.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
  catch { throw new IntegrationBlocked('INVALID_RESPONSE'); }
}
async function withDeadline(operation, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new IntegrationBlocked('UPSTREAM_TIMEOUT'));
      }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

export function createBrainWorkerAdapter({ workerName, sourceType, brainService, intakeKey, receiptVerificationKey,
  enabled = false, verifyProvenance, auditSink, expectedBrainCommit = null,
  clock = () => Date.now(), timeoutMs = 3000 }) {
  if (!Object.hasOwn(POLICY, workerName) || !Object.hasOwn(POLICY[workerName], sourceType))
    throw new IntegrationBlocked('SOURCE_NOT_APPROVED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000)
    throw new IntegrationBlocked('INVALID_TIMEOUT');

  function ready() {
    if (enabled !== true) throw new IntegrationBlocked('INTEGRATION_DISABLED');
    if (!brainService || typeof brainService.fetch !== 'function')
      throw new IntegrationBlocked('SERVICE_BINDING_MISSING');
    if (typeof intakeKey !== 'string' || intakeKey.length < 43)
      throw new IntegrationBlocked('BRAIN_INTAKE_KEY_MISSING');
    if (typeof receiptVerificationKey !== 'string' || receiptVerificationKey.length < 43)
      throw new IntegrationBlocked('RECEIPT_VERIFICATION_KEY_MISSING');
    if (typeof verifyProvenance !== 'function') throw new IntegrationBlocked('PROVENANCE_VERIFIER_MISSING');
    if (typeof auditSink !== 'function') throw new IntegrationBlocked('AUDIT_SINK_MISSING');
  }
  async function authorized(method, path, raw = '') {
    const ts = String(Math.floor(clock() / 1000));
    if (!/^\d{10}$/.test(ts)) throw new IntegrationBlocked('INVALID_CLOCK');
    const key = await crypto.subtle.importKey('raw', encode(intakeKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encode(`${method}\n${path}\n${ts}\n${raw}`));
    const hex = [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, '0')).join('');
    return new Request(TARGET + path, { method, headers: {
      'x-archelaos-key-id': sourceType + '-v1', 'x-archelaos-timestamp': ts,
      'x-archelaos-signature': hex, ...(method === 'POST' ? { 'content-type': 'application/json' } : {})
    }, ...(method === 'POST' ? { body: raw } : {}) });
  }
  async function invoke(method, path, raw) {
    const req = await authorized(method, path, raw);
    return withDeadline(signal => brainService.fetch(new Request(req, { signal })), timeoutMs);
  }
  async function audit(record) {
    try { if (await auditSink(Object.freeze({ worker: workerName, ...record })) !== true)
      throw new Error('uncommitted'); }
    catch { throw new IntegrationBlocked('AUDIT_UNAVAILABLE'); }
  }
  async function submitEvent(event) {
    ready();
    // Never manufacture hashes, provenance, or event IDs from unverified material.
    validateEvent(event, sourceType, clock());
    if (!POLICY[workerName][sourceType].includes(event.eventType))
      throw new IntegrationBlocked('EVENT_TYPE_NOT_APPROVED');
    const verified = await verifyProvenance(event);
    if (!verified || verified.verified !== true || verified.worker !== workerName ||
      verified.sourceType !== sourceType || verified.sourceId !== event.sourceId ||
      verified.sourceRevision !== event.sourceRevision ||
      verified.blobSha256 !== event.payload.blobSha256)
      throw new IntegrationBlocked('PROVENANCE_UNVERIFIED');
    const raw = JSON.stringify(event);
    if (encode(raw).byteLength > 4096) throw new IntegrationBlocked('BODY_TOO_LARGE');
    let response;
    try { response = await invoke('POST', '/v1/events', raw); }
    catch (error) {
      await audit({ kind: 'delivery', correlationId: event.correlationId,
        eventId: event.eventId, result: 'UNKNOWN', code: error.code || 'TRANSPORT_UNKNOWN' });
      throw new IntegrationBlocked('DELIVERY_OUTCOME_UNKNOWN'); // Do not retry an unknown commit.
    }
    if (response.status !== 200 && response.status !== 202) {
      await audit({ kind: 'delivery', correlationId: event.correlationId,
        eventId: event.eventId, result: 'REJECTED', status: response.status });
      throw new IntegrationBlocked('BRAIN_REJECTED');
    }
    let receipt;
    try { receipt = await limitedJson(response); }
    catch {
      // A malformed acknowledgement does not prove the Brain rejected the event:
      // preserve event identity for durable manual reconciliation, never retry.
      await audit({ kind: 'delivery', correlationId: event.correlationId,
        eventId: event.eventId, result: 'UNKNOWN', code: 'RECEIPT_UNVERIFIED' });
      throw new IntegrationBlocked('RECEIPT_UNVERIFIED');
    }
    try { receipt = await verifySourceEnvelope(receipt, sourceType, SIGNED_AUDIENCES.delivery, receiptVerificationKey, clock()); }
    catch {
      await audit({ kind: 'delivery', correlationId: event.correlationId,
        eventId: event.eventId, result: 'UNKNOWN', code: 'RECEIPT_SIGNATURE_INVALID' });
      throw new IntegrationBlocked('RECEIPT_SIGNATURE_INVALID');
    }
    if (!receipt || !UUID.test(receipt.receiptId || '') ||
      receipt.correlationId !== event.correlationId || receipt.eventId !== event.eventId ||
      receipt.durable !== true || receipt.duplicate !== (response.status === 200) ||
      !RECEIPT_STATES.has(receipt.status)) {
      await audit({ kind: 'delivery', correlationId: event.correlationId,
        eventId: event.eventId, result: 'UNKNOWN', code: 'RECEIPT_UNVERIFIED' });
      throw new IntegrationBlocked('RECEIPT_UNVERIFIED');
    }
    await audit({ kind: 'delivery', correlationId: event.correlationId,
      eventId: event.eventId, receiptId: receipt.receiptId,
      result: 'PERSISTED', duplicate: receipt.duplicate });
    return { receiptId: receipt.receiptId, correlationId: receipt.correlationId,
      eventId: receipt.eventId, status: receipt.status, duplicate: receipt.duplicate, durable: true };
  }
  async function readReceipt(receiptId, expectedCorrelationId) {
    ready(); requireUuid(receiptId); requireUuid(expectedCorrelationId, 'INVALID_CORRELATION_ID');
    let response;
    try { response = await invoke('GET', `/v1/source-receipts/${receiptId}`, ''); }
    catch { throw new IntegrationBlocked('READBACK_UNAVAILABLE'); }
    if (response.status !== 200) throw new IntegrationBlocked('READBACK_REJECTED');
    let data;
    try {
      data = await verifySourceEnvelope(await limitedJson(response), sourceType,
        SIGNED_AUDIENCES.readback, receiptVerificationKey, clock());
    } catch { throw new IntegrationBlocked('READBACK_UNVERIFIED'); }
    if (!data || data.durable !== true || data.receiptId !== receiptId || !UUID.test(data.correlationId || '') ||
      !Number.isSafeInteger(data.attempts) || data.attempts < 0 ||
      !RECEIPT_STATES.has(data.status) ||
      data.correlationId !== expectedCorrelationId)
      throw new IntegrationBlocked('READBACK_UNVERIFIED');
    await audit({ kind: 'readback', receiptId, correlationId: data.correlationId,
      result: 'VERIFIED', status: data.status });
    return { receiptId, correlationId: data.correlationId, status: data.status,
      attempts: data.attempts, code: typeof data.code === 'string' ? data.code : 'UNKNOWN' };
  }
  async function probeHealth() {
    if (!brainService || typeof brainService.fetch !== 'function')
      return { reachable: false, code: 'SERVICE_BINDING_MISSING', ready: false };
    try {
      const response = await withDeadline(signal => brainService.fetch(new Request(TARGET + '/healthz', { method: 'GET', signal })), timeoutMs);
      if (response.status !== 200) return { reachable: false, code: `HTTP_${response.status}`, ready: false };
      const body = await limitedJson(response);
      if (body?.service !== 'archelaos-brain' || body.environment !== 'staging' ||
        !HEX40.test(body.commit || '') || body.aiExecutionEnabled !== false ||
        (expectedBrainCommit !== null && body.commit !== expectedBrainCommit))
        return { reachable: false, code: 'HEALTH_IDENTITY_MISMATCH', ready: false };
      return { reachable: true, code: 'STAGING_HEALTH_ONLY', ready: false, commit: body.commit };
    } catch { return { reachable: false, code: 'HEALTH_UNAVAILABLE', ready: false }; }
  }
  return Object.freeze({ submitEvent, readReceipt, probeHealth });
}
