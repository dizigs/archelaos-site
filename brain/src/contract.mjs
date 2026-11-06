export class Rejected extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const HEX = /^[0-9a-f]{64}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TYPES = new Set(['staging', 'drive', 'gmail', 'site', 'github', 'news']);
const SOURCE_EVENTS = Object.freeze({
  drive: new Set(['source.file.created', 'source.file.updated']),
  // Existing brain/src/adapters/common.mjs still emits a verified
  // source.file.created metadata event for several legacy source readers.
  // This is SOURCE_REVIEW, never a fabricated CI failure or news result.
  gmail: new Set(['source.file.created', 'source.message.received']),
  site: new Set(['source.file.created', 'site.contribution.received']),
  github: new Set(['source.file.created', 'github.ci.failed']),
  news: new Set(['source.file.created', 'news.search.completed'])
});
export function validateSourceEventType(source, eventType) {
  if (source !== 'staging' && !SOURCE_EVENTS[source]?.has(eventType))
    throw new Rejected('SOURCE_EVENT_NOT_ALLOWED', 403);
}
const MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/json']);
const encoder = new TextEncoder();
export const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value instanceof Uint8Array ? value : encoder.encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
export function reply(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
export function validateEvent(event, sourceType, now = Date.now()) {
  const fields = ['schemaVersion', 'eventId', 'sourceType', 'sourceId', 'sourceRevision', 'receivedAt', 'correlationId', 'eventType', 'payload'];
  if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).length !== fields.length || fields.some(key => !Object.hasOwn(event, key))) throw new Rejected('INVALID_ENVELOPE', 422);
  if (event.schemaVersion !== 1 || !UUID.test(event.eventId) || !UUID.test(event.correlationId) || !TYPES.has(event.sourceType) || event.sourceType !== sourceType) throw new Rejected('INVALID_IDENTITY', 422);
  if (!HEX.test(event.sourceId) || !HEX.test(event.sourceRevision)) throw new Rejected('OPAQUE_SOURCE_IDS_REQUIRED', 422);
  if (typeof event.eventType !== 'string' || !/^[a-z][a-z0-9.]{2,63}$/.test(event.eventType)) throw new Rejected('INVALID_EVENT_TYPE', 422);

  if (typeof event.receivedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(event.receivedAt)) throw new Rejected('INVALID_EVENT_TIME', 422);
  const time = Date.parse(event.receivedAt);
  if (!Number.isFinite(time) || time > now + 300000 || time < now - 7 * 86400000) throw new Rejected('STALE_EVENT', 422);
  const payload = event.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 3 || !['blobSha256', 'mimeType', 'sizeBytes'].every(key => Object.hasOwn(payload, key)) || !HEX.test(payload.blobSha256) || !MIME.has(payload.mimeType) || !Number.isSafeInteger(payload.sizeBytes) || payload.sizeBytes < 1 || payload.sizeBytes > 50 * 1024 * 1024) throw new Rejected('INVALID_METADATA', 422);
  return { ...event, payload: { blobSha256: payload.blobSha256, mimeType: payload.mimeType, sizeBytes: payload.sizeBytes } };
}
/**
 * Reject reuse across private source principals and the response receipt signer.
 * Report only a generic configuration error, never a secret or principal name.
 */
export function assertDistinctPrincipalSecrets(env) {
  const values = [
    env.STAGING_INTAKE_KEY, env.STAGING_OPERATOR_KEY,
    env.BRAIN_ANALYTICS_INTAKE_KEY, env.BRAIN_APPS_SCRIPT_INTAKE_KEY,
    env.BRAIN_DRIVE_INTAKE_KEY, env.BRAIN_GMAIL_INTAKE_KEY,
    env.BRAIN_NEWS_INTAKE_KEY, env.BRAIN_SITE_INTAKE_KEY,
    env.BRAIN_GITHUB_INTAKE_KEY, env.BRAIN_CAPABILITY_RECEIPT_KEY
  ].filter(value => typeof value === 'string' && value.length >= 43);
  if (new Set(values).size !== values.length)
    throw new Rejected('PRINCIPAL_SECRET_COLLISION', 503);
}

export async function authenticate(request, env, raw, now = Date.now()) {
  assertDistinctPrincipalSecrets(env);
  const timestamp = request.headers.get('x-archelaos-timestamp') || '';
  const signature = request.headers.get('x-archelaos-signature') || '';
  const identity = request.headers.get('x-archelaos-key-id');
  const secret = identity === 'staging-v1' ? env.STAGING_INTAKE_KEY :
    identity === 'operator-v1' ? env.STAGING_OPERATOR_KEY :
    identity === 'analytics-v1' ? env.BRAIN_ANALYTICS_INTAKE_KEY :
    identity === 'apps-script-v1' ? env.BRAIN_APPS_SCRIPT_INTAKE_KEY :
    identity === 'drive-v1' ? env.BRAIN_DRIVE_INTAKE_KEY :
    identity === 'gmail-v1' ? env.BRAIN_GMAIL_INTAKE_KEY :
    identity === 'news-v1' ? env.BRAIN_NEWS_INTAKE_KEY :
    identity === 'site-v1' ? env.BRAIN_SITE_INTAKE_KEY :
    identity === 'github-v1' ? env.BRAIN_GITHUB_INTAKE_KEY : null;
  if (!/^\d{10}$/.test(timestamp) || !HEX.test(signature) || Math.abs(now - Number(timestamp) * 1000) > 300000 || typeof secret !== 'string' || secret.length < 43) throw new Rejected('UNAUTHORIZED', 401);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const message = request.method + '\n' + new URL(request.url).pathname + '\n' + timestamp + '\n' + raw;
  const bytes = Uint8Array.from(signature.match(/../g), pair => Number.parseInt(pair, 16));
  if (!await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(message))) throw new Rejected('UNAUTHORIZED', 401);
  return identity === 'operator-v1' ? 'operator' :
    identity === 'analytics-v1' ? 'analytics' :
    identity === 'apps-script-v1' ? 'apps_script' :
    identity === 'drive-v1' ? 'drive' :
    identity === 'gmail-v1' ? 'gmail' :
    identity === 'news-v1' ? 'news' :
    identity === 'site-v1' ? 'site' :
    identity === 'github-v1' ? 'github' : 'staging';
}
/** Readback validation errors reflect corrupted storage, never fresh client input. */
export function validateStoredEvent(event, sourceType) {
  try { return validateEvent(event, sourceType, Date.parse(event?.receivedAt)); }
  catch (error) {
    if (error instanceof Rejected) throw new Rejected('SOURCE_RECEIPT_CORRUPT', 503);
    throw error;
  }
}

/**
 * Reserve job capacity for active execution only. Retain finished/reviewed jobs
 * and every historical event_key for deduplication and immutable readback.
 */
export function enforceDurableJobCapacity(sql, existing) {
  if (existing) return;
  const count = [...sql.exec(
    "SELECT (SELECT COUNT(*) FROM jobs WHERE status IN ('QUEUED','RETRY_WAIT','RUNNING')) AS jobs," +
    " (SELECT COUNT(*) FROM event_keys WHERE job_id IN" +
    " (SELECT id FROM jobs WHERE status IN ('QUEUED','RETRY_WAIT','RUNNING'))) AS keys"
  )][0];
  if (!count || !Number.isSafeInteger(count.jobs) || !Number.isSafeInteger(count.keys))
    throw new Rejected('DURABLE_CAPACITY_UNAVAILABLE', 503);
  if (count.jobs >= 2000 || count.keys + 3 > 20000)
    throw new Rejected('DURABLE_CAPACITY_REACHED', 429);
}

export async function boundedBody(request) {
  if (request.headers.get('content-length') && Number(request.headers.get('content-length')) > 4096) throw new Rejected('BODY_TOO_LARGE', 413);
  if (!request.body) return '';
  const reader = request.body.getReader(); const parts = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 4096) { await reader.cancel(); throw new Rejected('BODY_TOO_LARGE', 413); }
    parts.push(value);
  }
  const merged = new Uint8Array(size); let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.byteLength; }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(merged); }
  catch { throw new Rejected('INVALID_UTF8', 422); }
}
export function route(event) {
  if (event.eventType.startsWith('staging.retry.')) return 'STAGING_RETRY_TEST';
  if (['source.file.created', 'source.file.updated', 'source.message.received', 'site.contribution.received'].includes(event.eventType)) return event.payload.mimeType === 'application/pdf' ? 'HISTORICAL_REVIEW' : 'SOURCE_REVIEW';
  if (event.eventType === 'github.ci.failed') return 'TECHNICAL_REVIEW';
  if (event.eventType === 'news.search.completed') return 'NEWS_REVIEW';
  return 'QUARANTINE';
}
