// Dormant named QA classes; export alone does not install private runner or acceptance bindings.
// No recovery imports, canonical DO bindings, HTTP intake, cron, AI or fetch calls.
import {DurableObject,WorkerEntrypoint} from 'cloudflare:workers';
import {acceptanceConfig,acceptanceDigest,createAcceptanceChallenge,verifyAcceptanceChallenge,
  answerAcceptanceChallenge,verifyAcceptanceResponse,disposeAcceptanceRpc} from './private_hmac_protocol.mjs';

const unknown=()=>({status:'UNKNOWN',code:'PRIVATE_HMAC_ACCEPTANCE_UNVERIFIED',actionsExecuted:0});
// The opaque stage code is exposed ONLY on isolated, explicitly opted-in QA
// Workers. No keys, input payloads or error messages leave the worker.
function qaFailure(env,stage) {
  return env?.PRIVATE_HMAC_DIAGNOSTIC_ENABLED==='true' &&
    env?.PRIVATE_HMAC_ACCEPTANCE_ISOLATED==='true' &&
    /^[A-Z_]{3,35}$/.test(stage) ?
    {status:'UNKNOWN',code:'QA_DIAG_'+stage,actionsExecuted:0} : unknown();
}
function nonceStore(env) {
  // Only an operator-attested ISOLATED preview namespace may be bound here.
  return env.HMAC_NONCES.get(env.HMAC_NONCES.idFromName('private-hmac-acceptance-v1'));
}
async function boundedRpc(call) {
  let timer,expired=false;
  const pending=Promise.resolve().then(call).then(value=>{
    if (expired) disposeAcceptanceRpc(value);
    return value;
  });
  try {return await Promise.race([pending,new Promise((_,reject)=>{
    timer=setTimeout(()=>{expired=true;reject(new Error('PRIVATE_HMAC_RPC_TIMEOUT'));},1500);
  })]);} finally {clearTimeout(timer);}
}
function validReservation(value) {
  return value && Object.getPrototypeOf(value)===Object.prototype &&
    Reflect.ownKeys(value).length===4 &&
    ['sessionId','nonce','challengeDigest','expiresAtMs'].every(k=>Object.hasOwn(value,k)) &&
    /^[a-f0-9-]{36}$/.test(value.sessionId) && /^[a-f0-9]{64}$/.test(value.nonce) &&
    /^[a-f0-9]{64}$/.test(value.challengeDigest) && Number.isSafeInteger(value.expiresAtMs);
}
// Replay state ONLY in an isolated acceptance namespace, never either canonical
// namespace. No credentials, signed transcripts, incidents or repair data stored.
export class PrivateHmacNonceStore extends DurableObject {
  #storage;
  constructor(ctx,env) {
    super(ctx,env);
    acceptanceConfig(env,env.PRIVATE_HMAC_ACCEPTANCE_ROLE);
    this.#storage=ctx.storage;
    this.#storage.sql.exec("CREATE TABLE IF NOT EXISTS acceptance_nonces(session_id TEXT,nonce TEXT,challenge_digest TEXT,state TEXT CHECK(state IN ('CLAIMED','ANSWERED','VERIFIED','UNKNOWN')),expires INTEGER,PRIMARY KEY(session_id,nonce))");
  }
  async reserve(value) {
    const now=Date.now(),config=acceptanceConfig(this.env,this.env.PRIVATE_HMAC_ACCEPTANCE_ROLE,now);
    if (!validReservation(value) || value.sessionId!==config.sessionId ||
        value.expiresAtMs<=now || value.expiresAtMs>config.end || value.expiresAtMs>now+11000) return false;
    return this.#storage.transactionSync(()=>{
      const sql=this.#storage.sql;
      sql.exec('DELETE FROM acceptance_nonces WHERE expires<=?',now);
      if ([...sql.exec('SELECT COUNT(*) AS n FROM acceptance_nonces')][0].n>=16 ||
          [...sql.exec('SELECT nonce FROM acceptance_nonces WHERE session_id=? AND nonce=?',value.sessionId,value.nonce)].length) return false;
      sql.exec("INSERT INTO acceptance_nonces VALUES(?,?,?,'CLAIMED',?)",value.sessionId,value.nonce,value.challengeDigest,value.expiresAtMs);
      return true;
    });
  }
  async finish(value,outcome) {
    const config=acceptanceConfig(this.env,this.env.PRIVATE_HMAC_ACCEPTANCE_ROLE);
    const allowed=config.role==='brain' ? ['VERIFIED','UNKNOWN'] : ['ANSWERED'];
    if (!validReservation(value) || value.sessionId!==config.sessionId || !allowed.includes(outcome)) return false;
    return this.#storage.transactionSync(()=>{
      const sql=this.#storage.sql;
      const row=[...sql.exec('SELECT * FROM acceptance_nonces WHERE session_id=? AND nonce=?',value.sessionId,value.nonce)][0];
      if (!row || row.state!=='CLAIMED' || row.challenge_digest!==value.challengeDigest || row.expires<=Date.now()) return false;
      sql.exec('UPDATE acceptance_nonces SET state=? WHERE session_id=? AND nonce=?',outcome,value.sessionId,value.nonce);
      return true;
    });
  }
}

export class BrainHmacAcceptancePort extends WorkerEntrypoint {
  async runChallenge(input) {
    let store,reservation,stage='CONFIG';
    try {
      if (input!==undefined) return unknown();
      const config=acceptanceConfig(this.env,'brain');
      stage='CHALLENGE_SIGNATURE';
      const request=await createAcceptanceChallenge(config,this.env.HEALER_EVENT_HMAC_KEY);
      reservation={sessionId:request.sessionId,nonce:request.nonce,
        challengeDigest:await acceptanceDigest(request),expiresAtMs:request.expiresAtMs};
      stage='BRAIN_NONCE_RESERVE';
      store=nonceStore(this.env);
      if (!await store.reserve(reservation)) return qaFailure(this.env,stage);
      stage='PRIVATE_PEER_RPC';
      const raw=await boundedRpc(()=>this.env.HMAC_PEER.answerChallenge(request));
      if(raw?.status==='UNKNOWN' && /^QA_DIAG_[A-Z_]{3,35}$/.test(raw.code||'') &&
        this.env.PRIVATE_HMAC_DIAGNOSTIC_ENABLED==='true') return qaFailure(this.env,'PEER_'+raw.code.slice(8));
      stage='RESPONSE_SIGNATURE';
      try {await verifyAcceptanceResponse(raw,request,config,this.env.HEALER_EVENT_HMAC_KEY);}
      finally {disposeAcceptanceRpc(raw);}
      // Recheck the short-lived permit after RPC before reporting a verdict.
      stage='BRAIN_NONCE_FINISH';
      acceptanceConfig(this.env,'brain');
      if (!await store.finish(reservation,'VERIFIED')) return qaFailure(this.env,stage);
      return {status:'KEY_POSSESSION_CONFIRMED',sessionId:config.sessionId,
        sourceSha:config.sourceSha,challengeDigest:reservation.challengeDigest,actionsExecuted:0};
    } catch {
      if (store && reservation) {try {await store.finish(reservation,'UNKNOWN');} catch { /* fail closed */ }}
      return qaFailure(this.env,stage);
    }
  }
}
export class HealerHmacAcceptancePort extends WorkerEntrypoint {
  async answerChallenge(raw) {
    let stage='CONFIG';
    try {
      const config=acceptanceConfig(this.env,'healer');
      stage='REQUEST_SIGNATURE';
      const request=await verifyAcceptanceChallenge(raw,config,this.env.HEALER_EVENT_HMAC_KEY);
      const reservation={sessionId:request.sessionId,nonce:request.nonce,
        challengeDigest:await acceptanceDigest(request),expiresAtMs:request.expiresAtMs};
      stage='HEALER_NONCE_RESERVE';
      const store=nonceStore(this.env);
      if (!await store.reserve(reservation)) return qaFailure(this.env,stage);
      stage='RESPONSE_CREATION';
      const response=await answerAcceptanceChallenge(request,config,this.env.HEALER_EVENT_HMAC_KEY);
      stage='HEALER_NONCE_FINISH';
      acceptanceConfig(this.env,'healer');
      if (!await store.finish(reservation,'ANSWERED')) return qaFailure(this.env,stage);
      return response;
    } catch {return qaFailure(this.env,stage);}
  }
}
// No public acceptance endpoint, including on an accidentally exposed preview.
export default {fetch(){return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});}};
