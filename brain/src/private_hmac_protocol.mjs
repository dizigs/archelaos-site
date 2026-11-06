// Isolated synthetic key-possession proof only. Never recovery authentication.
const PEERS = Object.freeze({brain:'archelaos-brain-qa-isolated',healer:'archelaos-healer-qa-isolated'});
const REQUEST = ['schemaVersion','scope','sessionId','sourceSha','sender','audience','nonce','issuedAtMs','expiresAtMs'];
const RESPONSE = [...REQUEST,'challengeDigest','receivedAtMs','status'];
const REQUEST_SCOPE = 'archelaos.private-hmac.challenge.v1';
const RESPONSE_SCOPE = 'archelaos.private-hmac.response.v1';
const SHA = /^[a-f0-9]{40}$/;
const HEX = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const bytes = value => new TextEncoder().encode(value);
const hex = value => [...new Uint8Array(value)].map(b=>b.toString(16).padStart(2,'0')).join('');
const deny = () => { throw new Error('PRIVATE_HMAC_ACCEPTANCE_UNVERIFIED'); };
const body = (value,fields) => Object.fromEntries(fields.map(k=>[k,value[k]]));

// Copy exact own DATA fields without evaluating getters or accepting capabilities.
// Only native workerd RPC lifetime metadata may accompany signed scalar data.
function record(value,fields) {
  if (!value || Object.getPrototypeOf(value)!==Object.prototype) deny();
  const expected=[...fields,'signature'],names=Object.getOwnPropertyNames(value);
  if (names.length!==expected.length || !expected.every(k=>names.includes(k))) deny();
  const symbols=Object.getOwnPropertySymbols(value);
  if (symbols.length) {
    const d=Object.getOwnPropertyDescriptor(value,Symbol.dispose);
    if (symbols.length!==1 || symbols[0]!==Symbol.dispose || !d ||
        d.enumerable || typeof d.value!=='function' || d.get || d.set) deny();
  }
  return Object.fromEntries(expected.map(k=>{
    const d=Object.getOwnPropertyDescriptor(value,k);
    if (!d || !Object.hasOwn(d,'value') || (typeof d.value!=='string' && typeof d.value!=='number')) deny();
    return [k,d.value];
  }));
}
export function disposeAcceptanceRpc(value) {
  const d=value && Object.getOwnPropertyDescriptor(value,Symbol.dispose);
  if (d && !d.enumerable && typeof d.value==='function' && !d.get && !d.set) d.value.call(value);
}
async function key(secret) {
  if (typeof secret!=='string' || secret.length<43 || secret.length>512) deny();
  return crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function sign(value,fields,secret) {
  const data=body(value,fields);
  return {...data,signature:hex(await crypto.subtle.sign('HMAC',await key(secret),bytes(data.scope+'\n'+JSON.stringify(data))))};
}
async function verify(value,fields,secret) {
  if (!HEX.test(value.signature) || JSON.stringify(value).length>2048) deny();
  const signature=Uint8Array.from(value.signature.match(/../g),x=>Number.parseInt(x,16));
  if (!await crypto.subtle.verify('HMAC',await key(secret),signature,
      bytes(value.scope+'\n'+JSON.stringify(body(value,fields))))) deny();
}
export async function acceptanceDigest(value) {
  return hex(await crypto.subtle.digest('SHA-256',bytes(JSON.stringify(value))));
}
export function acceptanceConfig(env,role,now=Date.now()) {
  const start=Date.parse(env.PRIVATE_HMAC_ACCEPTANCE_STARTED_AT||'');
  const end=Date.parse(env.PRIVATE_HMAC_ACCEPTANCE_EXPIRES_AT||'');
  const revision=env.PRIVATE_HMAC_ACCEPTANCE_APPROVED_SHA;
  const flags=role==='brain' ? ['BRAIN_SELFHEAL_RECOVERY_ENABLED','BRAIN_SELFHEAL_BINDING_ATTESTED',
    'BRAIN_SELFHEAL_DISPATCH_ENABLED','BRAIN_SELFHEAL_DURABLE_ACK_ENABLED'] : ['HEALER_DURABLE_ACK_ENABLED'];
  if (!Object.hasOwn(PEERS,role) || env.PRIVATE_HMAC_ACCEPTANCE_ROLE!==role ||
      env.PRIVATE_HMAC_ACCEPTANCE_ISOLATED!=='true' ||
      !UUID.test(env.PRIVATE_HMAC_ACCEPTANCE_SESSION||'') || !SHA.test(revision||'') ||
      revision==='0'.repeat(40) || env.DEPLOY_SHA!==revision ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start>now || end<=now || end<=start || end-start>300000 ||
      flags.some(k=>env[k]!=='false') ||
      (role==='brain' && env.STAGING_EXPIRES_AT!=='1970-01-01T00:00:00Z')) deny();
  return Object.freeze({role,sessionId:env.PRIVATE_HMAC_ACCEPTANCE_SESSION,sourceSha:revision,start,end});
}
function validateRequest(value,config,now) {
  if (value.schemaVersion!==1 || value.scope!==REQUEST_SCOPE ||
      value.sessionId!==config.sessionId || value.sourceSha!==config.sourceSha ||
      value.sender!==PEERS.brain || value.audience!==PEERS.healer || !HEX.test(value.nonce) ||
      !Number.isSafeInteger(value.issuedAtMs) || !Number.isSafeInteger(value.expiresAtMs) ||
      value.issuedAtMs<config.start || value.issuedAtMs>now+1000 ||
      value.expiresAtMs<=now || value.expiresAtMs>config.end ||
      value.expiresAtMs<=value.issuedAtMs || value.expiresAtMs-value.issuedAtMs>10000) deny();
}
export async function createAcceptanceChallenge(config,secret,now=Date.now()) {
  if (config.role!=='brain') deny();
  const nonce=hex(crypto.getRandomValues(new Uint8Array(32)));
  const value={schemaVersion:1,scope:REQUEST_SCOPE,sessionId:config.sessionId,sourceSha:config.sourceSha,
    sender:PEERS.brain,audience:PEERS.healer,nonce,issuedAtMs:now,expiresAtMs:Math.min(now+10000,config.end)};
  validateRequest(value,config,now);
  return sign(value,REQUEST,secret);
}
export async function verifyAcceptanceChallenge(raw,config,secret,now=Date.now()) {
  const value=record(raw,REQUEST);
  validateRequest(value,config,now);
  await verify(value,REQUEST,secret);
  return value;
}
export async function answerAcceptanceChallenge(request,config,secret,now=Date.now()) {
  if (config.role!=='healer') deny();
  // Revalidate after durable nonce claim; expiry can elapse while storage awaits.
  await verifyAcceptanceChallenge(request,config,secret,now);
  return sign({...body(request,REQUEST),scope:RESPONSE_SCOPE,sender:PEERS.healer,audience:PEERS.brain,
    challengeDigest:await acceptanceDigest(request),receivedAtMs:now,status:'KEY_POSSESSION_CONFIRMED'},RESPONSE,secret);
}
export async function verifyAcceptanceResponse(raw,request,config,secret,now=Date.now()) {
  if (config.role!=='brain') deny();
  await verifyAcceptanceChallenge(request,config,secret,now);
  const value=record(raw,RESPONSE);
  await verify(value,RESPONSE,secret);
  for (const field of ['schemaVersion','sessionId','sourceSha','nonce','issuedAtMs','expiresAtMs'])
    if (value[field]!==request[field]) deny();
  if (value.scope!==RESPONSE_SCOPE || value.sender!==PEERS.healer || value.audience!==PEERS.brain ||
      value.status!=='KEY_POSSESSION_CONFIRMED' || value.challengeDigest!==await acceptanceDigest(request) ||
      !Number.isSafeInteger(value.receivedAtMs) || value.receivedAtMs<request.issuedAtMs-1000 ||
      value.receivedAtMs>now+1000 || value.receivedAtMs>=request.expiresAtMs) deny();
  return value;
}
