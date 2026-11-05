import test from 'node:test';
import assert from 'node:assert/strict';
import {CERAMIC_PROVIDER,CERAMIC_GATEWAY,CERAMIC_STATUS,makePublicDiscoveryQuery,
  createCeramicBindingTransport,runCeramicDiscovery} from '../src/discovery.mjs';
const id='11111111-1111-4111-8111-111111111111';
const reservationId='22222222-2222-4222-8222-222222222222';
const req={eventId:id,topic:'handball',year:1994};
const item={url:'https://example.org/source',title:'Example',description:'DO NOT STORE'};
function setup(changes={}){
  const log={searched:0,reserved:0,reconciled:0,verified:0,queries:[]};
  const ports={
    readControls:async()=>({globalPaused:false,ceramicEnabled:true,publicDiscoveryEnabled:true}),
    readBudget:async()=>({accountVerified:true,gatewayCreditsVerified:true,
      hardStopVerified:true,monthlyCombinedCapMicroEur:20_000_000,
      quoteVerified:true,quoteMicroEur:1000}),
    reserve:async request=>{log.reserved++;return {id:reservationId,status:'AUTHORIZED'};},
    search:async data=>{log.searched++;log.queries.push(data);return [item];},
    verifyPrimary:async url=>{log.verified++;return {verified:true,canonicalUrl:url,
      sourceSha256:'a'.repeat(64),publisherVerified:true};},
    reconcile:async entry=>{log.reconciled++;return {durablyRecorded:true,actualMicroEur:1000};},
    ...changes
  };
  return {ports,log};
}
test('01 provider is Ceramic and search is OFF by default',()=>{
  assert.equal(CERAMIC_PROVIDER,'ceramic');assert.equal(CERAMIC_GATEWAY,'default');assert.equal(CERAMIC_STATUS,'OFF');
});
test('02 generated searches are fixed public club topics; years start in 1956',()=>{
  assert.match(makePublicDiscoveryQuery(req),/ΓΑΣ Αρχέλαος Κατερίνης χάντμπολ 1994/);
  assert.match(makePublicDiscoveryQuery({...req,topic:'history',year:1956}),/1956/);
  assert.throws(()=>makePublicDiscoveryQuery({...req,year:1955}),/PUBLIC_SEARCH_COMMAND_INVALID/);
});
test('03 free text and athlete names cannot be injected into provider',()=>{
  assert.throws(()=>makePublicDiscoveryQuery({...req,query:'private file'}),/PUBLIC_SEARCH_COMMAND_INVALID/);
  assert.throws(()=>makePublicDiscoveryQuery({...req,topic:'some person'}),/PUBLIC_SEARCH_COMMAND_INVALID/);
  assert.throws(()=>makePublicDiscoveryQuery({...req,eventId:'bad'}),/PUBLIC_SEARCH_COMMAND_INVALID/);
});
test('04 missing ports fail closed without search',async()=>{
  const x=await runCeramicDiscovery(req,{});
  assert.equal(x.status,'CERAMIC_HELD');assert.equal(x.searchCalls,0);
});
test('05 global pause or disabled switch blocks billed searches',async()=>{
  for(const controls of [
    {globalPaused:true,ceramicEnabled:true,publicDiscoveryEnabled:true},
    {globalPaused:false,ceramicEnabled:false,publicDiscoveryEnabled:true},
    {globalPaused:false,ceramicEnabled:true,publicDiscoveryEnabled:false}
  ]){const x=setup({readControls:async()=>controls});
    assert.equal((await runCeramicDiscovery(req,x.ports)).reason,'DISABLED_BY_CENTRAL_BRAIN');
    assert.equal(x.log.reserved,0);assert.equal(x.log.searched,0);
  }
});
test('06 unknown gateway credits, missing hard cap and unverified quote block',async()=>{
  const baseline={accountVerified:true,gatewayCreditsVerified:true,
    hardStopVerified:true,monthlyCombinedCapMicroEur:20_000_000,
    quoteVerified:true,quoteMicroEur:1000};
  for(const data of [
    {...baseline,gatewayCreditsVerified:false},
    {...baseline,hardStopVerified:false},
    {...baseline,quoteVerified:false},
    {...baseline,monthlyCombinedCapMicroEur:20_000_001},
    {...baseline,quoteMicroEur:0},
  ]){const x=setup({readBudget:async()=>data});
    assert.equal((await runCeramicDiscovery(req,x.ports)).reason,
      'CREDITS_OR_HARD_BILLING_CAP_UNVERIFIED');
    assert.equal(x.log.searched,0);
  }
});
test('07 duplicate reservation never invokes Ceramic',async()=>{
  const x=setup({reserve:async()=>({id:reservationId,status:'DUPLICATE'})});
  assert.equal((await runCeramicDiscovery(req,x.ports)).reason,
    'DUPLICATE_OR_UNKNOWN_RESERVATION');
  assert.equal(x.log.searched,0);
});
test('08 provider request is bounded, exactly once, credited and reviewed',async()=>{
  const x=setup();const r=await runCeramicDiscovery(req,x.ports);
  assert.equal(x.log.searched,1);assert.equal(x.log.reserved,1);
  assert.equal(x.log.reconciled,1);
  assert.deepEqual(x.log.queries[0],{query:makePublicDiscoveryQuery(req),
    provider:'ceramic',gatewayId:'default',limit:5});
  assert.equal(r.published,false);assert.equal(r.editorialReviewRequired,true);
  assert.equal(r.verifiedSources.length,1);
  assert.equal(r.searchOutputStored,false);
  assert.equal(JSON.stringify(r).includes('DO NOT STORE'),false);
});
test('09 unknown provider call never retries or loses reconciliation hold',async()=>{
  const x=setup({search:async()=>{x.log.searched++;throw Error('network unknown');}});
  const r=await runCeramicDiscovery(req,x.ports);
  assert.equal(r.status,'CERAMIC_RECONCILIATION_REQUIRED');
  assert.equal(x.log.searched,1);assert.equal(x.log.reconciled,1);
});
test('10 unknown charging is held, never claimed free',async()=>{
  const x=setup({reconcile:async()=>({durablyRecorded:false,actualMicroEur:0})});
  const r=await runCeramicDiscovery(req,x.ports);
  assert.equal(r.status,'CERAMIC_RECONCILIATION_REQUIRED');
  assert.equal(r.published,false);
});
test('11 unsafe URLs, duplicates and unverified primaries are discarded',async()=>{
  const x=setup({search:async()=>[
    {url:'http://localhost/private'},
    {url:'https://example.org/source'},
    {url:'https://example.org/source'},
    {url:'javascript:evil'},
    {url:'https://example.net/misinfo'}
  ],verifyPrimary:async url=>
    ({verified:!url.includes('misinfo'),canonicalUrl:url,
      sourceSha256:'a'.repeat(64),publisherVerified:!url.includes('misinfo')})});
  const r=await runCeramicDiscovery(req,x.ports);
  assert.equal(r.verifiedSources.length,1);
  assert.equal(r.verifiedSources[0].canonicalUrl,'https://example.org/source');
});
test('12 Cloudflare binding uses API websearch response and no alternative model',async()=>{
  const calls=[];
  const cb=createCeramicBindingTransport({websearch:async args=>{
    calls.push(args);return {ok:true,json:async()=>({items:[item]})};
  }});
  const r=await cb({query:'safe',limit:5,provider:'ceramic',gatewayId:'default'});
  assert.equal(r.length,1);
  assert.deepEqual(calls,[{gatewayId:'default',query:'safe',provider:'ceramic',limit:5}]);
});
test('13 transport rejects wrong gateway, provider and response failure',async()=>{
  let attempts=0;
  const cb=createCeramicBindingTransport({websearch:async()=>{
    attempts++;return{ok:false,json:async()=>({})};
  }});
  await assert.rejects(cb({query:'safe',limit:5,provider:'exa',gatewayId:'default'}),
    /CERAMIC_TRANSPORT_POLICY/);
  assert.equal(attempts,0);
  await assert.rejects(cb({query:'safe',limit:5,provider:'ceramic',gatewayId:'default'}),
    /CERAMIC_PROVIDER_UNCERTAIN/);
  assert.equal(attempts,1);
});
