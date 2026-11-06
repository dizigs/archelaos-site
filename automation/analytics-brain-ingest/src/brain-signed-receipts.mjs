/**
 * Independent offline-capable verification for the Brain #234 Analytics
 * signed ACK + immutable readback contract. This module neither sends data
 * nor configures bindings. A trusted runtime must inject verificationKey
 * securely; never obtain it from the response, a report, or repository source.
 * HMAC is a symmetric-key protocol: restrict key distribution to trusted
 * workers and rotate separately from the intake identity.
 */
import { digest } from '../../analytics-worker/src/aggregate.mjs';

const HEX=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const KEY_ID='brain-capability-receipts-v1';
const PRINCIPAL='analytics-v1';
const ACK_FIELDS=['receiptId','eventId','snapshotKey','metricRevision','status',
  'durable','producerEvidenceDigest','correlationId','schemaVersion','audience',
  'principal','keyId','issuedAtMs','receiptSignature'];
const READBACK_FIELDS=['receiptId','eventId','snapshotKey','metricRevision',
  'reportDigest','source','correlationId','producerEvidenceDigest','status',
  'isCurrent','durable','schemaVersion','audience','principal','keyId',
  'issuedAtMs','receiptSignature'];
const exact=(obj,fields)=>obj!==null&&typeof obj==='object'&&
  !Array.isArray(obj)&&Object.keys(obj).length===fields.length&&
  fields.every(field=>Object.hasOwn(obj,field));

async function authentic(message,fields,audience,verificationKey,now) {
  if(!exact(message,fields)||message.audience!==audience||
    message.principal!==PRINCIPAL||message.keyId!==KEY_ID||
    message.schemaVersion!==1||!HEX.test(message.receiptSignature||'')||
    !Number.isSafeInteger(message.issuedAtMs)||
    Math.abs(message.issuedAtMs-now)>300000||
    typeof verificationKey!=='string'||verificationKey.length<43)
    return false;
  try {
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(verificationKey),
      {name:'HMAC',hash:'SHA-256'},false,['verify']);
    const {receiptSignature,...unsigned}=message;
    const input=new TextEncoder().encode(audience+'\n'+JSON.stringify(unsigned));
    const sig=Uint8Array.from(receiptSignature.match(/../g),byte=>parseInt(byte,16));
    return await crypto.subtle.verify('HMAC',key,sig,input);
  } catch {return false;}
}

/** Cryptographically check a Brain-generated, source-bound durable ACK. */
export async function verifyBrainAnalyticsAck(ack,request,options={}) {
  if(!request?.event?.payload||!request.evidence||
     !HEX.test(request.metricRevision||'')||!HEX.test(request.event.eventId||'')||
     !HEX.test(request.evidence.reportDigest||''))return false;
  const now=options.now??Date.now();
  if(!await authentic(ack,ACK_FIELDS,'analytics.snapshot.ack.v1',
    options.verificationKey,now))return false;
  const evidenceDigest=await digest(JSON.stringify(request.evidence));
  return UUID.test(ack.receiptId||'')&&HEX.test(ack.producerEvidenceDigest||'')&&
    ack.eventId===request.event.eventId&&ack.snapshotKey===request.snapshotKey&&
    ack.metricRevision===request.metricRevision&&
    ack.producerEvidenceDigest===evidenceDigest&&
    ack.correlationId===request.event.correlationId&&ack.durable===true&&
    ['ACCEPTED','DUPLICATE','UPDATED'].includes(ack.status);
}

/**
 * Readback is a distinct signed response from authoritative Brain SQLite
 * state. A superseded version is immutable but NOT current: do not report
 * the submission as a live-current snapshot until reconciled.
 */
export async function verifyBrainAnalyticsReadback(stored,request,ack,options={}) {
  if(!await authentic(stored,READBACK_FIELDS,
    'analytics.snapshot.readback.v1',options.verificationKey,options.now??Date.now()))
    return false;
  if(!request?.evidence||!request?.event?.payload)return false;
  const evidenceDigest=await digest(JSON.stringify(request.evidence));
  return UUID.test(stored.receiptId||'')&&stored.receiptId===ack?.receiptId&&
    stored.eventId===request.event.eventId&&
    stored.snapshotKey===request.snapshotKey&&
    stored.metricRevision===request.metricRevision&&
    stored.reportDigest===request.evidence.reportDigest&&
    stored.source===request.event.payload.source&&
    stored.correlationId===request.event.correlationId&&
    stored.producerEvidenceDigest===evidenceDigest&&
    stored.durable===true&&stored.isCurrent===true&&
    ['ACCEPTED','UPDATED'].includes(stored.status);
}
