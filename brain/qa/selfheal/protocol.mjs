// INERT QA SUPPORT ONLY. Never imported by either operational Worker.
const PREVIEWS=Object.freeze({brain:'204965a6ba624184bfdfccb94794aff8',
  healer:'ac43359770de4a058fd77bd4d5257226'});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const SHA=/^[a-f0-9]{40}$/;
export const FLAGS=Object.freeze(['BRAIN_SELFHEAL_RECOVERY_ENABLED','BRAIN_SELFHEAL_DISPATCH_ENABLED',
  'BRAIN_SELFHEAL_BINDING_ATTESTED','BRAIN_SELFHEAL_DURABLE_ACK_ENABLED','HEALER_DURABLE_ACK_ENABLED']);
export const FIELDS=Object.freeze({
  start:['v','scope','runId','sourceSha','issuedAtMs','nonce'],
  challenge:['v','scope','runId','sourceSha','issuedAtMs','nonce'],
  ack:['v','scope','runId','sourceSha','challengeDigest','deliveryNonce','storedAtMs','status'],
  read:['v','scope','runId','sourceSha','challengeDigest','deliveryNonce','issuedAtMs','nonce'],
  reply:['v','scope','runId','sourceSha','challengeDigest','deliveryNonce','issuedAtMs','nonce','status','ack'],
});
const enc=new TextEncoder();
export function refuse(){throw Error('ISOLATED_SELFHEAL_QA_REJECTED');}
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const nonce=()=>hex(crypto.getRandomValues(new Uint8Array(16)));
export function guard(env,now=Date.now()){
  const exp=Date.parse(env?.QA_EXPIRES_AT||'');
  const peer=env?.QA_ROLE==='brain'?'healer':'brain';
  if(env?.QA_ENABLED!=='true'||!Object.hasOwn(PREVIEWS,env?.QA_ROLE||'')||
    env.QA_PREVIEW_ID!==PREVIEWS[env.QA_ROLE]||env.QA_PEER_PREVIEW_ID!==PREVIEWS[peer]||
    !UUID.test(env.QA_RUN_ID||'')||!SHA.test(env.QA_SOURCE_SHA||'')||env.QA_SOURCE_SHA==='0'.repeat(40)||
    !Number.isSafeInteger(now)||!Number.isFinite(exp)||exp<=now||exp>now+30*60000||
    FLAGS.some(f=>env[f]!=='false')||
    ['BRAIN','HEALER_MEMORY','HEALER','BRAIN_RECOVERY','AI','BRAIN_GITHUB_READ_TOKEN',
      'BRAIN_GITHUB_APP_PRIVATE_KEY','BRAIN_OPERATOR_KEY'].some(f=>Object.hasOwn(env,f))||
    typeof env.HEALER_EVENT_HMAC_KEY!=='string'||env.HEALER_EVENT_HMAC_KEY.length<43||
    env.HEALER_EVENT_HMAC_KEY.length>512||typeof env.QA_RUNNER_KEY!=='string'||
    env.QA_RUNNER_KEY.length<43||env.QA_RUNNER_KEY.length>512||
    env.QA_RUNNER_KEY===env.HEALER_EVENT_HMAC_KEY)refuse();
}
// Only exact data records cross RPC. Ignore solely workerd's non-enumerable
// function-valued Symbol.dispose lifetime hook, never accessors or other symbols.
export function record(value,fields){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)refuse();
  const descriptors=Object.getOwnPropertyDescriptors(value);
  const names=Reflect.ownKeys(descriptors);
  const wanted=[...fields,'signature'];
  for(const name of names){
    const d=descriptors[name];
    if(typeof name==='symbol'){
      if(name!==Symbol.dispose||d.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='function')refuse();
    }else if(!wanted.includes(name)||!d.enumerable||!Object.hasOwn(d,'value'))refuse();
  }
  if(wanted.some(k=>!Object.hasOwn(descriptors,k)))refuse();
  return Object.fromEntries(wanted.map(k=>[k,descriptors[k].value]));
}
async function key(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const unsigned=(value,fields)=>Object.fromEntries(fields.map(k=>[k,value[k]]));
const message=(value,fields)=>enc.encode('archelaos.isolated.qa.v1\n'+JSON.stringify(unsigned(value,fields)));
export async function sign(value,fields,secret){
  return {...unsigned(value,fields),signature:hex(await crypto.subtle.sign('HMAC',await key(secret),message(value,fields)))};
}
export async function verify(value,kind,scope,env,secret,now=Date.now()){
  guard(env,now);
  const fields=FIELDS[kind];if(!fields)refuse();
  const r=record(value,fields);
  if(r.v!==1||r.scope!==scope||r.runId!==env.QA_RUN_ID||r.sourceSha!==env.QA_SOURCE_SHA||
    typeof r.signature!=='string'||!HEX.test(r.signature)||JSON.stringify(r).length>2200)refuse();
  const time=kind==='ack'?r.storedAtMs:r.issuedAtMs;
  if(!Number.isSafeInteger(time)||Math.abs(now-time)>60000)refuse();
  if((kind!=='ack'&&!/^[a-f0-9]{32}$/.test(r.nonce||''))||
    (['ack','read','reply'].includes(kind)&&(!HEX.test(r.challengeDigest||'')||!/^[a-f0-9]{32}$/.test(r.deliveryNonce||''))))refuse();
  const sig=Uint8Array.from(r.signature.match(/../g),b=>Number.parseInt(b,16));
  if(!await crypto.subtle.verify('HMAC',await key(secret),sig,message(r,fields)))refuse();
  return r;
}
export async function digest(value){return hex(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(value))));}
