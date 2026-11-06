// Receipt-only protocol in the EXISTING Healer SQLite. Never runs a recovery.
import { parseFinding } from './policy.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const NONCE = /^[a-f0-9]{32}$/;
const COMMAND = ['schemaVersion','issuer','scope','issuedAtMs','nonce','payload'];
const ACK = ['schemaVersion','issuer','scope','commandId','commandDigest','deliveryNonce','storedAtMs','status'];
const READ = ['schemaVersion','issuer','scope','commandId','commandDigest','deliveryNonce','issuedAtMs','nonce'];
const REPLY = ['schemaVersion','issuer','scope','commandId','commandDigest','deliveryNonce','nonce','issuedAtMs','status','ack'];
const deny = () => { throw new Error('DURABLE_ACK_REJECTED'); };
const rows = (sql, query, ...args) => [...sql.exec(query, ...args)];
const plain = o => o && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype;
const exact = (o, fields) => plain(o) && Reflect.ownKeys(o).length === fields.length + 1 &&
  [...fields,'signature'].every(k => Object.hasOwn(o,k));
const bytes = text => new TextEncoder().encode(text);
const hex = data => [...new Uint8Array(data)].map(b => b.toString(16).padStart(2,'0')).join('');
const body = (o, fields) => Object.fromEntries(fields.map(k => [k,o[k]]));
const fresh = (at,now) => Number.isSafeInteger(at) && Number.isSafeInteger(now) && Math.abs(now-at) <= 300_000;
async function key(secret) {
  if (typeof secret !== 'string' || secret.length < 43 || secret.length > 512) deny();
  return crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function sign(value, fields, secret) {
  const record = body(value,fields);
  const signature = hex(await crypto.subtle.sign('HMAC',await key(secret),bytes(record.scope+'\n'+JSON.stringify(record))));
  return {...record,signature};
}
async function verify(value, fields, secret) {
  if (!exact(value,fields) || typeof value.signature !== 'string' ||
      !HEX.test(value.signature) || JSON.stringify(value).length > 4096) deny();
  const signature = Uint8Array.from(value.signature.match(/../g),v=>Number.parseInt(v,16));
  if (!await crypto.subtle.verify('HMAC',await key(secret),signature,
    bytes(value.scope+'\n'+JSON.stringify(body(value,fields))))) deny();
}
function enabled(env) { if (env?.HEALER_DURABLE_ACK_ENABLED !== 'true') deny(); }
function claimNonce(sql, scope, nonce, at, now) {
  sql.exec('DELETE FROM recovery_event_nonces WHERE expires<=?',now);
  const id = scope+':'+nonce;
  if (rows(sql,'SELECT id FROM recovery_event_nonces WHERE id=?',id).length ||
      rows(sql,'SELECT COUNT(*) AS n FROM recovery_event_nonces')[0].n >= 25000) deny();
  sql.exec('INSERT INTO recovery_event_nonces(id,expires) VALUES(?,?)',id,Math.max(at,now)+300001);
}

export function initializeDurableAck(storage) {
  storage.sql.exec('CREATE TABLE IF NOT EXISTS recovery_command_receipts(command_id TEXT PRIMARY KEY,command_digest TEXT NOT NULL,delivery_nonce TEXT NOT NULL UNIQUE,issued_at INTEGER NOT NULL,command_json TEXT NOT NULL,ack_json TEXT NOT NULL)');
}

export async function acceptDurableCommand(storage, env, envelope, now = Date.now()) {
  enabled(env);
  if (envelope?.schemaVersion !== 2 || envelope.issuer !== 'canonical-brain' ||
      envelope.scope !== 'selfheal.command.v1' || !fresh(envelope.issuedAtMs,now) ||
      !NONCE.test(envelope.nonce || '') || typeof envelope.payload !== 'string' ||
      bytes(envelope.payload).length > 1800) deny();
  await verify(envelope,COMMAND,env.HEALER_EVENT_HMAC_KEY);
  let command;
  try { command=JSON.parse(envelope.payload); } catch { deny(); }
  if (!plain(command) || Reflect.ownKeys(command).length !== 2 ||
      !Object.hasOwn(command,'finding') || !UUID.test(command.commandId || '')) deny();
  const f=parseFinding(command.finding,now);
  if (f.source !== 'github_actions' || f.code !== 'CI_FAILURE' || f.resource !== '/ci') deny();
  const commandDigest=hex(await crypto.subtle.digest('SHA-256',bytes(envelope.payload)));
  const candidate=await sign({schemaVersion:1,issuer:'archelaos-self-heal',scope:'selfheal.ack.v1',
    commandId:command.commandId,commandDigest,deliveryNonce:envelope.nonce,
    storedAtMs:now,status:'RECEIVED_NOT_EXECUTED'},ACK,env.HEALER_EVENT_HMAC_KEY);
  return storage.transactionSync(()=>{
    const sql=storage.sql;
    const existing=rows(sql,'SELECT * FROM recovery_command_receipts WHERE command_id=?',command.commandId)[0];
    if (existing) {
      if (existing.command_digest !== commandDigest || existing.delivery_nonce !== envelope.nonce ||
          existing.issued_at !== envelope.issuedAtMs || existing.command_json !== envelope.payload) deny();
      // Exact authenticated duplicate: return the SAME durably stored ACK.
      return JSON.parse(existing.ack_json);
    }
    if (rows(sql,'SELECT COUNT(*) AS n FROM recovery_command_receipts')[0].n >= 250) deny();
    claimNonce(sql,'canonical-brain:selfheal.command.v1',envelope.nonce,envelope.issuedAtMs,now);
    sql.exec('INSERT INTO recovery_command_receipts(command_id,command_digest,delivery_nonce,issued_at,command_json,ack_json) VALUES(?,?,?,?,?,?)',
      command.commandId,commandDigest,envelope.nonce,envelope.issuedAtMs,envelope.payload,JSON.stringify(candidate));
    const saved=rows(sql,'SELECT ack_json FROM recovery_command_receipts WHERE command_id=?',command.commandId)[0];
    if (saved?.ack_json !== JSON.stringify(candidate)) deny();
    return JSON.parse(saved.ack_json);
  });
}

export async function readDurableCommand(storage, env, request, now = Date.now()) {
  enabled(env);
  if (request?.schemaVersion !== 1 || request.issuer !== 'canonical-brain' ||
      request.scope !== 'selfheal.ack.read.v1' || !UUID.test(request.commandId || '') ||
      !HEX.test(request.commandDigest || '') || !NONCE.test(request.deliveryNonce || '') ||
      !NONCE.test(request.nonce || '') || !fresh(request.issuedAtMs,now)) deny();
  await verify(request,READ,env.HEALER_EVENT_HMAC_KEY);
  const saved=storage.transactionSync(()=>{
    const sql=storage.sql;
    const record=rows(sql,'SELECT * FROM recovery_command_receipts WHERE command_id=?',request.commandId)[0];
    if (record && (record.command_digest !== request.commandDigest || record.delivery_nonce !== request.deliveryNonce)) deny();
    claimNonce(sql,'canonical-brain:selfheal.ack.read.v1',request.nonce,request.issuedAtMs,now);
    return record;
  });
  const ack=saved ? JSON.parse(saved.ack_json) : null;
  if (ack) {
    await verify(ack,ACK,env.HEALER_EVENT_HMAC_KEY);
    const digest=hex(await crypto.subtle.digest('SHA-256',bytes(saved.command_json)));
    if (digest !== saved.command_digest || ack.commandId !== request.commandId ||
        ack.commandDigest !== request.commandDigest || ack.deliveryNonce !== request.deliveryNonce ||
        ack.status !== 'RECEIVED_NOT_EXECUTED') deny();
  }
  return sign({schemaVersion:1,issuer:'archelaos-self-heal',scope:'selfheal.ack.readback.v1',
    commandId:request.commandId,commandDigest:request.commandDigest,deliveryNonce:request.deliveryNonce,
    nonce:request.nonce,issuedAtMs:now,status:ack?'FOUND':'NOT_FOUND',ack},REPLY,env.HEALER_EVENT_HMAC_KEY);
}
