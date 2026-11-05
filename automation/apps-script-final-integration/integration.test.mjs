import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectIntegration, sendReadOnlyReceipt } from './integration.mjs';
const H = 'a'.repeat(64), T = 'b'.repeat(64), V = 'c'.repeat(64);
const OP = 'c87bf310-5124-48b4-a57c-871c8370d5ce';
const EVENT = 'd92d79a1-2148-59b8-8f57-ae104d836207';
const RECEIPT = 'ad48ec51-171c-461e-8e1b-4b14586e9ec8';
const now = 2000000000000;
const base = () => ({ verified: true, origin: 'TRUSTED_PRIVATE_STORE', projectFingerprint: H, observedAtMs: now - 2000 });
function evidence() {
  const e = {
    control: {...base(), paused: false, liveWritesEnabled: false},
    grant: {...base(), scopes:['https://www.googleapis.com/auth/script.projects'], adminIdentityVerified:true, expiresAt:now + 120000},
    source: {...base(), metadataVerified:true, fileCount:4, sourceHash:T},
    backup: {...base(), encrypted:true, readbackVerified:true, immutable:true, sourceHash:T},
    trigger: {...base(), completeAcrossAccounts:true, fingerprint:V},
    writer: {...base(), coversExternalIdeAndApiWriters:true, expiresAt:now + 120000},
    auth: {...base(), independentApproval:true, selfApproved:false, projectScoped:true, signedCommandDigestVerified:true, baseSourceHash:T, expiresAt:now + 120000},
    rollback: {...base(), readbackVerified:true, fullManifestPreserved:true, triggerFingerprint:V, restoredSourceHash:T, expiresAt:now + 120000},
    brain: {...base(), transport:'PRIVATE_SERVICE_BINDING', source:'apps_script', status:'ACCEPTING', authenticated:true, deploymentDigest:H}
  };
  const ports = () => Object.fromEntries(Object.entries(e).map(([k,v]) => [({control:'readControls',grant:'readGrantProof',source:'readSourceProof',backup:'readBackupProof',trigger:'readTriggerProof',writer:'readWriterProof',auth:'readAuthorizationProof',rollback:'readRollbackProof',brain:'readBrainProof'})[k], async()=>v]));
  return {e,ports};
}
test('all independent proofs yields READY but not write authorization', async () => {
  const {ports}=evidence(); const r=await inspectIntegration({projectFingerprint:H, now},ports());
  assert.equal(r.write,'WRITE_READY_NOT_AUTHORIZED');assert.equal(r.read,'READ_VERIFIED');
});
for (const [name, change, code] of [
  ['IDE writer',e=>e.writer.coversExternalIdeAndApiWriters=false,'EXTERNAL_WRITERS_NOT_EXCLUDED'],
  ['expiry',e=>e.writer.expiresAt=now+1000,'EXTERNAL_WRITERS_NOT_EXCLUDED'],
  ['triggers',e=>e.trigger.completeAcrossAccounts=false,'TRIGGERS_NOT_VERIFIED'],
  ['grant',e=>e.grant.scopes=[],'ADMIN_SCOPE_NOT_VERIFIED'],
  ['backup drift',e=>e.backup.sourceHash=V,'BACKUP_NOT_VERIFIED'],
  ['source revision changed',e=>e.source.sourceHash=V,'BACKUP_NOT_VERIFIED'],
  ['stale source',e=>e.source.observedAtMs=now-900000,'SOURCE_NOT_VERIFIED'],
  ['stale backup',e=>e.backup.observedAtMs=now-900000,'BACKUP_NOT_VERIFIED'],
  ['stale triggers',e=>e.trigger.observedAtMs=now-900000,'TRIGGERS_NOT_VERIFIED'],
  ['failed rollback readback',e=>e.rollback.readbackVerified=false,'ROLLBACK_NOT_VERIFIED'],
  ['rollback restored wrong revision',e=>e.rollback.restoredSourceHash=V,'ROLLBACK_NOT_VERIFIED'],
  ['stale Brain deployment proof',e=>e.brain.observedAtMs=now-900000,'BRAIN_PRIVATE_INTAKE_NOT_VERIFIED'],
  ['wrong owner',e=>e.auth.projectFingerprint=V,'SIGNED_SCOPED_AUTH_NOT_VERIFIED'],
  ['self approval',e=>e.auth.selfApproved=true,'SIGNED_SCOPED_AUTH_NOT_VERIFIED'],
  ['rollback',e=>e.rollback.triggerFingerprint=H,'ROLLBACK_NOT_VERIFIED'],
  ['Brain source',e=>e.brain.source='github','BRAIN_PRIVATE_INTAKE_NOT_VERIFIED'],
  ['no private binding',e=>e.brain.transport='PUBLIC_HTTP','BRAIN_PRIVATE_INTAKE_NOT_VERIFIED'],
  ['writes enabled',e=>e.control.liveWritesEnabled=true,'CONTROLS_NOT_SAFE']]) {
  test('blocks '+name, async()=>{const {e,ports}=evidence();change(e);const x=await inspectIntegration({projectFingerprint:H, now},ports());assert.equal(x.write,'BLOCKED');assert.ok(x.blockers.includes(code));});
}
test('unavailable independent probe fails closed',async()=>{const {ports}=evidence();const p=ports();p.readWriterProof=async()=>{throw Error('unavailable')};const x=await inspectIntegration({projectFingerprint:H,now},p);assert.equal(x.write,'BLOCKED');});
test('invalid project fingerprint fails closed',async()=>{const {ports}=evidence();await assert.rejects(inspectIntegration({projectFingerprint:'bad',now},ports()), {code:'PRIVATE_PROJECT_OR_PROBES_REQUIRED'});});
const funcs = () => {
  const calls=[];return {calls,ports:{
    isAuthenticatedPrivateBinding:async()=>({verified:true,source:'apps_script',scope:'metadata-only',paused:false,enabled:true}),
    prepareReceipt:async v=>{calls.push(['prepare',v]);return {status:'PRIVATE_RECEIPT_VERIFIED',operationId:OP,sourceRevision:T}},
    relayReceipt:async v=>{calls.push(['relay',v]);return {status:'DURABLE_BRAIN_RECEIPT',eventId:EVENT}},
    readBrainReceipt:async v=>{calls.push(['readback',v]);return {eventId:EVENT,correlationId:OP,
      receiptId:RECEIPT,source:'apps_script',sourceRevision:T,transport:'PRIVATE_SERVICE_BINDING',
      status:'QUEUED',durable:true}},
    audit:async v=>{calls.push(['audit',v])}
  }};
};
test('opaque read-only two-step handoff and relay',async()=>{const {calls,ports}=funcs();const x=await sendReadOnlyReceipt({operationId:OP,phase:'read'},ports);assert.equal(x.sent,true);assert.equal(x.brainReadbackVerified,true);
  assert.deepEqual(calls[1],['relay',{operationId:OP}]);
  assert.deepEqual(calls[2],['readback',{operationId:OP,eventId:EVENT}]);});
test('rejects write command before any side effects',async()=>{const {calls,ports}=funcs();await assert.rejects(sendReadOnlyReceipt({operationId:OP,phase:'write'},ports),{code:'READ_ONLY_COMMAND_REQUIRED'});assert.equal(calls.length,0);});
test('rejects missing Brain binding before project read',async()=>{const {calls,ports}=funcs();ports.isAuthenticatedPrivateBinding=async()=>({verified:false});await assert.rejects(sendReadOnlyReceipt({operationId:OP,phase:'read'},ports),{code:'PRIVATE_BRAIN_BINDING_NOT_READY'});assert.equal(calls.length,0);});
test('uncertain network outcome becomes reconciliation hold; no retry',async()=>{const {calls,ports}=funcs();ports.relayReceipt=async()=>{calls.push(['lost']);throw Error('network')};const x=await sendReadOnlyReceipt({operationId:OP,phase:'read'},ports);assert.equal(x.status,'RECONCILIATION_REQUIRED');assert.equal(calls.filter(c=>c[0]==='lost').length,1);});
test('audit failure cannot claim durable success',async()=>{const {ports}=funcs();ports.audit=async()=>{throw Error('io')};await assert.rejects(sendReadOnlyReceipt({operationId:OP,phase:'backup'},ports),{code:'AUDIT_NOT_DURABLE'});});

test('missing independent Brain readback port fails before source work', async()=>{
  const {calls,ports}=funcs(); delete ports.readBrainReceipt;
  await assert.rejects(sendReadOnlyReceipt({operationId:OP,phase:'read'},ports),
    {code:'TRUSTED_COMPOSITION_PORTS_REQUIRED'});
  assert.equal(calls.length,0);
});
test('relay acknowledgement without event identity is reconciliation only', async()=>{
  const {ports}=funcs(); ports.relayReceipt=async()=>({status:'DURABLE_BRAIN_RECEIPT'});
  const r=await sendReadOnlyReceipt({operationId:OP,phase:'read'},ports);
  assert.equal(r.status,'RECONCILIATION_REQUIRED');assert.equal(r.brainReadbackVerified,false);
});
test('lost Brain readback is held, never retried or marked sent', async()=>{
  const {calls,ports}=funcs(); ports.readBrainReceipt=async()=>{calls.push(['readback-error']);throw Error('timeout')};
  const r=await sendReadOnlyReceipt({operationId:OP,phase:'read'},ports);
  assert.equal(r.status,'RECONCILIATION_REQUIRED');assert.equal(r.sent,false);
  assert.equal(calls.filter(c=>c[0]==='relay').length,1);
});
test('mismatched source revision in independent Brain receipt blocks delivery',async()=>{
  const {ports}=funcs();ports.readBrainReceipt=async()=>({eventId:EVENT,correlationId:OP,
    receiptId:RECEIPT,source:'apps_script',sourceRevision:V,transport:'PRIVATE_SERVICE_BINDING',
    status:'QUEUED',durable:true});
  const r=await sendReadOnlyReceipt({operationId:OP,phase:'read'},ports);
  assert.equal(r.status,'RECONCILIATION_REQUIRED');
});
test('extra fields on Brain receipt are rejected to prevent unreviewed data',async()=>{
  const {ports}=funcs();const original=ports.readBrainReceipt;
  ports.readBrainReceipt=async v=>({...await original(v),sourceCode:'not-allowed'});
  const r=await sendReadOnlyReceipt({operationId:OP,phase:'read'},ports);
  assert.equal(r.status,'RECONCILIATION_REQUIRED');
});
test('durably confirmed duplicate still requires Brain readback',async()=>{
  const {ports}=funcs();ports.relayReceipt=async()=>({status:'DUPLICATE_CONFIRMED',eventId:EVENT});
  const r=await sendReadOnlyReceipt({operationId:OP,phase:'backup'},ports);
  assert.equal(r.status,'DUPLICATE_CONFIRMED');assert.equal(r.sent,false);
  assert.equal(r.brainReadbackVerified,true);
});
