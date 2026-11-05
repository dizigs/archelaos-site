import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectIntegration, sendReadOnlyReceipt } from './integration.mjs';
const H = 'a'.repeat(64), T = 'b'.repeat(64), V = 'c'.repeat(64);
const OP = 'c87bf310-5124-48b4-a57c-871c8370d5ce';
const now = 2000000000000;
const base = () => ({ verified: true, origin: 'TRUSTED_PRIVATE_STORE', projectFingerprint: H });
function evidence() {
  const e = {
    control: {...base(), paused: false, liveWritesEnabled: false},
    grant: {...base(), scopes:['https://www.googleapis.com/auth/script.projects'], adminIdentityVerified:true, expiresAt:now + 120000},
    source: {...base(), metadataVerified:true, fileCount:4, sourceHash:T},
    backup: {...base(), encrypted:true, readbackVerified:true, immutable:true, sourceHash:T},
    trigger: {...base(), completeAcrossAccounts:true, fingerprint:V},
    writer: {...base(), coversExternalIdeAndApiWriters:true, expiresAt:now + 120000},
    auth: {...base(), independentApproval:true, selfApproved:false, projectScoped:true, signedCommandDigestVerified:true, baseSourceHash:T, expiresAt:now + 120000},
    rollback: {...base(), readbackVerified:true, fullManifestPreserved:true, triggerFingerprint:V, expiresAt:now + 120000},
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
    relayReceipt:async v=>{calls.push(['relay',v]);return {status:'DURABLE_BRAIN_RECEIPT'}},
    audit:async v=>{calls.push(['audit',v])}
  }};
};
test('opaque read-only two-step handoff and relay',async()=>{const {calls,ports}=funcs();const x=await sendReadOnlyReceipt({operationId:OP,phase:'read'},ports);assert.equal(x.sent,true);assert.deepEqual(calls[1],['relay',{operationId:OP}]);});
test('rejects write command before any side effects',async()=>{const {calls,ports}=funcs();await assert.rejects(sendReadOnlyReceipt({operationId:OP,phase:'write'},ports),{code:'READ_ONLY_COMMAND_REQUIRED'});assert.equal(calls.length,0);});
test('rejects missing Brain binding before project read',async()=>{const {calls,ports}=funcs();ports.isAuthenticatedPrivateBinding=async()=>({verified:false});await assert.rejects(sendReadOnlyReceipt({operationId:OP,phase:'read'},ports),{code:'PRIVATE_BRAIN_BINDING_NOT_READY'});assert.equal(calls.length,0);});
test('uncertain network outcome becomes reconciliation hold; no retry',async()=>{const {calls,ports}=funcs();ports.relayReceipt=async()=>{calls.push(['lost']);throw Error('network')};const x=await sendReadOnlyReceipt({operationId:OP,phase:'read'},ports);assert.equal(x.status,'RECONCILIATION_REQUIRED');assert.equal(calls.filter(c=>c[0]==='lost').length,1);});
test('audit failure cannot claim durable success',async()=>{const {ports}=funcs();ports.audit=async()=>{throw Error('io')};await assert.rejects(sendReadOnlyReceipt({operationId:OP,phase:'backup'},ports),{code:'AUDIT_NOT_DURABLE'});});
