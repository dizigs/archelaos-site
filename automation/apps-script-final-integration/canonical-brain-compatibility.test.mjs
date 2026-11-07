import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiedAppsScriptEvent } from '../apps-script-brain-relay/src/relay.mjs';
import { validateEvent } from '../../brain/src/contract.mjs';

// This is a CANARY for current *main* contract incompatibility, not a
// production adapter or a proposed envelope transformation. It uses a
// synthetic receipt and never attempts to call a deployed Worker.
const OP = 'c87bf310-5124-48b4-a57c-871c8370d5ce';
const HASH = 'a'.repeat(64);
const REV = 'b'.repeat(64);
const PROOF = 'c'.repeat(64);
const NOW = Date.parse('2026-11-05T15:00:00.000Z');

const syntheticReceipt = () => ({
  operationId: OP,
  phase: 'SOURCE_READ_VERIFIED',
  sourceFingerprint: HASH,
  sourceRevision: REV,
  evidenceDigest: PROOF,
  observedAt: new Date(NOW).toISOString(),
  status: 'PROVIDER_VERIFIED'
});

test('actual merged #201 event is rejected by canonical Brain schema, not marked compatible', async () => {
  const event = await buildVerifiedAppsScriptEvent(syntheticReceipt(), NOW);
  assert.equal(event.source, 'apps_script');
  assert.equal(event.type, 'apps_script.source.read');
  assert.deepEqual(Object.keys(event).sort(), [
    'correlationId','eventId','metadata','observedAt','schemaVersion','source','sourceRevision','type'
  ].sort());
  // Brain requires sourceType/sourceId/receivedAt/eventType/payload, which is
  // a separate contract. A pass here would require explicit owner review.
  assert.throws(() => validateEvent(event, 'apps_script', NOW), {
    code: 'INVALID_ENVELOPE'
  });
});

test('even a synthetic canonical-shaped apps_script envelope is not an accepted Brain source', async () => {
  const event = await buildVerifiedAppsScriptEvent(syntheticReceipt(), NOW);
  const hypotheticalEnvelope = {
    schemaVersion: 1,
    eventId: event.eventId,
    sourceType: 'apps_script',
    sourceId: HASH,
    sourceRevision: REV,
    receivedAt: new Date(NOW).toISOString(),
    correlationId: OP,
    eventType: event.type,
    payload: { blobSha256: PROOF, mimeType: 'application/json', sizeBytes: 1 }
  };
  // This is deliberately NOT sent or exported as a relay transform.
  assert.throws(() => validateEvent(hypotheticalEnvelope, 'apps_script', NOW), {
    code: 'INVALID_IDENTITY'
  });
});
