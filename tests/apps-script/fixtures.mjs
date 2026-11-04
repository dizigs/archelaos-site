import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqlScriptStore } from '../../automation/apps-script/store.mjs';
import { PrivateCipher, SCRIPT_SCOPE } from '../../automation/apps-script/security.mjs';
import { ScriptEditor } from '../../automation/apps-script/editor.mjs';
export const projectId = 'synthetic_project_identifier_not_a_real_google_project';
export const projectTitle = 'Synthetic museum fixture';
export const admin = 'admin@example.invalid';
export const actor = { verified: true, emailVerified: true, email: admin, sub: 'synthetic-sub', grantedScopes: ['openid', 'email', SCRIPT_SCOPE], rights: ['apps-script:read', 'apps-script:edit'] };
export const cipher = () => new PrivateCipher('synthetic-private-storage-key-'.repeat(3));
export function files() {
  return [
    { name: 'Code', type: 'SERVER_JS', source: 'function syncMuseumContributions() { /* PRIVATE_SYNTHETIC_SOURCE */ }' },
    { name: 'MuseumApprovals', type: 'SERVER_JS', source: 'function approvals() {}' },
    { name: 'CloudflareBridge', type: 'SERVER_JS', source: 'function bridge() {}' },
    { name: 'appsscript', type: 'JSON', source: '{ "timeZone": "Europe/Athens", "runtimeVersion": "V8" }' },
    { name: 'ExistingPanel', type: 'HTML', source: '<p>synthetic private fixture</p>' }
  ];
}
export function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'archelaos-script-fixture-'));
  let db, storage; const state = { clock: Date.now(), updates: 0, reads: 0, files: files(), trigger: 'a'.repeat(64) };
  const open = () => {
    db = new DatabaseSync(join(directory, 'private.sqlite'));
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    storage = { sql: { exec(query, ...values) { const stmt = db.prepare(query); return /^(SELECT|PRAGMA)/i.test(query) ? stmt.all(...values) : (stmt.run(...values), []); } }, transactionSync(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } } };
    return new SqlScriptStore(storage, () => state.clock);
  };
  let store = open();
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  const provider = { syntheticOnly: true,
    metadata: async () => ({ scriptId: projectId, title: projectTitle, ignoredPrivateMetadata: 'synthetic-only' }),
    content: async () => { state.reads++; await state.onRead?.(state.reads); return { scriptId: projectId, files: structuredClone(state.files) }; },
    update: async next => { state.updates++; if (state.onUpdate) return state.onUpdate(next); state.files = structuredClone(next); return { scriptId: projectId, files: structuredClone(next) }; }
  };
  const ports = { assertExclusiveWriter: async () => ({ verified: true, coversExternalWriters: true, projectId, expiresAt: state.clock + 60000 }), readTriggerInventory: async () => ({ verified: true, completeProjectInventory: true, projectId, fingerprint: state.trigger }), reviewChange: async () => true };
  const policy = { liveWritesEnabled: true };
  const editor = () => new ScriptEditor({ projectId, projectTitle, expectedAdminEmail: admin, store, provider, cipher: cipher(), ports, policy, now: () => state.clock });
  return { state, provider, ports, policy, editor, get store() { return store; }, get db() { return db; }, get storage() { return storage; }, restart() { db.close(); store = open(); } };
}
