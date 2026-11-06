/**
 * Future Cloudflare *caller-side* port for existing analytics-brain-ingest.
 *
 * Not a Worker entrypoint, not a public HTTP proxy, not a Node/GitHub
 * Actions transport, and NOT installed in Cloudflare. The only network
 * operation allowed by this object is env.BRAIN_PRIVATE.fetch().
 * Construct it inside an independently reviewed, already-authorized Worker,
 * never from caller JSON. No discovery, scheduled job or AI inference.
 */
import {
  verifyBrainAnalyticsAck,
  verifyBrainAnalyticsReadback
} from './brain-signed-receipts.mjs';

const INTERNAL='https://brain.internal';
const COMMIT=/^[a-f0-9]{40}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const KEY_ID='analytics-v1';
const MAX_REQUEST_BYTES=4096;
const MAX_RESPONSE_BYTES=8192;
const BRAIN_PATHS=Object.freeze({
  health:'/healthz',
  capabilities:'/v1/capabilities/analytics',
  intake:'/v1/intake/analytics',
  readback:'/v1/analytics/readback'
});
const encode=x=>new TextEncoder().encode(x);
const refuse=code=>{throw new Error(code);};

function checkRuntime(env,expectedBrainCommit,timeoutMs) {
  if (!env || env.ANALYTICS_ENABLED!=='true')
    refuse('ANALYTICS_PRIVATE_DELIVERY_DISABLED');
  if (typeof env.BRAIN_PRIVATE?.fetch!=='function')
    refuse('NATIVE_PRIVATE_BRAIN_BINDING_REQUIRED');
  if (!COMMIT.test(expectedBrainCommit||''))
    refuse('BRAIN_EXACT_COMMIT_NOT_PINNED');
  if (typeof env.BRAIN_ANALYTICS_INTAKE_KEY!=='string' ||
      env.BRAIN_ANALYTICS_INTAKE_KEY.length<43)
    refuse('ANALYTICS_INTAKE_KEY_MISSING');
  if (typeof env.BRAIN_CAPABILITY_RECEIPT_KEY!=='string' ||
      env.BRAIN_CAPABILITY_RECEIPT_KEY.length<43)
    refuse('BRAIN_RECEIPT_VERIFIER_MISSING');
  if (env.BRAIN_ANALYTICS_INTAKE_KEY===env.BRAIN_CAPABILITY_RECEIPT_KEY)
    refuse('HMAC_TRUST_DOMAINS_COLLIDE');
  if (!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)
    refuse('INVALID_PRIVATE_RPC_TIMEOUT');
}

async function parseBoundedJson(response) {
  if (!response || typeof response.ok!=='boolean')
    refuse('BRAIN_RPC_INVALID_RESPONSE');
  if (!response.ok)
    refuse('BRAIN_RPC_REJECTED_'+response.status);
  const body=response.body?.getReader?.();
  if (!body) refuse('BRAIN_RPC_EMPTY_RESPONSE');
  const chunks=[];
  let size=0;
  try {
    for (;;) {
      const {done,value}=await body.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) refuse('BRAIN_RPC_INVALID_BODY_CHUNK');
      size+=value.byteLength;
      if (size>MAX_RESPONSE_BYTES) refuse('BRAIN_RPC_RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally {
    body.releaseLock();
  }
  if (!size) refuse('BRAIN_RPC_EMPTY_RESPONSE');
  const data=new Uint8Array(size);
  let offset=0;
  for (const value of chunks) {data.set(value,offset);offset+=value.byteLength;}
  try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
  catch {refuse('BRAIN_RPC_INVALID_JSON');}
}

async function signRequest(method,path,raw,key,now) {
  if (!Number.isSafeInteger(now)) refuse('INVALID_PRIVATE_RPC_CLOCK');
  const seconds=String(Math.floor(now/1000));
  if (!/^\d{10}$/.test(seconds)) refuse('INVALID_PRIVATE_RPC_CLOCK');
  const signingKey=await crypto.subtle.importKey('raw',encode(key),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',signingKey,
    encode(method+'\n'+path+'\n'+seconds+'\n'+raw));
  const hex=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
  return {
    'x-archelaos-key-id':KEY_ID,
    'x-archelaos-timestamp':seconds,
    'x-archelaos-signature':hex,
    ...(method==='POST'?{'content-type':'application/json'}:{})
  };
}

/** Construct only from trusted Cloudflare Worker env and reviewed configuration. */
export function createNativeAnalyticsBrainPort({
  env,expectedBrainCommit,clock=()=>Date.now(),timeoutMs=3000
}={}) {
  checkRuntime(env,expectedBrainCommit,timeoutMs);
  const service=env.BRAIN_PRIVATE;
  const key=env.BRAIN_ANALYTICS_INTAKE_KEY;
  const verifier=env.BRAIN_CAPABILITY_RECEIPT_KEY;

  async function privateCall(method,path,payload,externalSignal) {
    if (!Object.values(BRAIN_PATHS).includes(path))
      refuse('BRAIN_PATH_NOT_ALLOWLISTED');
    let raw='';
    if (method==='POST') {
      try {raw=JSON.stringify(payload);}
      catch {refuse('BRAIN_RPC_INVALID_PAYLOAD');}
      if (typeof raw!=='string'||encode(raw).length>MAX_REQUEST_BYTES)
        refuse('BRAIN_RPC_INVALID_PAYLOAD');
    } else if (method!=='GET') refuse('BRAIN_METHOD_NOT_ALLOWED');
    if (path===BRAIN_PATHS.health && method!=='GET') refuse('BRAIN_METHOD_NOT_ALLOWED');
    if (path!==BRAIN_PATHS.health &&
      ((path===BRAIN_PATHS.capabilities)!==(method==='GET')))
      refuse('BRAIN_METHOD_NOT_ALLOWED');
    const ctrl=new AbortController();
    const abort=()=>ctrl.abort();
    if (externalSignal?.aborted) refuse('BRAIN_RPC_EXTERNAL_ABORT');
    externalSignal?.addEventListener?.('abort',abort,{once:true});
    let deadline;
    try {
      const operation=async()=>{
        const headers=path===BRAIN_PATHS.health ? {} :
          await signRequest(method,path,raw,key,clock());
        const request=new Request(INTERNAL+path,{
          method,headers,signal:ctrl.signal,
          ...(method==='POST'?{body:raw}:{})
        });
        // Only the *injected native Cloudflare Service Binding* is callable.
        // Never use global fetch, workers.dev, or a user-provided URL.
        return parseBoundedJson(await service.fetch(request));
      };
      return await Promise.race([
        operation(),
        new Promise((_,reject)=>{
          deadline=setTimeout(()=>{
            ctrl.abort();
            reject(new Error('BRAIN_RPC_OUTCOME_UNKNOWN'));
          },timeoutMs);
        })
      ]);
    } catch (error) {
      if (error?.message==='BRAIN_RPC_OUTCOME_UNKNOWN') throw error;
      if (ctrl.signal.aborted || externalSignal?.aborted)
        refuse('BRAIN_RPC_OUTCOME_UNKNOWN');
      throw error;
    } finally {
      clearTimeout(deadline);
      externalSignal?.removeEventListener?.('abort',abort);
    }
  }

  async function assertBrainRelease() {
    let health;
    try {health=await privateCall('GET',BRAIN_PATHS.health);}
    catch {refuse('PRIVATE_BRAIN_HEALTH_UNVERIFIED');}
    if (health?.service!=='archelaos-brain' ||
        health.environment!=='staging' ||
        health.commit!==expectedBrainCommit ||
        health.aiExecutionEnabled!==false)
      refuse('PRIVATE_BRAIN_RELEASE_MISMATCH');
  }

  return Object.freeze({
    async capabilities() {
      await assertBrainRelease();
      const result=await privateCall('GET',BRAIN_PATHS.capabilities);
      // This is an authenticated HMAC request *over a native binding*,
      // not independent remote proof of installed Cloudflare metadata.
      if (result?.version!=='analytics.aggregate.v1'||
          result.authenticatedServiceBinding!==true||
          result.durableSnapshotUpsert!==true||
          result.receiptSignatureVerification!==true||
          result.immutableReceiptReadback!==true)
        refuse('BRAIN_ANALYTICS_CAPABILITY_MISMATCH');
      return result;
    },
    async submitSnapshot(request) {
      if (request?.schemaVersion!==1 ||
          request?.operation!=='UPSERT_NOT_INCREMENT' ||
          typeof request.snapshotKey!=='string' ||
          !DIGEST.test(request.metricRevision||'') ||
          request.event?.source!=='analytics')
        refuse('BRAIN_ANALYTICS_REQUEST_INVALID');
      await assertBrainRelease();
      // Transport errors or unrecognized ACKs are NOT safe to retry.
      return privateCall('POST',BRAIN_PATHS.intake,request);
    },
    verifyReceipt:(ack,request)=>verifyBrainAnalyticsAck(ack,request,{
      verificationKey:verifier,now:clock()
    }),
    async readbackSnapshot(query,{signal}={}) {
      if (!UUID.test(query?.receiptId||'') ||
          !DIGEST.test(query?.eventId||'') ||
          !/^(ga4|search_console|clarity)\|\d{4}-\d\d-\d\d\|\d{4}-\d\d-\d\d$/.test(query?.snapshotKey||''))
        refuse('BRAIN_ANALYTICS_READBACK_QUERY_INVALID');
      await assertBrainRelease();
      return privateCall('POST',BRAIN_PATHS.readback,query,signal);
    },
    verifyReadback:(body,request,ack)=>verifyBrainAnalyticsReadback(body,request,ack,{
      verificationKey:verifier,now:clock()
    }),
    readbackTimeoutMs:timeoutMs
  });
}
