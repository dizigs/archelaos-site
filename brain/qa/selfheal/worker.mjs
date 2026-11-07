// Dedicated source-only fixture for the TWO EXISTING isolated QA previews.
// No wrangler config, operational import, provider adapter, alarm or schedule.
import {DurableObject,WorkerEntrypoint} from 'cloudflare:workers';
import {FIELDS,guard,record,sign,verify,digest,nonce,refuse} from './protocol.mjs';
const first=(sql,q,...p)=>[...sql.exec(q,...p)][0];
async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('QA_RPC_TIMEOUT')),2000);})]);}finally{clearTimeout(timer);}}
export class IsolatedSelfhealQaMemory extends DurableObject{
  #storage;#env;
  constructor(ctx,env){
    super(ctx,env);guard(env);this.#storage=ctx.storage;this.#env=env;
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS qa_once(id INTEGER PRIMARY KEY CHECK(id=1),challenge TEXT,digest TEXT,status TEXT,attempts INTEGER)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS qa_receipt(id INTEGER PRIMARY KEY CHECK(id=1),digest TEXT,nonce TEXT,ack TEXT)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS qa_nonce(nonce TEXT PRIMARY KEY)');
  }
  #role(role){guard(this.#env);if(this.#env.QA_ROLE!==role)refuse();}
  #claim(n){this.#storage.transactionSync(()=>{
    if(first(this.#storage.sql,'SELECT COUNT(*) AS n FROM qa_nonce').n>=32)refuse();
    this.#storage.sql.exec('INSERT INTO qa_nonce(nonce) VALUES(?)',n);
  });}
  async #operator(request,scope){
    const r=await verify(request,'start',scope,this.#env,this.#env.QA_RUNNER_KEY);
    this.#claim(r.nonce);return r;
  }
  #base(scope){return {v:1,scope,runId:this.#env.QA_RUN_ID,sourceSha:this.#env.QA_SOURCE_SHA,issuedAtMs:Date.now(),nonce:nonce()};}
  async start(request){
    this.#role('brain');await this.#operator(request,'qa.start.v1');
    const challenge=await sign(this.#base('qa.challenge.v1'),FIELDS.challenge,this.#env.HEALER_EVENT_HMAC_KEY);
    const hash=await digest(challenge);
    // Durable once-only barrier BEFORE remote delivery; never retry start.
    this.#storage.transactionSync(()=>{
      if(first(this.#storage.sql,'SELECT id FROM qa_once WHERE id=1'))refuse();
      this.#storage.sql.exec("INSERT INTO qa_once VALUES(1,?,?,'UNKNOWN',1)",JSON.stringify(challenge),hash);
    });
    try{
      const ack=await bounded(this.#env.QA_PEER.accept(challenge));
      await this.#checkAck(ack,challenge,hash);
      return await this.#reconcile(challenge,hash);
    }catch{return {status:'UNKNOWN',runId:this.#env.QA_RUN_ID,safeToRetry:false};}
  }
  async #checkAck(value,challenge,hash){
    const ack=await verify(value,'ack','qa.ack.v1',this.#env,this.#env.HEALER_EVENT_HMAC_KEY);
    if(ack.challengeDigest!==hash||ack.deliveryNonce!==challenge.nonce||ack.status!=='QA_RECEIVED_NO_ACTION')refuse();
    return ack;
  }
  async accept(request){
    this.#role('healer');
    const challenge=await verify(request,'challenge','qa.challenge.v1',this.#env,this.#env.HEALER_EVENT_HMAC_KEY);
    const hash=await digest(challenge);
    const ack=await sign({v:1,scope:'qa.ack.v1',runId:challenge.runId,sourceSha:challenge.sourceSha,
      challengeDigest:hash,deliveryNonce:challenge.nonce,storedAtMs:Date.now(),status:'QA_RECEIVED_NO_ACTION'},
      FIELDS.ack,this.#env.HEALER_EVENT_HMAC_KEY);
    // Duplicate delivery is denied, unlike a production idempotent command.
    this.#storage.transactionSync(()=>{
      if(first(this.#storage.sql,'SELECT id FROM qa_receipt WHERE id=1'))refuse();
      this.#storage.sql.exec('INSERT INTO qa_receipt VALUES(1,?,?,?)',hash,challenge.nonce,JSON.stringify(ack));
    });
    return JSON.parse(JSON.stringify(ack));
  }
  async read(request){
    this.#role('healer');
    const q=await verify(request,'read','qa.read.v1',this.#env,this.#env.HEALER_EVENT_HMAC_KEY);
    this.#claim(q.nonce);
    const saved=first(this.#storage.sql,'SELECT * FROM qa_receipt WHERE id=1');
    if(!saved||saved.digest!==q.challengeDigest||saved.nonce!==q.deliveryNonce)refuse();
    const ack=await this.#checkAck(JSON.parse(saved.ack),{nonce:q.deliveryNonce},q.challengeDigest);
    return sign({v:1,scope:'qa.reply.v1',runId:q.runId,sourceSha:q.sourceSha,
      challengeDigest:q.challengeDigest,deliveryNonce:q.deliveryNonce,issuedAtMs:Date.now(),
      nonce:q.nonce,status:'FOUND',ack},FIELDS.reply,this.#env.HEALER_EVENT_HMAC_KEY);
  }
  async #reconcile(challenge,hash){
    const q=await sign({...this.#base('qa.read.v1'),challengeDigest:hash,deliveryNonce:challenge.nonce},
      FIELDS.read,this.#env.HEALER_EVENT_HMAC_KEY);
    const raw=await bounded(this.#env.QA_PEER.read(q));
    // Normalize nested ACK before checking the outer signed message: RPC may
    // decorate both records with non-enumerable lifetime metadata.
    const outer=record(raw,FIELDS.reply);
    outer.ack=record(outer.ack,FIELDS.ack);
    const reply=await verify(outer,'reply','qa.reply.v1',this.#env,this.#env.HEALER_EVENT_HMAC_KEY);
    if(reply.nonce!==q.nonce||reply.challengeDigest!==hash||reply.deliveryNonce!==challenge.nonce||
      reply.status!=='FOUND')refuse();
    await this.#checkAck(reply.ack,challenge,hash);
    this.#storage.transactionSync(()=>{
      const prior=first(this.#storage.sql,'SELECT * FROM qa_once WHERE id=1');
      if(prior?.digest!==hash)refuse();
      this.#storage.sql.exec("UPDATE qa_once SET status='ACKNOWLEDGED' WHERE id=1");
    });
    return {status:'ACKNOWLEDGED',runId:this.#env.QA_RUN_ID,challengeDigest:hash,deliveryAttempts:1,
      syntheticOnly:true,recoveryExecuted:false,productionAuthenticated:false};
  }
  async reconcile(request){
    this.#role('brain');await this.#operator(request,'qa.reconcile.v1');
    const prior=first(this.#storage.sql,'SELECT * FROM qa_once WHERE id=1');if(!prior)refuse();
    try{return await this.#reconcile(JSON.parse(prior.challenge),prior.digest);}
    catch{return {status:'UNKNOWN',runId:this.#env.QA_RUN_ID,safeToRetry:false};}
  }
  async status(request){
    await this.#operator(request,'qa.status.v1');
    const r=first(this.#storage.sql,'SELECT status,attempts FROM qa_once WHERE id=1');
    return {runId:this.#env.QA_RUN_ID,status:r?.status||'NOT_STARTED',deliveryAttempts:r?.attempts||0,
      receipts:first(this.#storage.sql,'SELECT COUNT(*) AS n FROM qa_receipt').n,
      syntheticOnly:true,recoveryExecuted:false};
  }
}
export default class IsolatedSelfhealQaPort extends WorkerEntrypoint{
  #memory(){guard(this.env);return this.env.QA_MEMORY.get(this.env.QA_MEMORY.idFromName('qa-'+this.env.QA_RUN_ID));}
  async start(request){return this.#memory().start(request);}
  async accept(request){return this.#memory().accept(request);}
  async read(request){return this.#memory().read(request);}
  async reconcile(request){return this.#memory().reconcile(request);}
  async status(request){return this.#memory().status(request);}
  async fetch(){return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});}
}
