import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../automation/apps-script/templates/ArchelaosTriggerInventory.gs', import.meta.url), 'utf8');

function fixture(triggers) {
  const calls = { reads: 0, writes: 0, ids: 0 };
  const sandbox = {
    ScriptApp: {
      getProjectTriggers() { calls.reads++; return triggers; },
      newTrigger() { calls.writes++; throw Error('WRITE_FORBIDDEN'); },
      deleteTrigger() { calls.writes++; throw Error('WRITE_FORBIDDEN'); }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(algorithm, data, charset) {
        assert.equal(algorithm, 'SHA_256');
        assert.equal(charset, 'UTF_8');
        return [...createHash('sha256').update(data, 'utf8').digest()].map(x => x > 127 ? x - 256 : x);
      }
    }
  };
  const inspect = () => runInNewContext(source + '\narchelaosTriggerInventoryV1()', sandbox);
  return { inspect, calls };
}
function trigger(handler, type = 'CLOCK', source = 'CLOCK') {
  return {
    getHandlerFunction: () => handler,
    getEventType: () => type,
    getTriggerSource: () => source,
    getTriggerSourceId() { throw Error('SOURCE_ID_MUST_NOT_BE_READ'); },
    getUniqueId() { throw Error('UNIQUE_ID_MUST_NOT_BE_READ'); }
  };
}

test('Apps Script .gs template inventories current-account triggers without side effects', () => {
  const first = fixture([trigger('runDaily'), trigger('syncMuseum')]);
  const second = fixture([trigger('syncMuseum'), trigger('runDaily')]);
  const a = first.inspect(), b = second.inspect();
  assert.equal(a.status, 'PARTIAL_TRIGGER_INVENTORY_READONLY');
  assert.equal(a.scope, 'CURRENT_EXECUTION_ACCOUNT_ONLY');
  assert.equal(a.completeProjectInventory, false);
  assert.equal(a.writesPerformed, false);
  assert.equal(a.triggerCount, 2);
  assert.equal(a.fingerprintSha256, b.fingerprintSha256);
  assert.match(a.fingerprintSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual([...a.triggers].map(x => x.handler), ['runDaily', 'syncMuseum']);
  assert.deepEqual(first.calls, { reads: 1, writes: 0, ids: 0 });
  assert.deepEqual(second.calls, { reads: 1, writes: 0, ids: 0 });
  assert.ok(!JSON.stringify(a).includes('SCRIPT_PROPERTIES'));
});

test('Apps Script .gs template rejects unverifiable or oversized inventories without modifying triggers', () => {
  for (const values of [[trigger('bad handler!')], [trigger('run', 'invalid-type')], Array.from({ length: 513 }, () => trigger('run'))]) {
    const x = fixture(values);
    assert.throws(() => x.inspect(), /_UNVERIFIED/);
    assert.equal(x.calls.writes, 0);
  }
});

test('Apps Script .gs template counts duplicate installed triggers without exposing their IDs', () => {
  const x = fixture([trigger('syncMuseum'), trigger('syncMuseum')]);
  const result = x.inspect();
  assert.equal(result.triggerCount, 2);
  assert.equal(result.triggers.length, 2);
  for (const t of result.triggers) {
    assert.deepEqual(Object.keys(t).sort(), ['eventType', 'handler', 'sourceType']);
  }
  assert.equal(x.calls.writes, 0);
});
