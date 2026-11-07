import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheetProjector, eventKey, toSheetRow, ProjectionFault } from './sheet-projector.mjs';
const H = n => n.toString(16).repeat(64);
const UUID = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const receipt = (seq, prev = seq === 1 ? H(0) : H(seq-1)) => ({
  seq, source:'github-actions', event_id:UUID(seq), tool_id:'github', command_id:'checks',
  outcome:'PASS', task_id:'S04-011', commit_sha:'a'.repeat(40),
  evidence_url:'https://github.com/dizigs/archelaos-site/actions/runs/123',
  server_at:Date.parse('2026-11-07T10:00:00.000Z'), prev_hash:prev,
  receipt_hash:H(seq),
});
const fault = (code) => e => e instanceof ProjectionFault && e.code === code;
function fixture(receipts=[receipt(1), receipt(2)]) {
  const rows=[]; let position={seq:0,hash:H(0)}, attempts=0,lock=false;
  const gate={async runExclusive(fn){if(lock)throw new ProjectionFault('WRITER_BUSY');lock=true;try{return await fn();}finally{lock=false;}}};
  const source={async list({after,limit}){return receipts.filter(r=>r.seq>after).slice(0,limit);}};
  const sheet={
    async findByEventKeys(keys){return rows.filter(r=>keys.includes(r[7])).map(r=>({eventKey:r[7],receiptHash:r[13]}));},
    async appendRows(next){attempts++;rows.push(...next.map(r=>[...r]));},
  };
  const checkpoint={async read(){return {...position};},async compareAndSet(before,next){if(position.seq!==before.seq||position.hash!==before.hash)return false;position={...next};return true;}};
  const projector=()=>createSheetProjector({source,sheet,checkpoint,gate});
  return {rows,gate,source,sheet,checkpoint,projector,get attempts(){return attempts},get position(){return position}};
}

test('projects ordered signed metadata to existing A:R without secrets',async()=>{
  const f=fixture(),out=await f.projector().projectOnce();
  assert.deepEqual(out,{status:'VERIFIED',checked:2,appended:2,checkpoint:2});
  assert.equal(f.rows.length,2);assert.equal(f.rows[0].length,18);
  assert.equal(f.rows[0][7],eventKey(receipt(1)));assert.equal(f.rows[0][13],H(1));
  assert.equal(f.rows[0][16],'2026-11-07T10:00:00.000Z');
  assert.equal(await f.projector().projectOnce().then(x=>x.status),'IDLE');
  assert.equal(f.attempts,1);
});

test('provider timeout AFTER successful append causes safe deduplicated restart',async()=>{
  const f=fixture();const original=f.sheet.appendRows;
  f.sheet.appendRows=async rows=>{await original(rows);throw Error('provider connection lost after commit');};
  await assert.rejects(()=>f.projector().projectOnce(),/provider connection lost/);
  assert.equal(f.position.seq,0);assert.equal(f.rows.length,2);
  f.sheet.appendRows=original;
  const out=await f.projector().projectOnce();
  assert.equal(out.appended,0);assert.equal(f.rows.length,2);assert.equal(f.position.seq,2);
});

test('silent partial sheet append fails closed and next replay fills missing only',async()=>{
  const f=fixture();const original=f.sheet.appendRows;
  f.sheet.appendRows=async rows=>original(rows.slice(0,1));
  await assert.rejects(()=>f.projector().projectOnce(),fault('SHEET_RECEIPT_GAP'));
  assert.equal(f.position.seq,0);assert.equal(f.rows.length,1);
  f.sheet.appendRows=original;
  const out=await f.projector().projectOnce();
  assert.equal(out.appended,1);assert.equal(f.position.seq,2);assert.equal(f.rows.length,2);
});

test('detects duplicate Sheet event keys without advancing cursor',async()=>{
  const f=fixture();f.rows.push(toSheetRow(receipt(1)),toSheetRow(receipt(1)));
  await assert.rejects(()=>f.projector().projectOnce(),fault('DUPLICATE_SHEET_EVENT'));
  assert.equal(f.position.seq,0);assert.equal(f.attempts,0);
});

test('detects altered receipt hash without overwriting evidence',async()=>{
  const f=fixture();const r=toSheetRow(receipt(1));r[13]=H(9);f.rows.push(r);
  await assert.rejects(()=>f.projector().projectOnce(),fault('SHEET_EVENT_HASH_CONFLICT'));
  assert.equal(f.position.seq,0);
});

test('rejects sequence gaps and broken SQLite hash chain',async()=>{
  const gap=fixture([receipt(1),receipt(3,H(1))]);
  await assert.rejects(()=>gap.projector().projectOnce(),fault('SOURCE_SEQUENCE_GAP'));
  const chain=fixture([receipt(1),receipt(2,H(8))]);
  await assert.rejects(()=>chain.projector().projectOnce(),fault('SOURCE_HASH_CHAIN_BROKEN'));
  assert.equal(gap.rows.length,0);assert.equal(chain.rows.length,0);
});

test('refuses unexpected source fields and formula-looking private content',()=>{
  const f=receipt(1);f.task_id='=IMPORTXML(1,2)';
  assert.throws(()=>toSheetRow(f),fault('INVALID_SOURCE_RECEIPT'));
  const g=receipt(1);g.evidence_url='https://github.com/dizigs/archelaos-site/issues/71?secret=token';
  assert.throws(()=>toSheetRow(g),fault('INVALID_SOURCE_RECEIPT'));
});

test('checkpoint CAS conflict never reports committed checkpoint',async()=>{
  const f=fixture();f.checkpoint.compareAndSet=async()=>false;
  await assert.rejects(()=>f.projector().projectOnce(),fault('CHECKPOINT_CONFLICT'));
  assert.equal(f.position.seq,0);
  assert.equal(f.rows.length,2);
});

test('single-writer gate refuses overlapping execution',async()=>{
  const f=fixture(),start=f.source.list;let release,entered;
  const waiting=new Promise(res=>release=res);const enteredPromise=new Promise(res=>entered=res);
  f.source.list=async args=>{entered();await waiting;return start(args);};
  const first=f.projector().projectOnce();await enteredPromise;
  await assert.rejects(()=>f.projector().projectOnce(),fault('WRITER_BUSY'));
  release();assert.equal((await first).status,'VERIFIED');
});

test('untrusted or incomplete adapters rejected',()=>{
  assert.throws(()=>createSheetProjector({}),fault('TRUSTED_ADAPTERS_REQUIRED'));
  const f=fixture();assert.throws(()=>createSheetProjector({source:f.source,sheet:f.sheet,checkpoint:f.checkpoint,gate:f.gate,limit:101}),fault('TRUSTED_ADAPTERS_REQUIRED'));
});
