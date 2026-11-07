/**
 * ARCHELAOS Team 2 — OFFLINE-ONLY Apps Script E2E fault-injection harness.
 * No Google API client, Worker endpoint, production writer or live activation.
 * Production writes are exclusively governed by merged #124 after signed review.
 */
import crypto from 'node:crypto';

export const ValidationErrorCodes=Object.freeze({
  OAUTH_UNAUTHORIZED:'OAUTH_UNAUTHORIZED', OAUTH_EXPIRED:'OAUTH_EXPIRED',
  OAUTH_SCOPE_INSUFFICIENT:'OAUTH_SCOPE_INSUFFICIENT',
  BACKUP_VERIFICATION_FAILED:'BACKUP_VERIFICATION_FAILED',
  SHA256_DRIFT_DETECTED:'SHA256_DRIFT_DETECTED',
  CONCURRENT_WRITER_ACTIVE:'CONCURRENT_WRITER_ACTIVE',
  TRIGGER_MUTATION_FORBIDDEN:'TRIGGER_MUTATION_FORBIDDEN',
  INDEPENDENT_AUTH_REQUIRED:'INDEPENDENT_AUTH_REQUIRED',
  SELF_APPROVAL_FORBIDDEN:'SELF_APPROVAL_FORBIDDEN',
  LIVE_WRITE_DISABLED_BY_DEFAULT:'LIVE_WRITE_DISABLED_BY_DEFAULT',
  DUPLICATE_JOB_BLOCKED:'DUPLICATE_JOB_BLOCKED',
  RECONCILIATION_REQUIRED:'RECONCILIATION_REQUIRED',
  AUTOMATIC_PUT_RETRY_FORBIDDEN:'AUTOMATIC_PUT_RETRY_FORBIDDEN',
  READBACK_MISMATCH:'READBACK_MISMATCH',
  ROLLBACK_VERIFICATION_FAILED:'ROLLBACK_VERIFICATION_FAILED',
  UNSAFE_BRAIN_PAYLOAD_BLOCKED:'UNSAFE_BRAIN_PAYLOAD_BLOCKED',
  LIVE_BRAIN_CALL_DISABLED_BY_DEFAULT:'LIVE_BRAIN_CALL_DISABLED_BY_DEFAULT',
  SYNTHETIC_CLIENT_REQUIRED:'SYNTHETIC_CLIENT_REQUIRED',
  PROVIDER_INVENTORY_UNVERIFIED:'PROVIDER_INVENTORY_UNVERIFIED'
});
export class E2EValidationError extends Error {
  constructor(code){super(code);this.code=code;this.name='E2EValidationError';}
}
const fail=code=>{throw new E2EValidationError(code);};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const hex64=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const REQUIRED_GAS_SCOPES=Object.freeze(['https://www.googleapis.com/auth/script.projects']);

export function sanitizeForLogs(v,seen=new WeakSet()){
  if(v===null||v===undefined)return v;
  if(typeof v==='string')return v.replace(/Bearer\s+\S+|ya29\.[\w.-]+|GOCSPX-\S+|1\/\/[\w-]+/gi,'[REDACTED]')
    .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[REDACTED]')
    .replace(/(?:\+30\s?)?69\d{8}\b/g,'[REDACTED]');
  if(typeof v!=='object')return v;
  if(seen.has(v))return '[CIRCULAR]';
  seen.add(v);
  if(Array.isArray(v))return v.map(x=>sanitizeForLogs(x,seen));
  return Object.fromEntries(Object.entries(v).map(([k,x])=>
    [k,/(?:token|secret|cookie|authorization|signature|source|files|code|email|phone|principal|project|scriptid|payload|ciphertext|key|backup)/i.test(k)?
      '[REDACTED]':sanitizeForLogs(x,seen)]));
}
// This is a synthetic metadata check, NOT a Google token signature check.
export function verifyAuthorizedOAuth(ctx,{expectedPrincipal,nowMs=Date.now()}={}){
  if(!ctx||ctx.tokenType!=='Bearer'||typeof ctx.accessToken!=='string'||
    !ctx.accessToken||!expectedPrincipal||ctx.principal!==expectedPrincipal)
    fail(ValidationErrorCodes.OAUTH_UNAUTHORIZED);
  if(!Number.isSafeInteger(ctx.expiresAtMs)||ctx.expiresAtMs<=nowMs+30000)
    fail(ValidationErrorCodes.OAUTH_EXPIRED);
  if(!Array.isArray(ctx.scopes)||REQUIRED_GAS_SCOPES.some(s=>!ctx.scopes.includes(s)))
    fail(ValidationErrorCodes.OAUTH_SCOPE_INSUFFICIENT);
  return {simulationValidated:true,requiredScopes:[...REQUIRED_GAS_SCOPES]};
}
function verifyFiles(files){
  if(!Array.isArray(files)||!files.length||files.length>1000)fail(ValidationErrorCodes.READBACK_MISMATCH);
  const seen=new Set();
  for(const f of files){
    if(!f||typeof f.name!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(f.name)||
      !['JSON','SERVER_JS','HTML'].includes(f.type)||typeof f.source!=='string'||
      Buffer.byteLength(f.source)>2000000||seen.has(f.name))fail(ValidationErrorCodes.READBACK_MISMATCH);
    seen.add(f.name);
  }
  if(!files.some(f=>f.name==='appsscript'&&f.type==='JSON')||
     !files.some(f=>f.type==='SERVER_JS'))fail(ValidationErrorCodes.READBACK_MISMATCH);
}
export function computeFileSha256(file){
  if(!file||typeof file.name!=='string'||typeof file.type!=='string'||
    typeof file.source!=='string')fail(ValidationErrorCodes.READBACK_MISMATCH);
  // Preserve source bytes exactly (including CRLF); never normalize for rollback.
  return sha(JSON.stringify([file.name,file.type,file.source]));
}
export function computeProjectSha256(files){
  verifyFiles(files);
  return sha(JSON.stringify([...files].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)
    .map(f=>[f.name,f.type,computeFileSha256(f)])));
}
const triggersHash=triggers=>sha(JSON.stringify(triggers));
export async function readProjectSnapshot(client,scriptId){
  if(!mintedClients.has(client)||typeof scriptId!=='string')fail(ValidationErrorCodes.SYNTHETIC_CLIENT_REQUIRED);
  const [meta,content,triggers]=await Promise.all([
    client.getProjectMetadata(scriptId),client.getProjectContent(scriptId),client.listTriggers(scriptId)
  ]);
  verifyFiles(content.files);
  if(!Array.isArray(triggers))fail(ValidationErrorCodes.PROVIDER_INVENTORY_UNVERIFIED);
  const files=structuredClone(content.files);
  return {scriptId,title:meta.title,files,triggers:structuredClone(triggers),
    fileHashes:Object.fromEntries(files.map(f=>[f.name,computeFileSha256(f)])),
    projectSha256:computeProjectSha256(files),triggersSha256:triggersHash(triggers)};
}
export function detectSha256Drift(base,now){
  if(!base||!now||!hex64(base.projectSha256)||!hex64(now.projectSha256))
    fail(ValidationErrorCodes.SHA256_DRIFT_DETECTED);
  const a=base.fileHashes,b=now.fileHashes;
  return {hasDrift:base.projectSha256!==now.projectSha256,
    changedFiles:Object.keys(b).filter(k=>Object.hasOwn(a,k)&&a[k]!==b[k]),
    addedFiles:Object.keys(b).filter(k=>!Object.hasOwn(a,k)),
    removedFiles:Object.keys(a).filter(k=>!Object.hasOwn(b,k))};
}
export function createAndVerifyEncryptedBackup(snapshot,key){
  if(!Buffer.isBuffer(key)||key.length!==32||
    computeProjectSha256(snapshot.files)!==snapshot.projectSha256||
    triggersHash(snapshot.triggers)!==snapshot.triggersSha256)
    fail(ValidationErrorCodes.BACKUP_VERIFICATION_FAILED);
  const iv=crypto.randomBytes(12),backupId=crypto.randomUUID();
  const bundle={backupId,scriptId:snapshot.scriptId,
    expectedProjectSha256:snapshot.projectSha256,expectedTriggersSha256:snapshot.triggersSha256,
    algorithm:'AES-256-GCM',ivBase64:iv.toString('base64')};
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(JSON.stringify([backupId,bundle.scriptId,bundle.expectedProjectSha256])));
  const plaintext=JSON.stringify({scriptId:snapshot.scriptId,files:snapshot.files,triggers:snapshot.triggers});
  bundle.ciphertextBase64=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]).toString('base64');
  bundle.authTagBase64=cipher.getAuthTag().toString('base64');
  decryptAndVerifyBackup(bundle,key);
  return bundle;
}
export function decryptAndVerifyBackup(bundle,key){
  try{
    if(!Buffer.isBuffer(key)||key.length!==32||bundle?.algorithm!=='AES-256-GCM'||
      !hex64(bundle.expectedProjectSha256)||!hex64(bundle.expectedTriggersSha256))
      fail(ValidationErrorCodes.BACKUP_VERIFICATION_FAILED);
    const iv=Buffer.from(bundle.ivBase64,'base64'),tag=Buffer.from(bundle.authTagBase64,'base64');
    if(iv.length!==12||tag.length!==16)fail(ValidationErrorCodes.BACKUP_VERIFICATION_FAILED);
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(Buffer.from(JSON.stringify([bundle.backupId,bundle.scriptId,bundle.expectedProjectSha256])));
    decipher.setAuthTag(tag);
    const data=JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(bundle.ciphertextBase64,'base64')),decipher.final()]).toString('utf8'));
    if(data.scriptId!==bundle.scriptId||
      computeProjectSha256(data.files)!==bundle.expectedProjectSha256||
      triggersHash(data.triggers)!==bundle.expectedTriggersSha256)
      fail(ValidationErrorCodes.BACKUP_VERIFICATION_FAILED);
    return data;
  }catch{fail(ValidationErrorCodes.BACKUP_VERIFICATION_FAILED);}
}
// Only synthetic assertions; external IDE/API writers cannot be excluded by local leases.
export function verifyWritersAndTriggersGuard({baselineSnapshot,currentRemoteSnapshot,
  activeLease,actorId,independentInventory}){
  if(typeof actorId!=='string'||!actorId.trim()||!activeLease||
    typeof activeLease.holderId!=='string'||!activeLease.holderId.trim()||
    activeLease.holderId!==actorId||!Number.isFinite(activeLease.expiresAtMs)||
    activeLease.expiresAtMs<Date.now()+30000)fail(ValidationErrorCodes.CONCURRENT_WRITER_ACTIVE);
  // Detect real trigger drift before reporting stale or incomplete inventory.
  // Either outcome is fail-closed; callers cannot use these hints as authority.
  if(baselineSnapshot.triggersSha256!==currentRemoteSnapshot.triggersSha256)
    fail(ValidationErrorCodes.TRIGGER_MUTATION_FORBIDDEN);
  if(!independentInventory||independentInventory.verified!==true||
    independentInventory.completeProjectInventory!==true||
    independentInventory.coversExternalWriters!==true||
    independentInventory.projectId!==baselineSnapshot.scriptId||
    independentInventory.triggerFingerprint!==baselineSnapshot.triggersSha256)
    fail(ValidationErrorCodes.PROVIDER_INVENTORY_UNVERIFIED);
  if(baselineSnapshot.scriptId!==currentRemoteSnapshot.scriptId||
    detectSha256Drift(baselineSnapshot,currentRemoteSnapshot).hasDrift)
    fail(ValidationErrorCodes.SHA256_DRIFT_DETECTED);
  return {simulationValidated:true};
}
export function createSignedApproval({ticketId,approverId,scriptId,expectedSourceHash,
  expiresAtMs,approvalSecretKey}){
  return {ticketId,approverId,expiresAtMs,signatureHex:crypto.createHmac('sha256',approvalSecretKey)
    .update(JSON.stringify([ticketId,approverId,scriptId,expectedSourceHash,expiresAtMs])).digest('hex')};
}
export function verifyIndependentAuthorization({actorId,scriptId,expectedSourceHash,
  independentApproval:a,approvalSecretKey,nowMs=Date.now()}){
  if(!a||!a.approverId||!a.ticketId||!Number.isSafeInteger(a.expiresAtMs)||
    a.expiresAtMs<=nowMs||!hex64(expectedSourceHash)||
    !Buffer.isBuffer(approvalSecretKey)||!/^[a-f0-9]{64}$/.test(a.signatureHex||''))
    fail(ValidationErrorCodes.INDEPENDENT_AUTH_REQUIRED);
  if(actorId===a.approverId)fail(ValidationErrorCodes.SELF_APPROVAL_FORBIDDEN);
  const expected=createSignedApproval({ticketId:a.ticketId,approverId:a.approverId,
    scriptId,expectedSourceHash,expiresAtMs:a.expiresAtMs,approvalSecretKey});
  if(!crypto.timingSafeEqual(Buffer.from(a.signatureHex,'hex'),
    Buffer.from(expected.signatureHex,'hex')))fail(ValidationErrorCodes.INDEPENDENT_AUTH_REQUIRED);
  return {simulationValidated:true};
}
export class IdempotencyAndRecoveryJournal {
  constructor(){this.jobs=new Map();}
  beginJob({idempotencyKey,scriptId,baselineSha256,expectedSmokeSha256,backupBundle}){
    if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey))
      fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);
    if(this.jobs.has(idempotencyKey))fail(
      ['IN_PROGRESS','RECONCILIATION_REQUIRED'].includes(this.jobs.get(idempotencyKey).status)?
        ValidationErrorCodes.RECONCILIATION_REQUIRED:ValidationErrorCodes.DUPLICATE_JOB_BLOCKED);
    if([...this.jobs.values()].some(j=>j.scriptId===scriptId&&
      ['IN_PROGRESS','RECONCILIATION_REQUIRED'].includes(j.status)))
      fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);
    this.jobs.set(idempotencyKey,{scriptId,baselineSha256,expectedSmokeSha256,
      backupBundle,status:'IN_PROGRESS',attempts:{smoke:0,rollback:0}});
  }
  recordPutAttempt(key,step){
    const job=this.jobs.get(key);
    if(!job||job.status!=='IN_PROGRESS')fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);
    if(!['smoke','rollback'].includes(step)||job.attempts[step]>=1)
      fail(ValidationErrorCodes.AUTOMATIC_PUT_RETRY_FORBIDDEN);
    job.attempts[step]++;
  }
  markHold(key){const j=this.jobs.get(key);if(j)j.status='RECONCILIATION_REQUIRED';}
  markRolledBack(key,hash){const j=this.jobs.get(key);if(j){j.status='ROLLED_BACK';j.hash=hash;}}
  // Synthetic restart recovery requires an explicit executor-liveness probe.
  // Neither a checkpoint nor elapsed time proves that a real executor stopped.
  async recoverAbandonedJob(key,{isExecutorLive}={}){
    const job=this.jobs.get(key);
    if(job?.status!=='IN_PROGRESS'||typeof isExecutorLive!=='function')
      fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);
    let live;
    try{live=await isExecutorLive(Object.freeze({idempotencyKey:key,scriptId:job.scriptId}));}
    catch{fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);}
    if(live!==false)fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);
    this.markHold(key);
    return Object.freeze({status:'RECONCILIATION_REQUIRED',syntheticOnly:true});
  }
  getJob(key){return this.jobs.get(key)||null;}
  exportSyntheticCheckpoint(){return structuredClone([...this.jobs]);}
  static fromSyntheticCheckpoint(value){const j=new IdempotencyAndRecoveryJournal();
    j.jobs=new Map(structuredClone(value));return j;}
}
const mintedClients=new WeakSet();
export const SMOKE_FILE_NAME='ArchelaosBridgeSmoke';
export const SMOKE_FILE_SOURCE='// Synthetic test only.\nfunction __archelaosBridgeSmokeCheck() {return "OK";}\n';
export function createSyntheticGasEnvironment({timeoutAfterSmoke=false,rollbackFails=false,
  failPostWriteReadAt=0}={}){
  const scriptId='synthetic-archelaos-script';
  let files=[{name:'appsscript',type:'JSON',source:'{"timeZone":"Europe/Athens"}'},
    {name:'Main',type:'SERVER_JS',source:'function doPost() {\r\n  return null;\r\n}\r\n'}];
  let triggers=[{id:'synthetic-trigger',handler:'submit'}],puts=0,postWriteReads=0;
  const client=Object.freeze({
    async getProjectMetadata(id){if(id!==scriptId)throw Error('SYNTHETIC_ONLY');return {title:'Synthetic'};},
    async getProjectContent(id){if(id!==scriptId)throw Error('SYNTHETIC_ONLY');
      if(puts>0&&++postWriteReads===failPostWriteReadAt)throw Error('SYNTHETIC_READ_FAILURE');
      return {files:structuredClone(files)};},
    async listTriggers(id){if(id!==scriptId)throw Error('SYNTHETIC_ONLY');
      return structuredClone(triggers);},
    async updateProjectContent(id,next){
      if(id!==scriptId)throw Error('SYNTHETIC_ONLY');
      verifyFiles(next);puts++;
      if(timeoutAfterSmoke&&puts===1){files=structuredClone(next);throw Error('SYNTHETIC_TIMEOUT');}
      if(rollbackFails&&puts===2)throw Error('SYNTHETIC_ROLLBACK_FAILURE');
      files=structuredClone(next);
    }
  });
  mintedClients.add(client);
  return {scriptId,client,getPutCalls:()=>puts,
    mutateExternally:x=>{files=structuredClone(x);},
    mutateTriggersExternally:x=>{triggers=structuredClone(x);}};
}
export async function runSmokeWriteAndRollbackLifecycle({scriptId,idempotencyKey,gasClient,journal,
  oauthContext,expectedPrincipal,actorId,activeLease,independentInventory,
  independentApproval,approvalSecretKey,backupEncryptionKey,
  executionMode='SIMULATION',featureFlags={liveGasWriteEnabled:false}}){
  if(executionMode!=='SIMULATION'||featureFlags?.liveGasWriteEnabled===true)
    fail(ValidationErrorCodes.LIVE_WRITE_DISABLED_BY_DEFAULT);
  if(!mintedClients.has(gasClient)||!(journal instanceof IdempotencyAndRecoveryJournal))
    fail(ValidationErrorCodes.SYNTHETIC_CLIENT_REQUIRED);
  // An unresolved job on this project must block new work even before a new
  // source read or approval check; a restarted production writer must reconcile.
  if([...journal.jobs.values()].some(j=>j.scriptId===scriptId&&
    ['IN_PROGRESS','RECONCILIATION_REQUIRED'].includes(j.status)))
    fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);
  verifyAuthorizedOAuth(oauthContext,{expectedPrincipal});
  const base=await readProjectSnapshot(gasClient,scriptId);
  verifyIndependentAuthorization({actorId,scriptId,expectedSourceHash:base.projectSha256,
    independentApproval,approvalSecretKey});
  if(base.files.some(f=>f.name===SMOKE_FILE_NAME))fail(ValidationErrorCodes.READBACK_MISMATCH);
  const pre=await readProjectSnapshot(gasClient,scriptId);
  verifyWritersAndTriggersGuard({baselineSnapshot:base,currentRemoteSnapshot:pre,
    activeLease,actorId,independentInventory});
  const backup=createAndVerifyEncryptedBackup(base,backupEncryptionKey);
  const expected=[...base.files,{name:SMOKE_FILE_NAME,type:'SERVER_JS',source:SMOKE_FILE_SOURCE}];
  const expectedSha=computeProjectSha256(expected);
  journal.beginJob({idempotencyKey,scriptId,baselineSha256:base.projectSha256,
    expectedSmokeSha256:expectedSha,backupBundle:backup});
  journal.recordPutAttempt(idempotencyKey,'smoke');
  try{await gasClient.updateProjectContent(scriptId,expected);}
  catch{journal.markHold(idempotencyKey);fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);}
  const smoke=await readProjectSnapshot(gasClient,scriptId)
    .catch(e=>{journal.markHold(idempotencyKey);throw e;});
  if(smoke.projectSha256!==expectedSha||smoke.triggersSha256!==base.triggersSha256){
    journal.markHold(idempotencyKey);fail(ValidationErrorCodes.READBACK_MISMATCH);
  }
  const recheck=await readProjectSnapshot(gasClient,scriptId)
    .catch(e=>{journal.markHold(idempotencyKey);throw e;});
  if(recheck.projectSha256!==expectedSha||recheck.triggersSha256!==base.triggersSha256){
    journal.markHold(idempotencyKey);fail(ValidationErrorCodes.ROLLBACK_VERIFICATION_FAILED);
  }
  const original=decryptAndVerifyBackup(backup,backupEncryptionKey);
  journal.recordPutAttempt(idempotencyKey,'rollback');
  try{await gasClient.updateProjectContent(scriptId,original.files);}
  catch{journal.markHold(idempotencyKey);fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);}
  const final=await readProjectSnapshot(gasClient,scriptId)
    .catch(e=>{journal.markHold(idempotencyKey);throw e;});
  if(final.projectSha256!==base.projectSha256||final.triggersSha256!==base.triggersSha256||
     final.files.some(f=>f.name===SMOKE_FILE_NAME)){
    journal.markHold(idempotencyKey);fail(ValidationErrorCodes.ROLLBACK_VERIFICATION_FAILED);
  }
  journal.markRolledBack(idempotencyKey,final.projectSha256);
  return {status:'SYNTHETIC_SMOKE_AND_ROLLBACK_VERIFIED',
    baselineSha256:base.projectSha256,smokeProjectSha256:expectedSha,
    postRollbackSha256:final.projectSha256,triggersUnchanged:true,
    syntheticPutAttempts:structuredClone(journal.getJob(idempotencyKey).attempts),
    liveGoogleWrites:0,liveBrainCalls:0};
}
// No automatic repair after timeout: identify hold, require a separately signed operator.
export async function reconcileUncertainJob({idempotencyKey,gasClient,journal}){
  if(!mintedClients.has(gasClient)||!(journal instanceof IdempotencyAndRecoveryJournal))
    fail(ValidationErrorCodes.SYNTHETIC_CLIENT_REQUIRED);
  const job=journal.getJob(idempotencyKey);
  if(job?.status!=='RECONCILIATION_REQUIRED')fail(ValidationErrorCodes.RECONCILIATION_REQUIRED);
  const remote=await readProjectSnapshot(gasClient,job.scriptId);
  if(remote.triggersSha256!==job.backupBundle.expectedTriggersSha256)
    return {status:'EXTERNAL_TRIGGER_DRIFT_HOLD',putAttempts:0};
  if(remote.projectSha256===job.baselineSha256){
    journal.markRolledBack(idempotencyKey,remote.projectSha256);
    return {status:'ALREADY_CLEAN',putAttempts:0};
  }
  if(remote.projectSha256===job.expectedSmokeSha256)
    return {status:'MANUAL_SIGNED_RESTORE_REQUIRED',putAttempts:0};
  return {status:'EXTERNAL_SOURCE_DRIFT_HOLD',putAttempts:0};
}
export function buildSafeBrainMetadataEnvelope(raw){
  const keys=['eventId','operation','status','baselineSha256','smokeProjectSha256',
    'postRollbackSha256','triggersUnchanged','backupVerified','timestamp'];
  if(!exact(raw,keys)||keys.slice(3,6).some(k=>!hex64(raw[k]))||
    typeof raw.eventId!=='string'||typeof raw.timestamp!=='string'||
    raw.postRollbackSha256!==raw.baselineSha256||
    !/^[A-Za-z0-9_-]{8,80}$/.test(raw.eventId)||raw.operation!=='GAS_SYNTHETIC_SMOKE_ROLLBACK'||
    raw.status!=='SYNTHETIC_VERIFIED'||raw.triggersUnchanged!==true||
    raw.backupVerified!==true||!Number.isFinite(Date.parse(raw.timestamp)))
    fail(ValidationErrorCodes.UNSAFE_BRAIN_PAYLOAD_BLOCKED);
  return Object.freeze({...raw,simulationOnly:true});
}
export async function relayMetadataToCentralBrain({rawEvent,liveBrainCallsEnabled=false}){
  if(liveBrainCallsEnabled)fail(ValidationErrorCodes.LIVE_BRAIN_CALL_DISABLED_BY_DEFAULT);
  return {relayedLive:false,mode:'SYNTHETIC_DIAGNOSTIC_ONLY',
    envelope:buildSafeBrainMetadataEnvelope(rawEvent)};
}
