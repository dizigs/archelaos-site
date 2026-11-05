import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_SEEDS, searchUrl, recordUrl, normalize, deduplicate, createStagingClient } from './europeana.mjs';
const item = { id: '/1234/ABC', title: ['Κείμενο Κατερίνης'], year: ['1972'],
  dataProvider: ['Δημοτική Βιβλιοθήκη'], provider: ['Aggregator'], type: 'TEXT',
  rights: ['http://rightsstatements.org/vocab/InC/1.0/'],
  edmIsShownAt: ['https://example.org/archive/1'] };
const ok = data => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({success: true, ...data}) });
const config = extra => ({enabled:true, projectApproved:true, operatorApproved:true, mode:'staging', apiKey:'fixture-only', ...extra});
test('8 Greek/Latin research seeds are query-only', () => {
  assert.equal(SEARCH_SEEDS.length,8);
  assert.ok(SEARCH_SEEDS.every(s => typeof s==='string'));
});
test('header-safe URLs, cursor and hard rows cap', () => {
  const url = new URL(searchUrl('"Πιερία" AND sport','abc+',20));
  assert.equal(url.searchParams.get('cursor'),'abc+');
  assert.equal(url.searchParams.get('rows'),'20');
  assert.equal(url.searchParams.get('wskey'),null);
  assert.throws(() => searchUrl('x','*',100),/INVALID_ROWS/);
  assert.throws(() => recordUrl('/abc/../../escape'),/INVALID_RECORD_ID/);
});
test('metadata normalization remains research-only and retains exact provenance', () => {
  const row=normalize(item,{query:'Κατερίνη',retrievedAt:'2026-11-06T00:00:00Z'});
  assert.equal(row.canonicalUrl,'https://www.europeana.eu/en/item/1234/ABC');
  assert.equal(row.datePrecision,'year');
  assert.equal(row.originInstitutions[0],'Δημοτική Βιβλιοθήκη');
  assert.equal(row.provenance.endpoint,'search');
  assert.equal(row.clubIdentity,'unverified');
  assert.equal(row.mediaCopyAllowed,false);
  assert.equal(row.publicationStatus,'research_only');
});
test('missing rights fail closed, not silently open', () => {
  assert.equal(normalize({...item,rights:[]}).rightsReview,'missing_rights');
});
test('dedupe preserves first record by stable Europeana ID', () => {
  assert.equal(deduplicate([normalize(item),normalize(item)]).length,1);
});
test('offline is default; staging needs both approvals, explicit transport and key', () => {
  assert.throws(() => createStagingClient(),/DISABLED/);
  assert.throws(() => createStagingClient(config({projectApproved:false})),/DISABLED/);
  assert.throws(() => createStagingClient(config({mode:'production'})),/DISABLED/);
  assert.throws(() => createStagingClient(config()),/MISSING_PRIVATE/);
});
test('cursor pagination stops and deduplicates overlapping pages', async () => {
  let calls=0;
  const client=createStagingClient(config({fetchImpl:async ()=>{calls++;return ok(calls===1?{items:[item],nextCursor:'next'}:{items:[item,{...item,id:'/1234/XYZ'}],nextCursor:'next'});}}));
  const rows=await client.search('Katerini');
  assert.equal(calls,2); assert.equal(rows.length,2);
});
test('max 2 pages and no runaway harvesting', async () => {
  let calls=0;
  const client=createStagingClient(config({fetchImpl:async()=>{calls++;return ok({items:[item],nextCursor:String(calls)});}}));
  await client.search('Katerini'); assert.equal(calls,2);
  await assert.rejects(client.search('Katerini',{maxPages:50}),/INVALID_MAX_PAGES/);
});
test('429 is retried once, honoring bounded retry-after', async () => {
  let calls=0; const waits=[];
  const client=createStagingClient(config({now:()=>0,sleep:async ms=>waits.push(ms),fetchImpl:async()=>{calls++;
    return calls===1 ? {ok:false,status:429,headers:{get:()=> '30'}}:ok({items:[item]});}}));
  assert.equal((await client.search('Πιερία')).length,1);
  assert.equal(calls,2); assert.ok(waits.includes(3000));
});
test('401 stops and never leaks a key in error text', async () => {
  let calls=0;
  const client=createStagingClient(config({apiKey:'SECRET_FIXTURE_123',fetchImpl:async()=>{calls++;return {ok:false,status:401};}}));
  await assert.rejects(client.search('Katerini'),e=>e.message==='EUROPEANA_HTTP_401'&&!e.message.includes('SECRET'));
  assert.equal(calls,1);
});
test('reject success:false and mismatching record IDs', async () => {
  const a=createStagingClient(config({fetchImpl:async()=>ok({success:false,items:[item]})}));
  await assert.rejects(a.search('x'),/INVALID_RESPONSE/);
  const b=createStagingClient(config({fetchImpl:async()=>ok({object:{...item,about:'/999/wrong'}})}));
  await assert.rejects(b.record('/1234/ABC'),/RECORD_MISMATCH/);
});
test('memory cache prevents duplicate calls within TTL', async () => {
  let calls=0;
  const client=createStagingClient(config({fetchImpl:async()=>{calls++;return ok({items:[item]});}}));
  await client.search('Archelaos'); await client.search('Archelaos');assert.equal(calls,1);
});
