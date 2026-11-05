import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  ValidationErrorCodes as C, E2EValidationError, IdempotencyAndRecoveryJournal,
  REQUIRED_GAS_SCOPES, SMOKE_FILE_NAME, buildSafeBrainMetadataEnvelope,
  computeProjectSha256, createAndVerifyEncryptedBackup, createSignedApproval,
  decryptAndVerifyBackup, detectSha256Drift, readProjectSnapshot, reconcileUncertainJob,
  relayMetadataToCentralBrain, runSmokeWriteAndRollbackLifecycle, sanitizeForLogs,
  verifyAuthorizedOAuth, createSyntheticGasEnvironment
} from './harness.mjs';

const PRINCIPAL='synthetic-owner@example.invalid';
const ACTOR='synthetic-writer',APPROVER='synthetic-second-reviewer';
const APPROVAL_KEY=Buffer.from('synthetic-hmac-secret-used-only-in-tests');
const BACKUP_KEY=crypto.createHash('sha256').update('synthetic-aes-test-key').digest();
const expires=()=>Date.now()+120000;
const oauth=overrides=>({accessToken:'ya29.SYNTHETIC_ONLY',tokenType:'Bearer',
  scopes:[...REQUIRED_GAS_SCOPES],principal:PRINCIPAL,expiresAtMs:expires()+3600000,...overrides});
async function context(settings={}){
  const env=createSyntheticGasEnvironment(settings);
  const base=await readProjectSnapshot(env.client,env.scriptId);
  const approval=createSignedApproval({ticketId:'synthetic-ticket',approverId:APPROVER,
    scriptId:env.scriptId,expectedSourceHash:base.projectSha256,
    expiresAtMs:expires(),approvalSecretKey:APPROVAL_KEY});
  const journal=new IdempotencyAndRecoveryJournal();
  const args={scriptId:env.scriptId,gasClient:env.client,
    journal,idempotencyKey:'synthetic_job_001',actorId:ACTOR,
    oauthContext:oauth(),expectedPrincipal:PRINCIPAL,
    activeLease:{holderId:ACTOR,expiresAtMs:expires()},
    independentInventory:{verified:true,completeProjectInventory:true,coversExternalWriters:true,
      projectId:env.scriptId,triggerFingerprint:base.triggersSha256},
    independentApproval:approval,approvalSecretKey:APPROVAL_KEY,backupEncryptionKey:BACKUP_KEY};
  return {env,base,journal,args};
}
async function rejectsCode(action,code){
  await assert.rejects(action,e=>e instanceof E2EValidationError&&e.code===code);
}

test('1. OAuth is synthetic metadata validation and exposes no access token',()=>{
  assert.equal(verifyAuthorizedOAuth(oauth(),{expectedPrincipal:PRINCIPAL}).simulationValidated,true);
  assert.equal('accessToken' in verifyAuthorizedOAuth(oauth(),{expectedPrincipal:PRINCIPAL}),false);
  assert.throws(()=>verifyAuthorizedOAuth(oauth({principal:'wrong'}),{expectedPrincipal:PRINCIPAL}),
    {code:C.OAUTH_UNAUTHORIZED});
  assert.throws(()=>verifyAuthorizedOAuth(oauth({expiresAtMs:Date.now()+20}),{expectedPrincipal:PRINCIPAL}),
    {code:C.OAUTH_EXPIRED});
  assert.throws(()=>verifyAuthorizedOAuth(oauth({scopes:[]}),{expectedPrincipal:PRINCIPAL}),
    {code:C.OAUTH_SCOPE_INSUFFICIENT});
});
test('2. project SHA-256 hashes CRLF byte-for-byte',async()=>{
  const {env,base}=await context();
  env.mutateExternally(base.files.map(f=>f.type==='SERVER_JS'?{...f,source:f.source.replaceAll('\r\n','\n')}:f));
  const changed=await readProjectSnapshot(env.client,env.scriptId);
  assert.ok(detectSha256Drift(base,changed).hasDrift);
  assert.deepEqual(detectSha256Drift(base,changed).changedFiles,['Main']);
});
test('3. AES-GCM roundtrip and altered ciphertext or authenticated metadata denied',async()=>{
  const {base}=await context();
  const b=createAndVerifyEncryptedBackup(base,BACKUP_KEY);
  assert.equal(b.algorithm,'AES-256-GCM');
  assert.equal(computeProjectSha256(decryptAndVerifyBackup(b,BACKUP_KEY).files),base.projectSha256);
  assert.throws(()=>decryptAndVerifyBackup({...b,scriptId:'evil'},BACKUP_KEY),
    {code:C.BACKUP_VERIFICATION_FAILED});
  assert.throws(()=>decryptAndVerifyBackup({...b,ciphertextBase64:Buffer.from('wrong').toString('base64')},BACKUP_KEY),
    {code:C.BACKUP_VERIFICATION_FAILED});
});
test('4. no approval / self-approval stops before synthetic update',async()=>{
  const {env,args,base}=await context();
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle({...args,independentApproval:null}),
    C.INDEPENDENT_AUTH_REQUIRED);
  const self=createSignedApproval({ticketId:'self',approverId:ACTOR,scriptId:env.scriptId,
    expectedSourceHash:base.projectSha256,expiresAtMs:expires(),approvalSecretKey:APPROVAL_KEY});
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle({...args,independentApproval:self}),
    C.SELF_APPROVAL_FORBIDDEN);
  assert.equal(env.getPutCalls(),0);
});
test('5. arbitrary or missing inventory cannot impersonate cross-account verification',async()=>{
  const {env,args}=await context();
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle({...args,independentInventory:
    {...args.independentInventory,coversExternalWriters:false}}),C.PROVIDER_INVENTORY_UNVERIFIED);
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle({...args,activeLease:
    {holderId:'other',expiresAtMs:expires()}}),C.CONCURRENT_WRITER_ACTIVE);
  assert.equal(env.getPutCalls(),0);
});
test('6. changed triggers are rejected without any write',async()=>{
  const {env,args}=await context();
  env.mutateTriggersExternally([{id:'changed-trigger'}]);
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle(args),C.TRIGGER_MUTATION_FORBIDDEN);
  assert.equal(env.getPutCalls(),0);
});
test('7. full synthetic smoke/readback/rollback restores baseline and triggers',async()=>{
  const {env,base,args}=await context();
  const result=await runSmokeWriteAndRollbackLifecycle(args);
  assert.equal(result.status,'SYNTHETIC_SMOKE_AND_ROLLBACK_VERIFIED');
  assert.equal(result.postRollbackSha256,base.projectSha256);
  assert.notEqual(result.smokeProjectSha256,base.projectSha256);
  assert.equal(result.triggersUnchanged,true);
  assert.equal(env.getPutCalls(),2);
  assert.deepEqual(result.syntheticPutAttempts,{smoke:1,rollback:1});
  const last=await readProjectSnapshot(env.client,env.scriptId);
  assert.equal(last.files.some(f=>f.name===SMOKE_FILE_NAME),false);
  assert.equal(last.projectSha256,base.projectSha256);
  assert.equal(result.liveGoogleWrites,0);
});
test('8. duplicate operation never repeats smoke',async()=>{
  const {args,env}=await context();
  await runSmokeWriteAndRollbackLifecycle(args);
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle(args),C.DUPLICATE_JOB_BLOCKED);
  assert.equal(env.getPutCalls(),2);
});
test('9. timeout AFTER simulated commit is held; reconciliation is read-only',async()=>{
  const {args,env,journal}=await context({timeoutAfterSmoke:true});
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle(args),C.RECONCILIATION_REQUIRED);
  assert.equal(env.getPutCalls(),1);
  const result=await reconcileUncertainJob({idempotencyKey:args.idempotencyKey,
    gasClient:env.client,journal});
  assert.equal(result.status,'MANUAL_SIGNED_RESTORE_REQUIRED');
  assert.equal(env.getPutCalls(),1);
});
test('10. in-progress journal blocks another job on same project',async()=>{
  const {args}=await context({timeoutAfterSmoke:true});
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle(args),C.RECONCILIATION_REQUIRED);
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle({...args,idempotencyKey:'synthetic_job_002'}),
    C.RECONCILIATION_REQUIRED);
});
test('11. synthetic checkpoint models restart but is explicitly not provider durability',async()=>{
  const {args,journal,env}=await context({timeoutAfterSmoke:true});
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle(args),C.RECONCILIATION_REQUIRED);
  const recovered=IdempotencyAndRecoveryJournal.fromSyntheticCheckpoint(journal.exportSyntheticCheckpoint());
  assert.equal(recovered.getJob(args.idempotencyKey).status,'RECONCILIATION_REQUIRED');
  const outcome=await reconcileUncertainJob({idempotencyKey:args.idempotencyKey,
    journal:recovered,gasClient:env.client});
  assert.equal(outcome.putAttempts,0);
});
test('12. rollback failure does not retry automatically',async()=>{
  const {env,args,journal}=await context({rollbackFails:true});
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle(args),C.RECONCILIATION_REQUIRED);
  assert.equal(env.getPutCalls(),2);
  assert.equal(journal.getJob(args.idempotencyKey).status,'RECONCILIATION_REQUIRED');
});
test('13. live mode and forged real-client injection fail closed before PUT',async()=>{
  const {env,args}=await context();
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle({...args,executionMode:'LIVE_VERIFICATION'}),
    C.LIVE_WRITE_DISABLED_BY_DEFAULT);
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle({...args,featureFlags:{liveGasWriteEnabled:true}}),
    C.LIVE_WRITE_DISABLED_BY_DEFAULT);
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle({...args,gasClient:{...env.client}}),
    C.SYNTHETIC_CLIENT_REQUIRED);
  assert.equal(env.getPutCalls(),0);
});
test('14. allowlisted Brain diagnostic is not a live event dispatch',async()=>{
  const h='a'.repeat(64),b='b'.repeat(64);
  const raw={eventId:'synthetic-event-01',operation:'GAS_SYNTHETIC_SMOKE_ROLLBACK',
    status:'SYNTHETIC_VERIFIED',baselineSha256:h,smokeProjectSha256:b,
    postRollbackSha256:h,triggersUnchanged:true,backupVerified:true,
    timestamp:'2026-11-05T12:00:00Z'};
  const r=await relayMetadataToCentralBrain({rawEvent:raw});
  assert.equal(r.relayedLive,false);
  assert.equal(r.envelope.simulationOnly,true);
  assert.deepEqual(buildSafeBrainMetadataEnvelope(raw),r.envelope);
  await rejectsCode(()=>relayMetadataToCentralBrain({rawEvent:raw,liveBrainCallsEnabled:true}),
    C.LIVE_BRAIN_CALL_DISABLED_BY_DEFAULT);
  assert.throws(()=>buildSafeBrainMetadataEnvelope({...raw,accessToken:'secret'}),
    {code:C.UNSAFE_BRAIN_PAYLOAD_BLOCKED});
});
test('15. log scrub hides tokens, contacts and nested values',()=>{
  const safe=JSON.stringify(sanitizeForLogs({authorization:'Bearer ya29.synthetic',
    nested:{email:'someone@example.com',note:'+306912345678'}}));
  assert.doesNotMatch(safe,/ya29|someone@example\.com|6912345678/);
});
test('16. duplicate filenames fail source backup validation',async()=>{
  const {env,base}=await context();
  env.mutateExternally([...base.files,base.files[1]]);
  await rejectsCode(()=>readProjectSnapshot(env.client,env.scriptId),C.READBACK_MISMATCH);
});
