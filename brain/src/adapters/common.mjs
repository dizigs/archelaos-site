import { digest, Rejected, validateEvent } from '../contract.mjs';

export class AdapterBlocked extends Error { constructor(code) { super(code); this.code = code; } }
export async function opaqueUuid(value) {
  const hash = await digest(value);
  return hash.slice(0, 8) + '-' + hash.slice(8, 12) + '-5' + hash.slice(13, 16) + '-8' + hash.slice(17, 20) + '-' + hash.slice(20, 32);
}
export async function metadataEvent(sourceType, sourceId, revision, deliveryId, metadata, now) {
  if (!metadata || !/^[0-9a-f]{64}$/.test(metadata.blobSha256)) throw new AdapterBlocked('VERIFIED_CONTENT_HASH_REQUIRED');
  const id = await opaqueUuid(sourceType + '|' + deliveryId + '|' + sourceId + '|' + revision);
  return validateEvent({ schemaVersion: 1, eventId: id, sourceType, sourceId: await digest(sourceType + '|' + sourceId), sourceRevision: await digest(revision), receivedAt: new Date(now).toISOString(), correlationId: await opaqueUuid('correlation|' + id), eventType: 'source.file.created', payload: { blobSha256: metadata.blobSha256, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes } }, sourceType, now);
}
export function enabled(config, dependencies, names) {
  if (config?.enabled !== true || config.authorizationVerified !== true) throw new AdapterBlocked('SOURCE_AUTHORIZATION_UNVERIFIED');
  if (names.some(name => typeof dependencies?.[name] !== 'function')) throw new AdapterBlocked('SOURCE_INTEGRATION_UNCONFIGURED');
}
export async function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || expected.length < 32 || actual.length > 512) return false;
  const a = await digest(actual); const b = await digest(expected); let diff = 0;
  for (let index = 0; index < 64; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
export async function deliver(event, dependencies) {
  const receipt = await dependencies.enqueue(event);
  if (!receipt || receipt.durable !== true || typeof receipt.receiptId !== 'string') throw new AdapterBlocked('DURABLE_RECEIPT_REQUIRED');
  return { receiptId: receipt.receiptId, duplicate: receipt.duplicate === true };
}
export function boundedPage(page) {
  if (!page || !Array.isArray(page.items) || page.items.length > 100) throw new Rejected('INVALID_SOURCE_PAGE', 422);
  return page.items;
}
