import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
const bank = JSON.parse(read('assets/fact-check-claims.json'));
const backendSource = read('functions/api/fact-check.js');
const api = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(backendSource));

test('all 61 unverified research dilemmas are present without answer key', () => {
  assert.equal(bank.schema_version, 1);
  assert.equal(bank.items.length, 61);
  const ids = bank.items.map(entry => entry.id);
  assert.deepEqual(ids, Array.from({length:61},(_,i)=>'TF'+String(i+1).padStart(3,'0')));
  for (const entry of bank.items) {
    assert.equal(entry.status, 'unverified');
    assert.ok(entry.claim.trim().length > 20);
    assert.ok(entry.category.length > 1);
    assert.equal(Object.hasOwn(entry,'answer'), false);
    assert.equal(Object.hasOwn(entry,'verified'), false);
  }
});

test('museum and rebuild both link to the same 61-dilemma feature', () => {
  for (const path of ['history.html','rebuild/history.html']) {
    const text = read(path);
    assert.match(text,/id="arch-factcheck-promo"/);
    assert.match(text,/id="fc-grid"/);
    assert.match(text,/id="fc-dialog"/);
    assert.match(text,/\/assets\/fact-check\.js\?v=2/);
  }
});

test('intake stays fail-closed without D1 or Turnstile secret', async () => {
  const info = await api.onRequestGet({env:{}});
  assert.deepEqual(await info.json(),{ready:false,sitekey:'0x4AAAAAAFoyKwIFuvMbrcAd'});
  const r = await api.onRequestPost({request:new Request('https://archelaos.club/api/fact-check',{method:'POST'}),env:{}});
  assert.equal(r.status,503);
});

test('nonexistent TF000 and TF062 are refused before verification or DB writes', async () => {
  let called=false;
  const env={FACTCHECK_DB:{prepare(){called=true;throw Error('unexpected write');}},TURNSTILE_SECRET:'secret'};
  for (const id of ['TF000','TF062','TF999','FAKE']) {
    const request = new Request('https://archelaos.club/api/fact-check',{method:'POST',headers:{Origin:'https://archelaos.club','Content-Type':'application/json'},body:JSON.stringify({claimId:id,choice:'true'})});
    const r=await api.onRequestPost({request,env});
    assert.equal(r.status,400,id);
  }
  assert.equal(called,false);
});

test('without valid Turnstile token even a real dilemma does not write',async()=>{
  let called=false;
  const env={FACTCHECK_DB:{prepare(){called=true;throw Error('unexpected write');}},TURNSTILE_SECRET:'secret'};
  const request = new Request('https://archelaos.club/api/fact-check',{method:'POST',headers:{Origin:'https://archelaos.club','Content-Type':'application/json'},body:JSON.stringify({claimId:'TF001',choice:'unknown',evidence:'',referenceUrl:''})});
  const r=await api.onRequestPost({request,env});
  assert.equal(r.status,403);
  assert.equal(called,false);
});
