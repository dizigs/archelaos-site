import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLibrarianNewsReadiness } from './librarian-news-readiness.mjs';

const SHA='a'.repeat(40);
const NOW=Date.parse('2026-11-07T12:00:00Z');
const candidate=()=>({
  librarianBindings:[
    {name:'LEDGER',type:'durable_object_namespace',class_name:'LibrarianLedger'},
    {name:'BRAIN_PRIVATE',type:'service',service:'archelaos-brain-staging'},
    {name:'BRAIN_NEWS_INTAKE_KEY',type:'secret_text'},
    {name:'BRAIN_CAPABILITY_RECEIPT_KEY',type:'secret_text'},
    {name:'NEWS_IMPORT_ENABLED',type:'plain_text',text:'false'},
    {name:'ARCHIVE_IMPORT_ENABLED',type:'plain_text',text:'false'},
    {name:'DRIVE_LINK_PROBE_ENABLED',type:'plain_text',text:'false'}
  ],
  brainBindings:[
    {name:'BRAIN',type:'durable_object_namespace',class_name:'BrainCoordinator'},
    {name:'BRAIN_NEWS_INTAKE_KEY',type:'secret_text'},
    {name:'BRAIN_CAPABILITY_RECEIPT_KEY',type:'secret_text'}
  ],
  observedBrainSha:SHA,approvedBrainSha:SHA,
  executableBytesIndependentlyAttested:true,nowMs:NOW,
  stagingExpiresAt:'2026-11-07T12:30:00Z',
  currentLibrarianSourceMounted:true,
  authenticatedNewsSourceAttested:true,
  newsEventContract:'news.search.completed',
  sourcePrincipal:'news-v1',
  librarianDurableAuditAttested:true,
  brainSignedReceiptAndReadbackAttested:true,
  requestAndReceiptKeysDistinctAttested:true,
  noPublicFallbackAttested:true,
  noProviderWritesOrNotebookImportsAttested:true,
  librarianOwnerApproved:true,brainOwnerApproved:true,releaseOperatorApproved:true
});
const check=patch=>assessLibrarianNewsReadiness({...candidate(),...patch});
function blocked(out,code) {
  assert.equal(out.status,'BLOCKED');
  assert.ok(out.blockers.includes(code),JSON.stringify(out.blockers));
  assert.equal(out.connected,false);
  assert.equal(out.authenticatedE2EVerified,false);
  assert.equal(out.privatePdfReadAuthorized,false);
  assert.equal(out.notebookWriteAuthorized,false);
  assert.equal(out.liveImportEnabled,false);
}

test('even entirely synthetic approved metadata never claims a live connection or grants imports',()=>{
  const a=check({});
  assert.equal(a.status,'READY_FOR_OWNER_STAGING_REVIEW');
  assert.deepEqual(a.blockers,[]);
  assert.deepEqual(a.scope,{caller:'archelaos-librarian-staging',source:'news',eventType:'news.search.completed'});
  assert.deepEqual(a.proposedBinding,{type:'service',name:'BRAIN_PRIVATE',service:'archelaos-brain-staging'});
  assert.equal(a.authenticatedE2EVerified,false);
  assert.equal(a.notebookWriteAuthorized,false);
  assert.equal(a.privatePdfReadAuthorized,false);
});
test('actual deployed Librarian and Brain binding metadata is blocked, with imports OFF',()=>{
  const observed={
    librarianBindings:[
      {name:'LEDGER',type:'durable_object_namespace',class_name:'LibrarianLedger'},
      {name:'NEWS_IMPORT_ENABLED',type:'plain_text',text:'false'},
      {name:'ARCHIVE_IMPORT_ENABLED',type:'plain_text',text:'false'},
      {name:'DRIVE_LINK_PROBE_ENABLED',type:'plain_text',text:'false'}],
    brainBindings:[
      {name:'BRAIN',type:'durable_object_namespace',class_name:'BrainCoordinator'},
      {name:'HEALER',type:'service',service:'archelaos-self-heal'}],
    observedBrainSha:'5c5401d57fda3a3d1a815c48b43f55a2741a8ded',
    stagingExpiresAt:'1970-01-01T00:00:00Z',
    executableBytesIndependentlyAttested:false,
    currentLibrarianSourceMounted:false,
    authenticatedNewsSourceAttested:false
  };
  const result=check(observed);
  for(const code of [
    'PRIVATE_BRAIN_SERVICE_BINDING_UNVERIFIED',
    'LIBRARIAN_NEWS_PRINCIPAL_KEY_ABSENT',
    'LIBRARIAN_RECEIPT_VERIFIER_ABSENT',
    'BRAIN_NEWS_PRINCIPAL_KEY_ABSENT',
    'BRAIN_RECEIPT_SIGNER_ABSENT',
    'PRIVATE_STAGING_EXPIRED_OR_UNBOUNDED',
    'BRAIN_EXACT_DEPLOYED_VERSION_UNVERIFIED',
    'LIBRARIAN_SOURCE_CONTRACT_NOT_MOUNTED',
    'NEWS_SOURCE_EVENT_PROVENANCE_UNVERIFIED'
  ])blocked(result,code);
});
test('missing or forged inventory never qualifies',()=>{
  blocked(check({librarianBindings:null}),'BINDING_INVENTORY_UNAVAILABLE');
  blocked(check({brainBindings:undefined}),'BINDING_INVENTORY_UNAVAILABLE');
  blocked(check({librarianBindings:[]}),'EXISTING_LIBRARIAN_LEDGER_NOT_PRESERVED');
});
test('wrong service, duplicate binding or unexpected alias cannot silently override private destination',()=>{
  const b=candidate().librarianBindings;
  blocked(check({librarianBindings:b.filter(x=>x.name!=='BRAIN_PRIVATE')}),'PRIVATE_BRAIN_SERVICE_BINDING_UNVERIFIED');
  blocked(check({librarianBindings:b.map(x=>x.name==='BRAIN_PRIVATE'?{...x,service:'other'}:x)}),'PRIVATE_BRAIN_SERVICE_BINDING_UNVERIFIED');
  blocked(check({librarianBindings:[...b,b.find(x=>x.name==='BRAIN_PRIVATE')]}),'PRIVATE_BRAIN_SERVICE_BINDING_UNVERIFIED');
  blocked(check({librarianBindings:[...b,{name:'SECOND_BRAIN',type:'service',service:'archelaos-brain-staging'}]}),'PRIVATE_BRAIN_SERVICE_BINDING_UNVERIFIED');
});
test('canonical existing Librarian Ledger cannot be replaced by another namespace class',()=>{
  const b=candidate().librarianBindings;
  blocked(check({librarianBindings:b.map(x=>x.name==='LEDGER'?{...x,class_name:'OtherLedger'}:x)}),'EXISTING_LIBRARIAN_LEDGER_NOT_PRESERVED');
});
test('missing, duplicate or misclassified secret binding names fail closed',()=>{
  const b=candidate().brainBindings;
  blocked(check({brainBindings:b.filter(x=>x.name!=='BRAIN_NEWS_INTAKE_KEY')}),'BRAIN_NEWS_PRINCIPAL_KEY_ABSENT');
  blocked(check({brainBindings:b.map(x=>x.name==='BRAIN_CAPABILITY_RECEIPT_KEY'?{...x,type:'plain_text'}:x)}),'BRAIN_RECEIPT_SIGNER_ABSENT');
  blocked(check({brainBindings:[...b,b.find(x=>x.name==='BRAIN_NEWS_INTAKE_KEY')]}),'BRAIN_NEWS_PRINCIPAL_KEY_ABSENT');
});
test('all three Librarian import and private-link flags must remain literally false',()=>{
  const b=candidate().librarianBindings;
  for(const flag of ['NEWS_IMPORT_ENABLED','ARCHIVE_IMPORT_ENABLED','DRIVE_LINK_PROBE_ENABLED']){
    for(const text of ['true',true,1,undefined]){
      blocked(check({librarianBindings:b.map(x=>x.name===flag?{...x,text}:x)}),flag+'_MUST_STAY_DISABLED');
    }
  }
});
test('configured SHA string is not executable-byte attestation',()=>{
  blocked(check({executableBytesIndependentlyAttested:false}),'BRAIN_EXACT_DEPLOYED_VERSION_UNVERIFIED');
  blocked(check({approvedBrainSha:'b'.repeat(40)}),'BRAIN_EXACT_DEPLOYED_VERSION_UNVERIFIED');
});
test('staging must be explicitly time-bounded',()=>{
  blocked(check({stagingExpiresAt:'1970-01-01T00:00:00Z'}),'PRIVATE_STAGING_EXPIRED_OR_UNBOUNDED');
  blocked(check({stagingExpiresAt:'2026-11-07T14:00:00Z'}),'PRIVATE_STAGING_EXPIRED_OR_UNBOUNDED');
  blocked(check({stagingExpiresAt:'tomorrow'}),'PRIVATE_STAGING_EXPIRED_OR_UNBOUNDED');
});
test('unverified source mounting is not replaced by approved-looking event data',()=>{
  blocked(check({currentLibrarianSourceMounted:false}),'LIBRARIAN_SOURCE_CONTRACT_NOT_MOUNTED');
});
test('news source requires verified principal and exact approved event type',()=>{
  blocked(check({sourcePrincipal:'staging-v1'}),'NEWS_SOURCE_EVENT_PROVENANCE_UNVERIFIED');
  blocked(check({newsEventContract:'source.file.created'}),'NEWS_SOURCE_EVENT_PROVENANCE_UNVERIFIED');
  blocked(check({authenticatedNewsSourceAttested:false}),'NEWS_SOURCE_EVENT_PROVENANCE_UNVERIFIED');
});
test('immutable receipt, audit and HMAC trust separation are independent gates',()=>{
  blocked(check({librarianDurableAuditAttested:false}),'LIBRARIAN_DURABLE_AUDIT_UNVERIFIED');
  blocked(check({brainSignedReceiptAndReadbackAttested:false}),'BRAIN_SIGNED_NEWS_READBACK_UNVERIFIED');
  blocked(check({requestAndReceiptKeysDistinctAttested:false}),'HMAC_TRUST_DOMAINS_UNVERIFIED');
});
test('no public transport or Notebook/provider write may be inferred',()=>{
  blocked(check({noPublicFallbackAttested:false}),'PRIVATE_TRANSPORT_ONLY_NOT_ATTESTED');
  blocked(check({noProviderWritesOrNotebookImportsAttested:false}),'REVIEW_ONLY_SIDE_EFFECTS_NOT_ATTESTED');
});
test('approvals are explicit trusted booleans, not truthy strings or objects',()=>{
  for(const flag of ['librarianOwnerApproved','brainOwnerApproved','releaseOperatorApproved']){
    for(const v of ['true',1,{},null])
      blocked(check({[flag]:v}),'RELEASE_APPROVAL_MISSING');
  }
});
