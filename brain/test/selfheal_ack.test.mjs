import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHmac,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare} from 'miniflare';
import {migrateSignedOutbox} from '../src/selfheal_ack.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const KEY='synthetic-ack-receipt-test-only-'.repeat(3);
const GITHUB_KEY='synthetic-ack-github-source-'.repeat(3);
const RECEIPT_KEY='synthetic-ack-capability-signer-'.repeat(3);
const SHA='a'.repeat(40);
const commandFields=['schemaVersion','issuer','scope','issuedAtMs','nonce','payload'];
const readFields=['schemaVersion','issuer','scope','commandId','commandDigest','deliveryNonce','issuedAtMs','nonce'];
function signed(value,fields){return {...value,signature:createHmac('sha256',KEY).update(value.scope+'\n'+JSON.stringify(Object.fromEntries(fields.map(k=>[k,value[k]])))).digest('hex')}}

function storage(db){return {sql:{exec(q,...params){const s=db.prepare(q);return /^\s*SELECT\b/i.test(q)?s.all(...params):(s.run(...params),[])}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}}}
test('outbox transactional migration preserves legacy UNKNOWN rows, is idempotent and rolls back corrupt/unknown schema',()=>{
 for(const corrupt of [false,true]){
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE selfheal_signed_outbox(receipt_id TEXT PRIMARY KEY,nonce TEXT UNIQUE,claimed_at INTEGER,status TEXT)');
  db.prepare('INSERT INTO selfheal_signed_outbox VALUES(?,?,?,?)').run('old-receipt','old-nonce',123,corrupt?'CORRUPT':'UNKNOWN');
  if(corrupt){assert.throws(()=>migrateSignedOutbox(storage(db)));assert.equal(db.prepare('SELECT status FROM selfheal_signed_outbox').get().status,'CORRUPT')}
  else{migrateSignedOutbox(storage(db));migrateSignedOutbox(storage(db));assert.deepEqual({...db.prepare('SELECT * FROM selfheal_signed_outbox').get()},{receipt_id:'old-receipt',nonce:'old-nonce',claimed_at:123,status:'UNKNOWN',command_json:null,command_digest:null,ack_json:null,settled_at:null})}
  db.close();
 }
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE selfheal_signed_outbox(unreviewed TEXT)');assert.throws(()=>migrateSignedOutbox(storage(db)));assert.equal(db.prepare("SELECT name FROM pragma_table_info('selfheal_signed_outbox')").get().name,'unreviewed');db.close();
});

const brainFixture=String.raw`
 async __ackSeed(id){
  this.sql.exec("INSERT INTO controls(name,value) VALUES('source:github',1) ON CONFLICT(name) DO UPDATE SET value=1");
  this.sql.exec('INSERT INTO selfheal_ci_proofs(receipt_id,fingerprint,source,repository,commit_sha,evidence_id,resource,code,required_check,run_attempt,evidence_digest,issued,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
   id,id.replaceAll('-','')+'f'.repeat(32),'github_actions','dizigs/archelaos-site','a'.repeat(40),'actions:42022399427','/ci','CI_FAILURE','ESLint JavaScript quality',1,'b'.repeat(64),Date.now()-1000,Date.now()+120000);return true;
 }
 async __ackState(){return {outbox:[...this.sql.exec('SELECT * FROM selfheal_signed_outbox ORDER BY receipt_id')],audit:[...this.sql.exec('SELECT * FROM selfheal_audit')],controls:this.controlState()}}
 async __ackLegacy(){this.sql.exec('DROP TABLE selfheal_signed_outbox');this.sql.exec("CREATE TABLE selfheal_signed_outbox(receipt_id TEXT PRIMARY KEY,nonce TEXT NOT NULL UNIQUE,claimed_at INTEGER NOT NULL,status TEXT CHECK(status='UNKNOWN'))");this.sql.exec("INSERT INTO selfheal_signed_outbox VALUES('legacy-id','legacy-nonce',123,'UNKNOWN')");return true}
`;
const healerFixture=String.raw`
 async __ackState(){return {receipts:[...this.recoveryLedger.sql.exec('SELECT * FROM recovery_command_receipts ORDER BY command_id')],nonces:[...this.recoveryLedger.sql.exec('SELECT * FROM recovery_event_nonces ORDER BY id')],recoveries:[...this.recoveryLedger.sql.exec('SELECT * FROM recoveries')],alarm:await this.ctx.storage.getAlarm()}}
 async __ackTamper(id){const row=[...this.recoveryLedger.sql.exec('SELECT ack_json FROM recovery_command_receipts WHERE command_id=?',id)][0];const ack=JSON.parse(row.ack_json);ack.status='RECOVERY_EXECUTED';this.recoveryLedger.sql.exec('UPDATE recovery_command_receipts SET ack_json=? WHERE command_id=?',JSON.stringify(ack),id);return true}
`;
const inspector=String.raw`export default {async fetch(req,env){const input=await req.json();
 const b=env.BRAIN.get(env.BRAIN.idFromName('central-v1'));const h=env.MEMORY.get(env.MEMORY.idFromName('archelaos-club'));
 if(input.op==='seed')return Response.json(await b.__ackSeed(input.id));
 if(input.op==='state')return Response.json({brain:await b.__ackState(),healer:await h.__ackState()});
 if(input.op==='legacy')return Response.json(await b.__ackLegacy());
 if(input.op==='tamper')return Response.json(await h.__ackTamper(input.id));
 if(input.op==='command')return Response.json(await env.HEALER.attemptRecovery(input.envelope));
 if(input.op==='read'){try{return Response.json(await env.HEALER.recoveryStatus(input.envelope))}catch{return Response.json({denied:true})}}
 if(input.op==='probe'){const result=[];for(const [port,names] of [[env.HEALER,['memory','env','ctx','healerMemory']],[env.RECOVERY,['coordinator','env','ctx','requireStaging']]])for(const name of names){try{const value=await port[name];result.push(value==null)}catch{result.push(true)}}return Response.json(result)}
 return new Response('Not found',{status:404});}}`;
const relay=String.raw`import {WorkerEntrypoint} from 'cloudflare:workers';let cached;
export default class extends WorkerEntrypoint {
 async attemptRecovery(e){const ack=await this.env.PEER.attemptRecovery(e);
  if(this.env.MODE==='lost_ack')throw Error('SYNTHETIC_LOST_ACK');
  if(this.env.MODE==='timeout')await new Promise(resolve=>setTimeout(resolve,6000));
  if(this.env.MODE==='forged_ack')return {...ack,commandDigest:'0'.repeat(64)};
  return ack;
 }
 async recoveryStatus(r){
  if(this.env.MODE==='readback_error')throw Error('SYNTHETIC_READBACK_ERROR');
  if(this.env.MODE==='replay_readback'&&cached)return cached;
  const result=await this.env.PEER.recoveryStatus(r);
  if(this.env.MODE==='bad_readback')return {...result,nonce:'0'.repeat(32)};
  cached=result;return result;
 }}
`;

async function fixture(mode='normal',enabled=true){
 const directory=await mkdtemp(join(tmpdir(),'brain-ack-native-'));
 const bpath=resolve('src','.ack-brain-'+randomUUID()+'.mjs');
 const hpath=join(ROOT,'automation/self-heal-worker/src','.ack-healer-'+randomUUID()+'.mjs');
 const bs=await readFile(resolve('src/worker.mjs'),'utf8'),hs=await readFile(join(ROOT,'automation/self-heal-worker/src/worker.mjs'),'utf8');
 await writeFile(bpath,bs.replace('export class BrainCoordinator extends DurableObject {','export class BrainCoordinator extends DurableObject {'+brainFixture));
 await writeFile(hpath,hs.replace('export class HealerMemory extends DurableObject {','export class HealerMemory extends DurableObject {'+healerFixture));
 let mf,outbound=0;
 const build=(fault)=>new Miniflare({workers:[
  {name:'brain',modules:true,scriptPath:bpath,modulesRoot:resolve('src'),compatibilityDate:'2026-07-30',durableObjects:{BRAIN:{className:'BrainCoordinator',useSQLite:true}},
   bindings:{ENVIRONMENT:'staging',DEPLOY_SHA:SHA,STAGING_EXPIRES_AT:new Date(Date.now()+30*60000).toISOString(),BRAIN_SELFHEAL_APPROVED_SHA:SHA,
    BRAIN_SELFHEAL_DISPATCH_ENABLED:'true',BRAIN_SELFHEAL_RECOVERY_ENABLED:'true',BRAIN_SELFHEAL_BINDING_ATTESTED:'true',BRAIN_SELFHEAL_DURABLE_ACK_ENABLED:enabled?'true':'false',
    HEALER_EVENT_HMAC_KEY:KEY,BRAIN_GITHUB_INTAKE_KEY:GITHUB_KEY,BRAIN_CAPABILITY_RECEIPT_KEY:RECEIPT_KEY,BRAIN_PRIVATE_EVENT_SOURCES_ENABLED:'true',BRAIN_PRIVATE_SERVICE_BINDINGS_VERIFIED:'true'},
   serviceBindings:{HEALER:{name:fault==='normal'?'healer':'relay'}}},
  {name:'healer',modules:true,scriptPath:hpath,modulesRoot:join(ROOT,'automation/self-heal-worker/src'),compatibilityDate:'2026-11-01',durableObjects:{HEALER_MEMORY:{className:'HealerMemory',useSQLite:true}},bindings:{HEALER_EVENT_HMAC_KEY:KEY,HEALER_DURABLE_ACK_ENABLED:enabled?'true':'false'},serviceBindings:{BRAIN_RECOVERY:{name:'brain',entrypoint:'BrainRecoveryPort'}}},
  {name:'relay',modules:true,script:relay,compatibilityDate:'2026-11-01',bindings:{MODE:fault},serviceBindings:{PEER:{name:'healer'}}},
  {name:'inspector',modules:true,script:inspector,compatibilityDate:'2026-11-01',durableObjects:{BRAIN:{className:'BrainCoordinator',scriptName:'brain',useSQLite:true},MEMORY:{className:'HealerMemory',scriptName:'healer',useSQLite:true}},serviceBindings:{HEALER:{name:'healer'},RECOVERY:{name:'brain',entrypoint:'BrainRecoveryPort'}}}
 ],durableObjectsPersist:directory,outboundService:async()=>{outbound++;return new Response('NO_EXTERNAL_EGRESS',{status:503})}});
 mf=build(mode);
 return {
  async inspect(input){const w=await mf.getWorker('inspector');const r=await w.fetch('https://synthetic.invalid/',{method:'POST',body:JSON.stringify(input)});assert.equal(r.status,200);return r.json()},
  async dispatch(id,readback=false){const w=await mf.getWorker('brain');const path='/v1/selfheal/dispatch';const data=JSON.stringify(readback?{receiptId:id,mode:'readback'}:{receiptId:id});const at=String(Math.floor(Date.now()/1000));const signature=createHmac('sha256',GITHUB_KEY).update(['POST',path,at,data].join('\n')).digest('hex');const r=await w.fetch('https://synthetic.invalid'+path,{method:'POST',headers:{'content-type':'application/json','x-archelaos-key-id':'github-v1','x-archelaos-timestamp':at,'x-archelaos-signature':signature},body:data});return {http:r.status,body:await r.json()}},
  async restart(next='normal'){await mf.dispose();mf=build(next)},
  async close(){await mf.dispose();await unlink(bpath);await unlink(hpath);await rm(directory,{recursive:true,force:true});assert.equal(outbound,0)}
 };
}
function command(row,patch={}){return signed({schemaVersion:2,issuer:'canonical-brain',scope:'selfheal.command.v1',issuedAtMs:row.claimed_at,nonce:row.nonce,payload:row.command_json,...patch},commandFields)}
function readRequest(row,patch={}){return signed({schemaVersion:1,issuer:'canonical-brain',scope:'selfheal.ack.read.v1',commandId:row.receipt_id,commandDigest:row.command_digest,deliveryNonce:row.nonce,issuedAtMs:Date.now(),nonce:'f'.repeat(32),...patch},readFields)}

test('native durable ACK requires independent stored readback, settles once, survives restart; approved RPC boundaries stay closed',async()=>{
 const f=await fixture();try{const id=randomUUID();await f.inspect({op:'seed',id});const r=await f.dispatch(id);assert.equal(r.http,200);assert.equal(r.body.status,'ACKNOWLEDGED');assert.equal(r.body.recoveryExecuted,false);
  let state=await f.inspect({op:'state'});assert.equal(state.healer.receipts.length,1);assert.equal(state.healer.recoveries.length,0);assert.equal(state.brain.audit.length,1);assert.equal(state.brain.outbox[0].status,'ACKNOWLEDGED');assert.equal(state.brain.controls.aiPaused,true);
  assert.ok((await f.inspect({op:'probe'})).every(Boolean));
  const envelope=command(state.brain.outbox[0]);const original=JSON.parse(state.healer.receipts[0].ack_json);
  const duplicates=await Promise.all([f.inspect({op:'command',envelope}),f.inspect({op:'command',envelope})]);assert.deepEqual(duplicates,[original,original]);
  const request=readRequest(state.brain.outbox[0]);assert.equal((await f.inspect({op:'read',envelope:request})).status,'FOUND');assert.equal((await f.inspect({op:'read',envelope:request})).denied,true);
  await f.restart();assert.equal((await f.dispatch(id,true)).body.status,'ACKNOWLEDGED');state=await f.inspect({op:'state'});assert.equal(state.brain.audit.length,1);assert.equal(state.healer.receipts.length,1);assert.equal((await f.dispatch(id)).body.code,'SIGNED_DISPATCH_ALREADY_CLAIMED');
 }finally{await f.close()}
});
test('native forged/tampered commands, nonce reuse and conflicting command IDs cannot change stored receipts',async()=>{
 const f=await fixture();try{const id=randomUUID();await f.inspect({op:'seed',id});await f.dispatch(id);const before=await f.inspect({op:'state'});const row=before.brain.outbox[0],valid=command(row);
  const cases=[{...valid,signature:'0'.repeat(64)},{...valid,payload:valid.payload+' '},command(row,{issuedAtMs:Date.now()-300001}),command(row,{payload:JSON.stringify({...JSON.parse(row.command_json),commandId:randomUUID()})}),command(row,{payload:row.command_json.replace('42022399427','42022399428')})];
  for(const envelope of cases){assert.equal((await f.inspect({op:'command',envelope})).status,'BLOCKED');assert.deepEqual((await f.inspect({op:'state'})).healer,before.healer)}
 }finally{await f.close()}
});
for(const mode of ['forged_ack','bad_readback','readback_error','lost_ack','timeout'])test('native '+mode+' remains UNKNOWN without redelivery; later authenticated readback can reconcile',async()=>{
 const f=await fixture(mode);try{const id=randomUUID();await f.inspect({op:'seed',id});assert.equal((await f.dispatch(id)).body.status,'UNKNOWN');let state=await f.inspect({op:'state'});assert.equal(state.brain.outbox[0].status,'UNKNOWN');assert.equal(state.brain.audit.length,0);assert.equal(state.healer.receipts.length,1);
  assert.equal((await f.dispatch(id)).body.code,'SIGNED_DISPATCH_ALREADY_CLAIMED');await f.restart();assert.equal((await f.dispatch(id,true)).body.status,'ACKNOWLEDGED');state=await f.inspect({op:'state'});assert.equal(state.healer.receipts.length,1);assert.equal(state.brain.audit.length,1);
 }finally{await f.close()}
});
test('native corrupted durable receipt cannot settle, and replayed readback cannot attest a different command',async()=>{
 const f=await fixture('lost_ack');try{const id=randomUUID();await f.inspect({op:'seed',id});await f.dispatch(id);await f.inspect({op:'tamper',id});await f.restart();assert.equal((await f.dispatch(id,true)).body.status,'UNKNOWN');assert.equal((await f.inspect({op:'state'})).brain.outbox[0].status,'UNKNOWN');}finally{await f.close()}
 const replay=await fixture('replay_readback');try{const a=randomUUID(),b=randomUUID();await replay.inspect({op:'seed',id:a});await replay.inspect({op:'seed',id:b});assert.equal((await replay.dispatch(a)).body.status,'ACKNOWLEDGED');assert.equal((await replay.dispatch(b)).body.status,'UNKNOWN');}finally{await replay.close()}
});
test('native concurrent dispatcher claims once and upgrades pre-existing legacy SQLite without losing UNKNOWN',async()=>{
 const f=await fixture();try{const id=randomUUID();await f.inspect({op:'seed',id});const result=await Promise.all([f.dispatch(id),f.dispatch(id)]);assert.equal(result.filter(r=>r.body.status==='ACKNOWLEDGED').length,1);assert.equal(result.filter(r=>r.body.code==='SIGNED_DISPATCH_ALREADY_CLAIMED').length,1);assert.equal((await f.inspect({op:'state'})).healer.receipts.length,1);}finally{await f.close()}
 const legacy=await fixture();try{await legacy.inspect({op:'legacy'});await legacy.restart();const state=await legacy.inspect({op:'state'});assert.equal(state.brain.outbox[0].receipt_id,'legacy-id');assert.equal(state.brain.outbox[0].status,'UNKNOWN');assert.equal(state.brain.outbox[0].command_json,null);}finally{await legacy.close()}
});
test('tracked configuration keeps ACK activation, recovery and staging OFF',async()=>{
 const brain=await readFile(resolve('wrangler.toml'),'utf8');const healer=await readFile(join(ROOT,'automation/self-heal-worker/wrangler.toml'),'utf8');
 assert.match(brain,/^BRAIN_SELFHEAL_DURABLE_ACK_ENABLED = "false"$/m);assert.match(healer,/^HEALER_DURABLE_ACK_ENABLED = "false"$/m);assert.match(brain,/^STAGING_EXPIRES_AT = "1970-01-01T00:00:00Z"$/m);
});
