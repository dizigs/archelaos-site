import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
  ValidationErrorCodes as C, E2EValidationError, IdempotencyAndRecoveryJournal,
  REQUIRED_GAS_SCOPES, SMOKE_FILE_NAME, buildSafeBrainMetadataEnvelope,
  computeProjectSha256, createAndVerifyEncryptedBackup, createSignedApproval,
  decryptAndVerifyBackup, detectSha256Drift, readProjectSnapshot, reconcileUncertainJob,
  relayMetadataToCentralBrain, runSmokeWriteAndRollbackLifecycle, sanitizeForLogs,
  verifyAuthorizedOAuth, createSyntheticGasEnvironment, verifyWritersAndTriggersGuard
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
test('6. stale independent inventory rejects externally changed triggers without write',async()=>{
  const {env,args}=await context();
  env.mutateTriggersExternally([{id:'changed-trigger'}]);
  await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle(args),C.PROVIDER_INVENTORY_UNVERIFIED);
  assert.equal(env.getPutCalls(),0);
});
test('6b. actual baseline-to-current trigger drift reports trigger mutation',async()=>{
  const {env,base,args}=await context();
  env.mutateTriggersExternally([{id:'externally-changed'}]);
  const changed=await readProjectSnapshot(env.client,env.scriptId);
  assert.throws(()=>verifyWritersAndTriggersGuard({
    baselineSnapshot:base,currentRemoteSnapshot:changed,
    activeLease:args.activeLease,actorId:ACTOR,
    independentInventory:args.independentInventory
  }),{code:C.TRIGGER_MUTATION_FORBIDDEN});
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

test('17. lease guard rejects missing, blank, and mismatched actors and holders',async()=>{
  const {base,args,env}=await context();
  const check=(actorId,activeLease)=>verifyWritersAndTriggersGuard({
    baselineSnapshot:base,currentRemoteSnapshot:base,actorId,activeLease,
    independentInventory:args.independentInventory
  });
  for(const actor of [undefined,null,'','  ',42]){
    assert.throws(()=>check(actor,{expiresAtMs:expires()}),
      {code:C.CONCURRENT_WRITER_ACTIVE});
  }
  for(const holder of [undefined,null,'','  ',42,'another-writer']){
    assert.throws(()=>check(ACTOR,{holderId:holder,expiresAtMs:expires()}),
      {code:C.CONCURRENT_WRITER_ACTIVE});
  }
  assert.equal(check(ACTOR,args.activeLease).simulationValidated,true);
  assert.equal(env.getPutCalls(),0);
});
for(const [postWriteReadOrdinal,expectedPuts] of [[1,1],[2,1],[3,2]]){
  test(`18. thrown post-write read #${postWriteReadOrdinal} holds journal before rethrow`,async()=>{
    const {env,args,journal}=await context({failPostWriteReadAt:postWriteReadOrdinal});
    await assert.rejects(()=>runSmokeWriteAndRollbackLifecycle(args),
      {message:'SYNTHETIC_READ_FAILURE'});
    assert.equal(journal.getJob(args.idempotencyKey).status,'RECONCILIATION_REQUIRED');
    assert.equal(env.getPutCalls(),expectedPuts);
    await rejectsCode(()=>runSmokeWriteAndRollbackLifecycle({
      ...args,idempotencyKey:'synthetic_job_002'}),C.RECONCILIATION_REQUIRED);
    const result=await reconcileUncertainJob({idempotencyKey:args.idempotencyKey,
      gasClient:env.client,journal});
    assert.equal(result.putAttempts,0);
    assert.equal(env.getPutCalls(),expectedPuts);
  });
}
test('19. restored IN_PROGRESS requires explicit stopped-executor proof before hold',async()=>{
  const {base,args,env,journal}=await context();
  journal.beginJob({idempotencyKey:args.idempotencyKey,scriptId:env.scriptId,
    baselineSha256:base.projectSha256,expectedSmokeSha256:'b'.repeat(64),
    backupBundle:createAndVerifyEncryptedBackup(base,BACKUP_KEY)});
  const recovered=IdempotencyAndRecoveryJournal.fromSyntheticCheckpoint(
    journal.exportSyntheticCheckpoint());
  await rejectsCode(()=>recovered.recoverAbandonedJob(args.idempotencyKey),
    C.RECONCILIATION_REQUIRED);
  await rejectsCode(()=>recovered.recoverAbandonedJob(args.idempotencyKey,{
    isExecutorLive:async()=>true}),C.RECONCILIATION_REQUIRED);
  await rejectsCode(()=>recovered.recoverAbandonedJob(args.idempotencyKey,{
    isExecutorLive:async()=>{throw Error('unknown-liveness');}}),C.RECONCILIATION_REQUIRED);
  assert.equal(recovered.getJob(args.idempotencyKey).status,'IN_PROGRESS');
  const out=await recovered.recoverAbandonedJob(args.idempotencyKey,{
    isExecutorLive:async({idempotencyKey,scriptId})=>
      idempotencyKey===args.idempotencyKey&&scriptId===env.scriptId?false:true});
  assert.equal(out.status,'RECONCILIATION_REQUIRED');
  assert.equal(recovered.getJob(args.idempotencyKey).status,'RECONCILIATION_REQUIRED');
  const reconciliation=await reconcileUncertainJob({
    idempotencyKey:args.idempotencyKey,gasClient:env.client,journal:recovered});
  assert.equal(reconciliation.status,'ALREADY_CLEAN');
  assert.equal(env.getPutCalls(),0);
});
test('20. verified Brain envelope rejects rollback digest mismatch and coerced types',()=>{
  const base={eventId:'synthetic-event-01',operation:'GAS_SYNTHETIC_SMOKE_ROLLBACK',
    status:'SYNTHETIC_VERIFIED',baselineSha256:'a'.repeat(64),
    smokeProjectSha256:'b'.repeat(64),postRollbackSha256:'a'.repeat(64),
    triggersUnchanged:true,backupVerified:true,timestamp:'2026-11-05T12:00:00Z'};
  assert.throws(()=>buildSafeBrainMetadataEnvelope({
    ...base,postRollbackSha256:'c'.repeat(64)}),{code:C.UNSAFE_BRAIN_PAYLOAD_BLOCKED});
  assert.throws(()=>buildSafeBrainMetadataEnvelope({
    ...base,eventId:{accessToken:'leak',toString:()=>base.eventId}}),
  {code:C.UNSAFE_BRAIN_PAYLOAD_BLOCKED});
  assert.throws(()=>buildSafeBrainMetadataEnvelope({...base,timestamp:new Date(base.timestamp)}),
    {code:C.UNSAFE_BRAIN_PAYLOAD_BLOCKED});
  assert.throws(()=>buildSafeBrainMetadataEnvelope({...base,eventId:null}),
    {code:C.UNSAFE_BRAIN_PAYLOAD_BLOCKED});
  assert.equal(buildSafeBrainMetadataEnvelope(base).simulationOnly,true);
});
test('21. rename detection catches deleted sources outside the PR ownership boundary',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'archelaos-rename-check-'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'});
  try{
    git('init','-q');
    mkdirSync(path.join(dir,'.github/workflows'),{recursive:true});
    mkdirSync(path.join(dir,'automation/apps-script-e2e-validation'),{recursive:true});
    const oldPath='.github/workflows/outside.yml';
    const newPath='automation/apps-script-e2e-validation/inside.yml';
    writeFileSync(path.join(dir,oldPath),Array.from({length:70},
      (_,i)=>`retained line ${i}\n`).join(''));
    git('add','.');
    git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid',
      'commit','-qm','baseline');
    const base=git('rev-parse','HEAD').trim();
    renameSync(path.join(dir,oldPath),path.join(dir,newPath));
    git('add','-A');
    git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid',
      'commit','-qm','rename');
    const paths=git('diff','--no-renames','--name-only',base,'HEAD').trim().split('\n');
    assert.deepEqual(paths,[oldPath,newPath]);
    const inScope=p=>p.startsWith('automation/apps-script-e2e-validation/')||
      p==='.github/workflows/apps-script-e2e-validation.yml';
    assert.equal(paths.every(inScope),false);
    const workflow=readFileSync(new URL(
      '../../.github/workflows/apps-script-e2e-validation.yml',import.meta.url),'utf8');
    assert.match(workflow,/git diff --no-renames --name-only/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
