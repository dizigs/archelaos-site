import test from 'node:test';
import assert from 'node:assert/strict';
import { ScriptEditor } from '../apps-script/editor.mjs';
import { PrivateCipher, SCRIPT_SCOPE } from '../apps-script/security.mjs';
import { prepareAppsScriptReceipt } from './handoff.mjs';

const ID = 'cbf993cb-195e-4313-9799-7e17f67cdab4';
const PROJECT = 'mock-project-id-abcdefghijklmnop';
const TITLE = 'Approved mock Script';
const ACTOR = { verified: true, emailVerified: true, email: 'admin@example.test', sub: 'test-principal',
  grantedScopes: [SCRIPT_SCOPE], rights: ['apps-script:read'] };
function setup() {
  const blobs = new Map(); const receipts = new Map(); const claims = new Map(); let googlePut = 0;
  const files = [
    { name: 'Code', type: 'SERVER_JS', source: 'function allowedRead() { return 1; }' },
    { name: 'MuseumApprovals', type: 'SERVER_JS', source: 'function approvals() {}' },
    { name: 'CloudflareBridge', type: 'SERVER_JS', source: 'function bridge() {}' },
    { name: 'appsscript', type: 'JSON', source: JSON.stringify({ timeZone: 'Europe/Athens', exceptionLogging: 'STACKDRIVER' }) }
  ];
  const provider = {
    async metadata() { return { scriptId: PROJECT, title: TITLE }; },
    async content() { return { scriptId: PROJECT, files }; },
    async update() { googlePut++; throw Error('Google PUT must never be called'); }
  };
  const store = { putPrivate(id, value) { blobs.set(id, value); }, getPrivate(id) { return blobs.get(id); } };
  const editor = new ScriptEditor({ projectId: PROJECT, projectTitle: TITLE, expectedAdminEmail: ACTOR.email,
    store, provider, cipher: new PrivateCipher('isolated-test-secret-of-32-plus-characters'),
    policy: { liveWritesEnabled: false } });
  const ports = {
    readControls: async () => ({ paused: false, readEnabled: true }),
    fingerprintProject: async () => 'd'.repeat(64),
    async claim(id, phase) {
      if (claims.has(id)) return { status: claims.get(id) === phase && receipts.has(id) ? 'COMPLETED' : 'RECONCILE_REQUIRED' };
      claims.set(id, phase); return { status: 'CLAIMED' };
    },
    get: async id => receipts.get(id),
    complete: async (id, receipt) => { if (receipts.has(id)) throw Error('NOT_IMMUTABLE'); receipts.set(id, receipt); },
    hold: async id => { if (!receipts.has(id)) claims.set(id, 'HOLD'); },
    audit: async () => {}
  };
  return { editor, provider, store, ports, blobs, receipts, files, googlePut: () => googlePut };
}
test('real PR124 ScriptEditor validates source and emits only opaque receipt', async () => {
  const f = setup();
  const result = await prepareAppsScriptReceipt({ operationId: ID, editor: f.editor, actor: ACTOR, ports: f.ports });
  assert.equal(result.status, 'PRIVATE_RECEIPT_VERIFIED'); assert.equal(f.googlePut(), 0);
  assert.equal(f.blobs.size, 0); assert.equal(f.receipts.size, 1);
  const printable = JSON.stringify(f.receipts.get(ID));
  assert.equal(printable.includes(PROJECT), false);
  assert.equal(printable.includes('allowedRead'), false);
  assert.equal(printable.includes('admin@example.test'), false);
});
test('real PR124 encrypted backup plus decrypted readback and independent Google GET', async () => {
  const f = setup();
  const result = await prepareAppsScriptReceipt({ operationId: ID, phase: 'backup', editor: f.editor, actor: ACTOR, ports: f.ports });
  assert.equal(result.status, 'PRIVATE_RECEIPT_VERIFIED'); assert.equal(f.googlePut(), 0);
  assert.equal(f.blobs.size, 1);
  const [backupId, sealed] = [...f.blobs][0];
  assert.equal(sealed.includes(f.files[0].source), false);
  const opened = await f.editor.cipher.open(sealed, 'script-backup:' + PROJECT + ':' + backupId);
  assert.equal(opened.content.files.length, 4);
  assert.equal(opened.content.files[0].source, f.files[0].source);
  assert.equal(f.receipts.get(ID).phase, 'BACKUP_VERIFIED');
});
test('real PR124 rejects unauthorized actor and refuses journal completion', async () => {
  const f = setup();
  await assert.rejects(prepareAppsScriptReceipt({ operationId: ID, editor: f.editor,
    actor: { ...ACTOR, grantedScopes: [] }, ports: f.ports }), /ADMIN_SCOPE_OR_EXECUTOR_AUTHORIZATION_REQUIRED/);
  assert.equal(f.receipts.size, 0); assert.equal(f.googlePut(), 0);
});
test('real PR124 rejects wrong configured project identity', async () => {
  const f = setup(); f.provider.metadata = async () => ({ scriptId: PROJECT, title: 'other' });
  await assert.rejects(prepareAppsScriptReceipt({ operationId: ID, editor: f.editor,
    actor: ACTOR, ports: f.ports }), /PROJECT_IDENTITY_MISMATCH/);
  assert.equal(f.receipts.size, 0);
});
