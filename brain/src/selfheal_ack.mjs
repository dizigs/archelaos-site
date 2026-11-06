// Canonical receipt settlement ONLY. No repair, deployment, AI or redelivery.
import { Rejected, digest } from './contract.mjs';
import { validateCiFinding } from './selfheal_recovery.mjs';

const ACK=['schemaVersion','issuer','scope','commandId','commandDigest','deliveryNonce','storedAtMs','status'];
const READ=['schemaVersion','issuer','scope','commandId','commandDigest','deliveryNonce','issuedAtMs','nonce'];
const REPLY=['schemaVersion','issuer','scope','commandId','commandDigest','deliveryNonce','nonce','issuedAtMs','status','ack'];
const COMMAND=['schemaVersion','issuer','scope','issuedAtMs','nonce','payload'];
const HEX=/^[a-f0-9]{64}$/;
const NONCE=/^[a-f0-9]{32}$/;
const deny=()=>{throw new Rejected('HEALER_ACK_UNVERIFIED',423);};
const rows=(sql,q,...args)=>[...sql.exec(q,...args)];
const bytes=s=>new TextEncoder().encode(s);
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const body=(o,keys)=>Object.fromEntries(keys.map(k=>[k,o[k]]));
const exact=(o,keys)=>o && Object.getPrototypeOf(o)===Object.prototype &&
  Reflect.ownKeys(o).length===keys.length+1 && [...keys,'signature'].every(k=>Object.hasOwn(o,k));
// workerd decorates returned RPC records with a non-enumerable Symbol.dispose.
// It is transport lifetime metadata, never authenticated protocol data. Keep the
// exact signed-field whitelist; reject every other symbol/key and all accessors.
function rpcRecord(value, fields) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) deny();
  const names = Object.getOwnPropertyNames(value);
  const expected = [...fields, 'signature'];
  if (names.length !== expected.length || !expected.every(k => names.includes(k))) deny();
  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length) {
    const descriptor = Object.getOwnPropertyDescriptor(value, Symbol.dispose);
    if (symbols.length !== 1 || symbols[0] !== Symbol.dispose || !descriptor ||
        descriptor.enumerable || typeof descriptor.value !== 'function' ||
        descriptor.get !== undefined || descriptor.set !== undefined) deny();
  }
  return Object.fromEntries(expected.map(name => {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') ||
        descriptor.get !== undefined || descriptor.set !== undefined) deny();
    return [name, descriptor.value];
  }));
}
export function normalizeAckRpcRecord(value, readback = false) {
  const result = rpcRecord(value, readback ? REPLY : ACK);
  if (readback && result.ack !== null) result.ack = rpcRecord(result.ack, ACK);
  return result;
}
function disposeRpcResult(value) {
  const descriptor = value && Object.getOwnPropertyDescriptor(value, Symbol.dispose);
  if (descriptor && !descriptor.enumerable && typeof descriptor.value === 'function' &&
      descriptor.get === undefined && descriptor.set === undefined) descriptor.value.call(value);
}

async function key(secret){
  if(typeof secret!=='string'||secret.length<43||secret.length>512)deny();
  return crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function sign(o,keys,secret){
  const record=body(o,keys);
  const signature=hex(await crypto.subtle.sign('HMAC',await key(secret),bytes(record.scope+'\n'+JSON.stringify(record))));
  return {...record,signature};
}
async function verify(o,keys,secret){
  if(!exact(o,keys)||typeof o.signature!=='string'||!HEX.test(o.signature)||JSON.stringify(o).length>4096)deny();
  const signature=Uint8Array.from(o.signature.match(/../g),x=>Number.parseInt(x,16));
  if(!await crypto.subtle.verify('HMAC',await key(secret),signature,bytes(o.scope+'\n'+JSON.stringify(body(o,keys)))))deny();
}
async function bounded(call){
  let timer;
  try{return await Promise.race([Promise.resolve().then(call),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('ACK_RPC_TIMEOUT')),4000);
  })]);}finally{clearTimeout(timer);}
}
export function requireAckControls(storage){
  const c=Object.fromEntries(rows(storage.sql,'SELECT name,value FROM controls WHERE name IN (?,?,?)','global','ai','source:github').map(r=>[r.name,r.value]));
  if(c.global!==0||c.ai!==1||c['source:github']!==1)deny();
}
export function migrateSignedOutbox(storage){
  const columns=rows(storage.sql,"SELECT name FROM pragma_table_info('selfheal_signed_outbox') ORDER BY cid").map(r=>r.name);
  const legacy=['receipt_id','nonce','claimed_at','status'];
  const current=[...legacy,'command_json','command_digest','ack_json','settled_at'];
  if(JSON.stringify(columns)===JSON.stringify(current))return;
  if(JSON.stringify(columns)!==JSON.stringify(legacy))deny();
  storage.transactionSync(()=>{
    storage.sql.exec("CREATE TABLE selfheal_signed_outbox_upgrade(receipt_id TEXT PRIMARY KEY,nonce TEXT NOT NULL UNIQUE,claimed_at INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('UNKNOWN','ACKNOWLEDGED')),command_json TEXT,command_digest TEXT,ack_json TEXT,settled_at INTEGER)");
    storage.sql.exec('INSERT INTO selfheal_signed_outbox_upgrade(receipt_id,nonce,claimed_at,status) SELECT receipt_id,nonce,claimed_at,status FROM selfheal_signed_outbox');
    storage.sql.exec('DROP TABLE selfheal_signed_outbox');
    storage.sql.exec('ALTER TABLE selfheal_signed_outbox_upgrade RENAME TO selfheal_signed_outbox');
  });
}
export async function prepareDurableCommand(storage,receiptId,finding,secret,now,nonce){
  const payload=JSON.stringify({commandId:receiptId,finding});
  const commandDigest=await digest(payload);
  storage.transactionSync(()=>{
    const row=rows(storage.sql,'SELECT * FROM selfheal_signed_outbox WHERE receipt_id=?',receiptId)[0];
    if(!row||row.status!=='UNKNOWN'||row.nonce!==nonce||row.claimed_at!==now||row.command_json!==null)deny();
    storage.sql.exec('UPDATE selfheal_signed_outbox SET command_json=?,command_digest=? WHERE receipt_id=?',payload,commandDigest,receiptId);
  });
  return sign({schemaVersion:2,issuer:'canonical-brain',scope:'selfheal.command.v1',issuedAtMs:now,nonce,payload},COMMAND,secret);
}
async function expectedCommand(storage,receiptId){
  const row=rows(storage.sql,'SELECT * FROM selfheal_signed_outbox WHERE receipt_id=?',receiptId)[0];
  if(!row||!['UNKNOWN','ACKNOWLEDGED'].includes(row.status)||!Number.isSafeInteger(row.claimed_at)||
      !NONCE.test(row.nonce||'')||typeof row.command_json!=='string'||bytes(row.command_json).length>1800||
      !HEX.test(row.command_digest||''))deny();
  const command=JSON.parse(row.command_json);
  if(!command||Object.keys(command).length!==2||command.commandId!==receiptId||
      await digest(row.command_json)!==row.command_digest)deny();
  validateCiFinding(command.finding,row.claimed_at);
  return row;
}
async function verifyAck(ack,row,secret,now){
  await verify(ack,ACK,secret);
  if(ack.schemaVersion!==1||ack.issuer!=='archelaos-self-heal'||ack.scope!=='selfheal.ack.v1'||
      ack.commandId!==row.receipt_id||ack.commandDigest!==row.command_digest||ack.deliveryNonce!==row.nonce||
      ack.status!=='RECEIVED_NOT_EXECUTED'||!Number.isSafeInteger(ack.storedAtMs)||
      Math.abs(ack.storedAtMs-row.claimed_at)>300000||ack.storedAtMs>now+300000)deny();
}
export async function sendDurableCommand(env,envelope){
  const raw=await bounded(()=>env.HEALER.attemptRecovery(envelope));
  try { return normalizeAckRpcRecord(raw); } finally { disposeRpcResult(raw); }
}
export async function settleDurableReadback(storage,env,receiptId,immediateAck,now=Date.now()){
  const active=()=>env.BRAIN_SELFHEAL_DURABLE_ACK_ENABLED==='true'&&
    Date.parse(env.STAGING_EXPIRES_AT||'')>Date.now();
  if(!active()||typeof env.HEALER?.recoveryStatus!=='function')deny();
  requireAckControls(storage);
  const row=await expectedCommand(storage,receiptId);
  if(immediateAck!==undefined)await verifyAck(immediateAck,row,env.HEALER_EVENT_HMAC_KEY,now);
  const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
  const request=await sign({schemaVersion:1,issuer:'canonical-brain',scope:'selfheal.ack.read.v1',
    commandId:receiptId,commandDigest:row.command_digest,deliveryNonce:row.nonce,issuedAtMs:now,nonce},READ,env.HEALER_EVENT_HMAC_KEY);
  const raw=await bounded(()=>env.HEALER.recoveryStatus(request));
  let response;
  try { response=normalizeAckRpcRecord(raw,true); } finally { disposeRpcResult(raw); }
  await verify(response,REPLY,env.HEALER_EVENT_HMAC_KEY);
  if(response.schemaVersion!==1||response.issuer!=='archelaos-self-heal'||response.scope!=='selfheal.ack.readback.v1'||
      response.commandId!==receiptId||response.commandDigest!==row.command_digest||response.deliveryNonce!==row.nonce||
      response.nonce!==nonce||!Number.isSafeInteger(response.issuedAtMs)||Math.abs(response.issuedAtMs-now)>300000||
      response.status!=='FOUND')deny();
  await verifyAck(response.ack,row,env.HEALER_EVENT_HMAC_KEY,now);
  const ackJson=JSON.stringify(body(response.ack,[...ACK,'signature']));
  if(immediateAck!==undefined&&JSON.stringify(body(immediateAck,[...ACK,'signature']))!==ackJson)deny();
  return storage.transactionSync(()=>{
    if(!active())deny();
    requireAckControls(storage);
    const current=rows(storage.sql,'SELECT * FROM selfheal_signed_outbox WHERE receipt_id=?',receiptId)[0];
    if(!current||current.nonce!==row.nonce||current.command_digest!==row.command_digest||current.command_json!==row.command_json)deny();
    if(current.status==='ACKNOWLEDGED'){
      if(current.ack_json!==ackJson)deny();
    }else{
      if(current.status!=='UNKNOWN')deny();
      const settledAt=Date.now();
      storage.sql.exec("UPDATE selfheal_signed_outbox SET status='ACKNOWLEDGED',ack_json=?,settled_at=? WHERE receipt_id=?",ackJson,settledAt,receiptId);
      storage.sql.exec('INSERT INTO selfheal_audit(receipt_id,at,code) VALUES(?,?,?)',receiptId,settledAt,'HEALER_RECEIPT_INDEPENDENTLY_ATTESTED');
    }
    const saved=rows(storage.sql,'SELECT status,ack_json FROM selfheal_signed_outbox WHERE receipt_id=?',receiptId)[0];
    if(saved?.status!=='ACKNOWLEDGED'||saved.ack_json!==ackJson)deny();
    return {status:'ACKNOWLEDGED',receiptId,acknowledgedOnly:true,recoveryExecuted:false,
      safeToRetry:false,needsIndependentReadback:false,aiCalls:0};
  });
}
