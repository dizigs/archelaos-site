import test from 'node:test';
import assert from 'node:assert/strict';
import app,{audit,sanitizeCampaigns} from '../src/index.mjs';
const secret='a'.repeat(64), key='raisely-sk-FAKE';
const makeResponse=x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
const mock=async (url, opts)=> {
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'manual');
  assert.equal(opts.headers.Authorization,`Bearer ${key}`);
  if (url.endsWith('/authenticate')) return makeResponse({data:{uuid:'user-private'}});
  if (url.startsWith('https://api.raisely.com/v3/campaigns?')) return makeResponse({data:[
    {path:'other',name:'Wrong'},
    {path:'archelaos-katerini',name:'Αρχέλαος',currency:'EUR',goal:100000,mode:'TEST', config:{private:true},donor:{name:'private'}},
  ]});
  throw Error('unexpected upstream URL');
};
test('public health is minimal and reliable',async()=>{
  const r=await app.fetch(new Request('https://bridge.example/health'),{});
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{service:'archelaos-raisely-bridge',status:'deployed'});
});
test('unknown routes and non-GET methods are denied',async()=>{
  assert.equal((await app.fetch(new Request('https://bridge.example/donations'),{})).status,404);
  assert.equal((await app.fetch(new Request('https://bridge.example/check',{method:'POST'}),{})).status,404);
});
test('unauthenticated check is hidden',async()=>{
  assert.equal((await app.fetch(new Request('https://bridge.example/check'),{RAISELY_CHECK_KEY:secret})).status,404);
});
test('short or incorrect secrets are rejected',async()=>{
  const req=new Request('https://bridge.example/check',{headers:{authorization:'Bearer wrong'}});
  assert.equal((await app.fetch(req,{RAISELY_CHECK_KEY:secret})).status,404);
});
test('authenticated check fails closed until key configured',async()=>{
  const req=new Request('https://bridge.example/check',{headers:{authorization:`Bearer ${secret}`}});
  const r=await app.fetch(req,{RAISELY_CHECK_KEY:secret});
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{status:'not_configured'});
});
test('fixed read-only upstream routes are queried with bearer token',async()=>{
  const r=await audit({RAISELY_API_KEY:key},mock);
  assert.equal(r.status,'authenticated');
  assert.deepEqual(r.campaign,{path:'archelaos-katerini',name:'Αρχέλαος',currency:'EUR',goal:100000,mode:'TEST'});
});
test('private fields are never included in result',async()=>{
  assert.doesNotMatch(JSON.stringify(await audit({RAISELY_API_KEY:key},mock)),/user-private|donor|config/);
});
test('campaign path is strictly matched',()=>{
  assert.throws(()=>sanitizeCampaigns({data:[{path:'other'}]}),/CAMPAIGN_MISSING/);
});
test('no silently accepted malformed Raisely response',()=>{
  assert.throws(()=>sanitizeCampaigns({data:{path:'archelaos-katerini'}}),/RAISELY_SCHEMA/);
});
test('provider failures do not leak details',async()=>{
  const bad=async()=>new Response('private provider details',{status:403});
  await assert.rejects(audit({RAISELY_API_KEY:key},bad),/RAISELY_UNAVAILABLE/);
});
test('token is never exposed by public endpoint',async()=>{
  const r=await app.fetch(new Request('https://bridge.example/health'),{RAISELY_API_KEY:key});
  assert.doesNotMatch(await r.text(),/raisely-sk/);
});
test('authorization is not accepted as query parameter',async()=>{
  const r=await app.fetch(new Request('https://bridge.example/check?access_token='+secret),{RAISELY_CHECK_KEY:secret});
  assert.equal(r.status,404);
});
