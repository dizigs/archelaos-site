/** Trusted, opt-in native Cloudflare Apps Script -> canonical Brain port.
 * Transport ONLY: no Worker entrypoint, URL route, Google read/write, trigger or
 * mount in deployed Bridge. Never build these ports from HTTP/JSON input.
 */
import {validateAppsScriptEvent} from '../../../brain/src/capability_intake.mjs';
const ROOT='https://brain.internal', ID='apps-script-v1';
const SHA40=/^[a-f0-9]{40}$/, HEX=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AUD='apps-script.receipt.readback.v1', KEY_ID='brain-capability-receipts-v1';
const READBACK=['receiptId','eventId','correlationId','source','sourceRevision',
  'transport','phase','evidenceDigest','status','durable','schemaVersion',
  'audience','principal','keyId','issuedAtMs','receiptSignature'];
const PROJECTION=['eventId','correlationId','receiptId','source',
  'sourceRevision','transport','status','durable'];
const encode=s=>new TextEncoder().encode(s);
const toHex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export class PrivateBrainPortBlocked extends Error {
  constructor(code){super(code);this.code=code;}
}
const fail=code=>{throw new PrivateBrainPortBlocked(code);};
const exact=(v,keys)=>v && typeof v==='object' && !Array.isArray(v) &&
  Object.getPrototypeOf(v)===Object.prototype &&
  Reflect.ownKeys(v).length===keys.length &&
  keys.every(k=>Object.hasOwn(v,k) &&
    !Object.getOwnPropertyDescriptor(v,k).get);
async function mac(key,message){
  const k=await crypto.subtle.importKey('raw',encode(key),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return toHex(await crypto.subtle.sign('HMAC',k,encode(message)));
}
async function limitedJson(res){
  if(!res || typeof res.ok!=='boolean' || !res.ok)fail('BRAIN_PRIVATE_REJECTED');
  const reader=res.body?.getReader?.();
  if(!reader)fail('BRAIN_EMPTY_RESPONSE');
  const chunks=[];let size=0;
  try {for(;;){
    const {value,done}=await reader.read();if(done)break;
    if(!(value instanceof Uint8Array))fail('BRAIN_INVALID_RESPONSE');
    size+=value.byteLength;
    if(size>4096)fail('BRAIN_RESPONSE_TOO_LARGE');
    chunks.push(value);
  }}finally{reader.releaseLock();}
  if(!size)fail('BRAIN_EMPTY_RESPONSE');
  const bytes=new Uint8Array(size);let pos=0;
  for(const part of chunks){bytes.set(part,pos);pos+=part.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{fail('BRAIN_INVALID_RESPONSE');}
}
/** Trusted env is mandatory. Both the caller and Brain rollout flags remain OFF. */
export function createNativeAppsScriptBrainPort({
  env,expectedBrainCommit,enabled=false,clock=()=>Date.now(),timeoutMs=3000
}={}){
  if(enabled!==true || env?.BRIDGE_BRAIN_RELAY_ENABLED!=='true')
    fail('APPS_SCRIPT_BRAIN_RELAY_DISABLED');
  if(!SHA40.test(expectedBrainCommit||''))fail('BRAIN_RELEASE_UNPINNED');
  if(typeof env?.BRAIN_PRIVATE?.fetch!=='function')fail('NATIVE_SERVICE_BINDING_REQUIRED');
  const requestKey=env.BRAIN_APPS_SCRIPT_INTAKE_KEY;
  const receiptKey=env.BRAIN_CAPABILITY_RECEIPT_KEY;
  if(typeof requestKey!=='string'||requestKey.length<43)fail('SOURCE_KEY_MISSING');
  if(typeof receiptKey!=='string'||receiptKey.length<43)fail('RECEIPT_KEY_MISSING');
  if(requestKey===receiptKey)fail('HMAC_TRUST_DOMAINS_COLLIDE');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)
    fail('PRIVATE_TIMEOUT_INVALID');
  const service=env.BRAIN_PRIVATE;
  async function call(method,path,payload){
    if(!((method==='GET'&&['/healthz','/v1/capabilities/apps-script'].includes(path))||
      (method==='POST'&&['/v1/intake/apps-script','/v1/apps-script/readback'].includes(path))))
      fail('BRAIN_PATH_DENIED');
    let raw='';
    if(method==='POST'){
      try{raw=JSON.stringify(payload);}catch{fail('BRAIN_INVALID_REQUEST');}
      if(typeof raw!=='string'||encode(raw).length>4096)fail('BRAIN_INVALID_REQUEST');
    }
    const ctrl=new AbortController();let timer;
    try {
      return await Promise.race([
        (async()=>{
          const headers={};
          if(path!=='/healthz'){
            const now=clock(),stamp=String(Math.floor(now/1000));
            if(!Number.isSafeInteger(now)||! /^\d{10}$/.test(stamp))fail('CLOCK_INVALID');
            headers['x-archelaos-key-id']=ID;
            headers['x-archelaos-timestamp']=stamp;
            headers['x-archelaos-signature']=await mac(requestKey,
              method+'\n'+path+'\n'+stamp+'\n'+raw);
          }
          if(method==='POST')headers['content-type']='application/json';
          const req=new Request(ROOT+path,{method,headers,signal:ctrl.signal,
            ...(method==='POST'?{body:raw}:{})});
          // No global fetch, public fallback, outbound Google request or retry.
          return limitedJson(await service.fetch(req));
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{
          ctrl.abort();reject(new PrivateBrainPortBlocked('BRAIN_RPC_OUTCOME_UNKNOWN'));
        },timeoutMs);})
      ]);
    } catch(error){
      if(ctrl.signal.aborted)fail('BRAIN_RPC_OUTCOME_UNKNOWN');
      throw error;
    }finally{clearTimeout(timer);}
  }
  async function assertRelease(){
    const health=await call('GET','/healthz');
    if(!exact(health,['service','environment','commit','aiExecutionEnabled'])||
      health.service!=='archelaos-brain'||health.environment!=='staging'||
      health.commit!==expectedBrainCommit||health.aiExecutionEnabled!==false)
      fail('BRAIN_RELEASE_MISMATCH');
  }
  async function verifyReadback(body,query){
    if(!exact(body,READBACK)||!UUID.test(body.receiptId||'')||
      body.receiptId!==(query.receiptId||body.receiptId)||
      body.eventId!==query.eventId||body.correlationId!==query.operationId||
      body.source!=='apps_script'||!HEX.test(body.sourceRevision||'')||
      !HEX.test(body.evidenceDigest||'')||
      !['apps_script.source.read','apps_script.backup.verified',
        'apps_script.rollback.verified'].includes(body.phase)||
      body.transport!=='PRIVATE_SERVICE_BINDING'||body.status!=='WAITING_REVIEW'||
      body.durable!==true||body.schemaVersion!==1||
      body.audience!==AUD||body.principal!==ID||body.keyId!==KEY_ID||
      !Number.isSafeInteger(body.issuedAtMs)||!Number.isSafeInteger(clock())||
      Math.abs(clock()-body.issuedAtMs)>300000||
      !HEX.test(body.receiptSignature||''))fail('BRAIN_SIGNED_READBACK_INVALID');
    const {receiptSignature,...unsigned}=body;
    const k=await crypto.subtle.importKey('raw',encode(receiptKey),
      {name:'HMAC',hash:'SHA-256'},false,['verify']);
    const sig=Uint8Array.from(receiptSignature.match(/../g),b=>parseInt(b,16));
    if(!await crypto.subtle.verify('HMAC',k,sig,
      encode(AUD+'\n'+JSON.stringify(unsigned))))
      fail('BRAIN_SIGNED_READBACK_INVALID');
    return Object.fromEntries(PROJECTION.map(p=>[p,body[p]]));
  }
  async function readBrainReceipt(query,expectedEvent=null){
    // Exact allowlist, not just 2/3 fields: arbitrary project IDs, source
    // selectors or prototype getters must never enter a trusted RPC query.
    const required=Object.hasOwn(query||{},'receiptId')?
      ['receiptId','eventId','operationId']:['eventId','operationId'];
    if(!exact(query,required)||!UUID.test(query.operationId||'')||
      !UUID.test(query.eventId||'')||
      (Object.hasOwn(query,'receiptId')&&!UUID.test(query.receiptId||'')))
      fail('BRAIN_READBACK_REQUEST_INVALID');
    await assertRelease();
    const payload=query.receiptId?
      {receiptId:query.receiptId,eventId:query.eventId,operationId:query.operationId}:
      {eventId:query.eventId,operationId:query.operationId};
    const signed=await call('POST','/v1/apps-script/readback',payload);
    const projected=await verifyReadback(signed,query);
    if(expectedEvent && (signed.phase!==expectedEvent.type||
      signed.evidenceDigest!==expectedEvent.metadata?.evidenceDigest||
      projected.sourceRevision!==expectedEvent.sourceRevision))
      fail('BRAIN_DURABLE_READBACK_MISMATCH');
    return projected;
  }
  return Object.freeze({
    async readBrainCapabilities(){
      await assertRelease();
      const cap=await call('GET','/v1/capabilities/apps-script');
      const digest=toHex(await crypto.subtle.digest('SHA-256',
        encode(expectedBrainCommit)));
      if(!exact(cap,['schemaVersion','source','transport','status','deploymentDigest'])||
        cap.schemaVersion!==1||cap.source!=='apps_script'||
        cap.transport!=='PRIVATE_SERVICE_BINDING'||cap.status!=='ACCEPTING'||
        cap.deploymentDigest!==digest)fail('BRAIN_CAPABILITY_MISMATCH');
      return cap;
    },
    readBrainReceipt:query=>readBrainReceipt(query),
    async submitToBrain(event){
      // Caller MUST have already durably claimed the verified provider event.
      // This method has no provider-reading/writing or authorization ports.
      await validateAppsScriptEvent(event,clock());
      await assertRelease();
      const ack=await call('POST','/v1/intake/apps-script',event);
      if(!exact(ack,['receiptId','correlationId','status','durable','duplicate'])||
        !UUID.test(ack.receiptId||'')||ack.correlationId!==event.correlationId||
        ack.status!=='WAITING_REVIEW'||ack.durable!==true||
        typeof ack.duplicate!=='boolean')fail('BRAIN_ACK_UNVERIFIED');
      // The Brain's Apps Script ACK is UNSIGNED. Accept only after independent
      // signed, matching persisted readback; UNKNOWN must never be resent.
      const proof=await readBrainReceipt({receiptId:ack.receiptId,
        eventId:event.eventId,operationId:event.correlationId},event);
      if(proof.receiptId!==ack.receiptId||proof.eventId!==event.eventId)
        fail('BRAIN_DURABLE_READBACK_MISMATCH');
      return ack;
    }
  });
}