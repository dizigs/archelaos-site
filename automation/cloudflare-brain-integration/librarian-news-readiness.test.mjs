import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLibrarianNewsReadiness } from './librarian-news-readiness.mjs';

const SHA='a'.repeat(40);
const NOW=Date.parse('2026-11-07T12:00:00Z');
const candidate=()=>({
  contractVersion:2,direction:'brain-to-librarian',rpcMethod:'importPublishedNews',
  commandScope:'news',callerKeyId:'librarian-news-v1',
  librarianBindings:[
    {name:'LEDGER',type:'durable_object_namespace',class_name:'LibrarianLedger'},
    {name:'LIBRARIAN_NEWS_CALLER_KEY',type:'secret_text'},
    {name:'LEDGER_INTERNAL_KEY',type:'secret_text'},
    ...['NEWS_IMPORT_ENABLED','ARCHIVE_IMPORT_ENABLED','DRIVE_LINK_PROBE_ENABLED']
      .map(name=>({name,type:'plain_text',text:'false'}))
  ],
  brainBindings:[
    {name:'BRAIN',type:'durable_object_namespace',class_name:'BrainCoordinator'},
    {name:'LIBRARIAN_PRIVATE',type:'service',service:'archelaos-librarian-staging'},
    {name:'LIBRARIAN_NEWS_CALLER_KEY',type:'secret_text'}
  ],
  observedBrainSha:SHA,approvedBrainSha:SHA,executableBytesIndependentlyAttested:true,
  observedLibrarianSha:SHA,approvedLibrarianSha:SHA,librarianExecutableBytesIndependentlyAttested:true,
  nowMs:NOW,stagingExpiresAt:'2026-11-07T12:30:00Z',
  currentLibrarianSourceMounted:true,librarianCommandAuthAttested:true,
  librarianDurableNonceAttested:true,librarianDurableAuditAttested:true,
  librarianSignedReceiptAndReadbackAttested:true,requestAndReceiptKeysDistinctAttested:true,
  noPublicFallbackAttested:true,noProviderWritesOrNotebookImportsAttested:true,
  librarianOwnerApproved:true,brainOwnerApproved:true,releaseOperatorApproved:true
});
function check(patch={}) {return assessLibrarianNewsReadiness({...candidate(),...patch});}
function inert(out) {
  for(const flag of ['connected','authenticatedE2EVerified','privatePdfReadAuthorized',
    'notebookWriteAuthorized','liveImportEnabled','runtimeActivationAuthorized'])
    assert.equal(out[flag],false,flag);
}
function blocked(out,code) {
  assert.equal(out.status,'BLOCKED');assert.ok(out.blockers.includes(code),JSON.stringify(out.blockers));
  inert(out);
}

test('review-only consumer contract proposes Brain caller binding without authorizing imports',()=>{
  const out=check();assert.equal(out.status,'READY_FOR_OWNER_STAGING_REVIEW');
  assert.deepEqual(out.blockers,[]);assert.equal(out.contractVersion,2);inert(out);
  assert.deepEqual(out.scope,{caller:'archelaos-brain-staging',consumer:'archelaos-librarian-staging',
    direction:'brain-to-librarian',method:'importPublishedNews',commandScope:'news',keyId:'librarian-news-v1'});
  assert.deepEqual(out.proposedBinding,{type:'service',name:'LIBRARIAN_PRIVATE',service:'archelaos-librarian-staging'});
});

test('old publisher event cannot qualify even with all old proofs true',()=>{
  blocked(check({contractVersion:1,direction:'librarian-to-brain',rpcMethod:undefined,
    newsEventContract:'news.search.completed',sourcePrincipal:'news-v1',
    authenticatedNewsSourceAttested:true}),'LIBRARIAN_COMMAND_CONTRACT_UNVERIFIED');
});

test('consumer-side reverse binding cannot substitute for Brain caller binding',()=>{
  const p=candidate();
  blocked(check({brainBindings:p.brainBindings.filter(x=>x.name!=='LIBRARIAN_PRIVATE'),
    librarianBindings:[...p.librarianBindings,{name:'BRAIN_PRIVATE',type:'service',service:'archelaos-brain-staging'}]}),
    'PRIVATE_LIBRARIAN_SERVICE_BINDING_UNVERIFIED');
});

test('wrong command scope, method, principal or direction is rejected',()=>{
  for(const patch of [{commandScope:'drive'},{rpcMethod:'importApprovedPdf'},{callerKeyId:'news-v1'},
    {direction:'librarian-to-brain'},{contractVersion:undefined},{librarianCommandAuthAttested:'true'}])
    blocked(check(patch),'LIBRARIAN_COMMAND_CONTRACT_UNVERIFIED');
});

test('binding inventory, canonical Brain and existing Librarian Ledger are required',()=>{
  blocked(check({brainBindings:null}),'BINDING_INVENTORY_UNAVAILABLE');
  blocked(check({librarianBindings:undefined}),'BINDING_INVENTORY_UNAVAILABLE');
  blocked(check({brainBindings:[]}),'CANONICAL_BRAIN_DO_MISSING');
  blocked(check({librarianBindings:[]}),'EXISTING_LIBRARIAN_LEDGER_NOT_PRESERVED');
});

test('wrong service, duplicate binding and aliases fail closed',()=>{
  const b=candidate().brainBindings;
  for(const binding of [{name:'LIBRARIAN_PRIVATE',type:'service',service:'other'},
    {name:'OTHER_ALIAS',type:'service',service:'archelaos-librarian-staging'}])
    blocked(check({brainBindings:[...b,binding]}),'PRIVATE_LIBRARIAN_SERVICE_BINDING_UNVERIFIED');
  blocked(check({brainBindings:b.map(x=>x.name==='LIBRARIAN_PRIVATE'?{...x,service:'other'}:x)}),
    'PRIVATE_LIBRARIAN_SERVICE_BINDING_UNVERIFIED');
});

test('actual caller-verifier key metadata and existing Ledger auth required without reading values',()=>{
  const p=candidate();
  for(const [name,code] of [['LIBRARIAN_NEWS_CALLER_KEY','LIBRARIAN_COMMAND_VERIFIER_ABSENT'],
    ['LEDGER_INTERNAL_KEY','LIBRARIAN_LEDGER_AUTH_ABSENT']])
    blocked(check({librarianBindings:p.librarianBindings.filter(x=>x.name!==name)}),code);
  for(const bindings of [p.brainBindings.filter(x=>x.name!=='LIBRARIAN_NEWS_CALLER_KEY'),
    p.brainBindings.map(x=>x.name==='LIBRARIAN_NEWS_CALLER_KEY'?{...x,type:'plain_text'}:x),
    [...p.brainBindings,p.brainBindings.find(x=>x.name==='LIBRARIAN_NEWS_CALLER_KEY')]])
    blocked(check({brainBindings:bindings}),'BRAIN_LIBRARIAN_COMMAND_SIGNER_ABSENT');
});

test('all import/probe flags remain literally false during source contract review',()=>{
  for(const name of ['NEWS_IMPORT_ENABLED','ARCHIVE_IMPORT_ENABLED','DRIVE_LINK_PROBE_ENABLED'])
    for(const text of ['true',true,1,undefined])
      blocked(check({librarianBindings:candidate().librarianBindings.map(x=>x.name===name?{...x,text}:x)}),
        name+'_MUST_STAY_DISABLED');
});

test('both executable identities need independent attestation, configured SHA alone insufficient',()=>{
  blocked(check({executableBytesIndependentlyAttested:false}),'BRAIN_EXACT_DEPLOYED_VERSION_UNVERIFIED');
  blocked(check({approvedBrainSha:'b'.repeat(40)}),'BRAIN_EXACT_DEPLOYED_VERSION_UNVERIFIED');
  blocked(check({librarianExecutableBytesIndependentlyAttested:false}),'LIBRARIAN_EXACT_DEPLOYED_VERSION_UNVERIFIED');
  blocked(check({approvedLibrarianSha:'b'.repeat(40)}),'LIBRARIAN_EXACT_DEPLOYED_VERSION_UNVERIFIED');
});

test('expired, oversized and malformed staging windows fail closed',()=>{
  for(const stagingExpiresAt of ['1970-01-01T00:00:00Z','2026-11-07T14:00:00Z','tomorrow'])
    blocked(check({stagingExpiresAt}),'PRIVATE_STAGING_EXPIRED_OR_UNBOUNDED');
});

test('nonce, audit, signed readback and command/receipt trust separation are separate proofs',()=>{
  for(const [name,code] of [
    ['currentLibrarianSourceMounted','LIBRARIAN_SOURCE_CONTRACT_NOT_MOUNTED'],
    ['librarianDurableNonceAttested','LIBRARIAN_DURABLE_NONCE_UNVERIFIED'],
    ['librarianDurableAuditAttested','LIBRARIAN_DURABLE_AUDIT_UNVERIFIED'],
    ['librarianSignedReceiptAndReadbackAttested','LIBRARIAN_SIGNED_COMMAND_READBACK_UNVERIFIED'],
    ['requestAndReceiptKeysDistinctAttested','COMMAND_RECEIPT_TRUST_DOMAINS_UNVERIFIED'],
    ['noPublicFallbackAttested','PRIVATE_TRANSPORT_ONLY_NOT_ATTESTED'],
    ['noProviderWritesOrNotebookImportsAttested','REVIEW_ONLY_SIDE_EFFECTS_NOT_ATTESTED']])
    blocked(check({[name]:false}),code);
});

test('approvals never substitute for runtime authorization',()=>{
  for(const name of ['librarianOwnerApproved','brainOwnerApproved','releaseOperatorApproved'])
    for(const value of ['true',1,{},null])blocked(check({[name]:value}),'RELEASE_APPROVAL_MISSING');
});
