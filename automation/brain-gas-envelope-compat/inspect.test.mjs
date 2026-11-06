import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { inspectAppsScriptIntake } from './inspect.mjs';

const now = Date.parse('2026-11-05T20:00:00Z');
const proof = Object.freeze({
  provider: 'google-apps-script', identityVerified: true, sourceHashVerified: true,
  encryptedBackupVerified: true, writerExclusionVerified: true,
  triggerInventoryVerified: true, signedApprovalVerified: true
});
const event = Object.freeze({
  schemaVersion: 1,
  eventId: '123e4567-e89b-42d3-a456-426614174000',
  sourceType: 'apps_script', sourceId: 'a'.repeat(64),
  sourceRevision: 'b'.repeat(64), receivedAt: new Date(now).toISOString(),
  correlationId: '123e4567-e89b-42d3-a456-426614174001',
  eventType: 'source.file.created',
  payload: { blobSha256: 'c'.repeat(64), mimeType: 'application/json', sizeBytes: 1 }
});
test('missing independent GAS proofs deny', () =>
  assert.equal(inspectAppsScriptIntake({event, proof: {}, now}).reason, 'GAS_PROOF_INCOMPLETE'));
test('cross-account writer exclusion must be verified', () =>
  assert.equal(inspectAppsScriptIntake({event, proof: {...proof, writerExclusionVerified: false}, now}).reason, 'GAS_PROOF_INCOMPLETE'));
test('requires opaque provider revision and source id', () =>
  assert.equal(inspectAppsScriptIntake({event: {...event, sourceRevision: 'rev-2'}, proof, now}).reason, 'INVALID_OPAQUE_IDENTIFIERS'));
test('rejects impersonated source type', () =>
  assert.equal(inspectAppsScriptIntake({event: {...event, sourceType: 'drive'}, proof, now}).reason, 'SOURCE_MISMATCH'));
test('canonical Brain source allowlist denies apps_script even with complete synthetic proof', () =>
  assert.equal(inspectAppsScriptIntake({event, proof, now}).reason, 'INVALID_IDENTITY'));
test('never claims readiness with invalid payload', () =>
  assert.equal(inspectAppsScriptIntake({event: {...event, payload: {}}, proof, now}).ready, false));
