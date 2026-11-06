import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAppsScriptBridgeReadiness } from './apps-script-readiness.mjs';

const SHA='a'.repeat(40);
const time=Date.parse('2026-11-06T21:00:00Z');
const eligible=()=>({
  bridgeBindings: [
    {type:'durable_object_namespace',name:'APPS_SCRIPT_COORDINATOR'},
    {type:'kv_namespace',name:'AUTH_KV'},
    {type:'service',name:'BRAIN_PRIVATE',service:'archelaos-brain-staging'},
    {type:'secret_text',name:'BRAIN_APPS_SCRIPT_INTAKE_KEY'},
    {type:'secret_text',name:'BRAIN_CAPABILITY_RECEIPT_KEY'}
  ],
  brainBindings: [
    {type:'durable_object_namespace',name:'BRAIN',class_name:'BrainCoordinator'},
    {type:'secret_text',name:'BRAIN_APPS_SCRIPT_INTAKE_KEY'},
    {type:'secret_text',name:'BRAIN_CAPABILITY_RECEIPT_KEY'}
  ],
  nowMs:time,stagingExpiresAt:'2026-11-06T21:15:00Z',
  observedBrainConfiguredSha:SHA,approvedBrainExecutableSha:SHA,
  independentExecutableShaAttested:true,
  oauthGrantedScopes:['https://www.googleapis.com/auth/script.projects'],
  runtimeOAuthGrantVerified:true,
  bridgeSourceMountVerified:true,googleProviderReadbackVerified:true,
  durableAuditVerified:true,keysIndependentVerified:true,
  brainCapabilityContractAttested:true,liveGoogleWritesDisabledVerified:true,
  bridgeOwnerApproved:true,brainOwnerApproved:true,operatorApproved:true
});
const assess=patch=>assessAppsScriptBridgeReadiness({...eligible(),...patch});
const blocked=(result,code)=>{
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.blockers.includes(code));
  assert.equal(result.liveConnectionVerified,false);
  assert.equal(result.liveGoogleWritesAuthorized,false);
};

test('eligible synthetic metadata is ONLY ready for independent staging review',()=>{
  const result=assess({});
  assert.equal(result.status,'READY_FOR_PRIVATE_STAGING_REVIEW');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.approvalIsNotConnection,true);
  assert.equal(result.liveConnectionVerified,false);
  assert.equal(result.liveGoogleWritesAuthorized,false);
});
test('real installed source metadata missing private service and intake keys is BLOCKED',()=>{
  const bridgeBindings=[
    {type:'durable_object_namespace',name:'APPS_SCRIPT_COORDINATOR'},
    {type:'kv_namespace',name:'AUTH_KV'}
  ];
  const brainBindings=[{type:'durable_object_namespace',name:'BRAIN',class_name:'BrainCoordinator'}];
  const result=assess({bridgeBindings,brainBindings,stagingExpiresAt:'1970-01-01T00:00:00Z',
    bridgeSourceMountVerified:false,googleProviderReadbackVerified:false,
    runtimeOAuthGrantVerified:false});
  for(const code of [
    'PRIVATE_BRAIN_SERVICE_BINDING_NOT_VERIFIED','CALLER_APPS_SCRIPT_KEY_MISSING',
    'CALLER_RECEIPT_VERIFIER_MISSING','BRAIN_APPS_SCRIPT_KEY_MISSING',
    'BRAIN_RECEIPT_SIGNING_KEY_MISSING','STAGING_NOT_TIME_BOUNDED',
    'BRIDGE_BRAIN_ADAPTER_NOT_MOUNTED','APPS_SCRIPT_PROVIDER_PROVENANCE_NOT_VERIFIED',
    'GOOGLE_RUNTIME_SCOPE_NOT_VERIFIED'
  ])blocked(result,code);
});
test('missing inventory is BLOCKED, not a fabricated empty deployment',()=>{
  blocked(assess({bridgeBindings:null}),'CURRENT_BINDING_INVENTORY_MISSING');
  blocked(assess({brainBindings:undefined}),'CURRENT_BINDING_INVENTORY_MISSING');
});
test('only one exact private service binding to existing Brain qualifies',()=>{
  const b=eligible().bridgeBindings;
  blocked(assess({bridgeBindings:b.filter(x=>x.name!=='BRAIN_PRIVATE')}),'PRIVATE_BRAIN_SERVICE_BINDING_NOT_VERIFIED');
  blocked(assess({bridgeBindings:[...b,{type:'service',name:'BRAIN_PRIVATE',service:'archelaos-brain-staging'}]}),'PRIVATE_BRAIN_SERVICE_BINDING_NOT_VERIFIED');
  blocked(assess({bridgeBindings:b.map(x=>x.name==='BRAIN_PRIVATE'?{type:'service',name:x.name,service:'wrong'}:x)}),'PRIVATE_BRAIN_SERVICE_BINDING_NOT_VERIFIED');
  blocked(assess({bridgeBindings:[...b,{type:'service',name:'ANOTHER_BRAIN',service:'archelaos-brain-staging'}]}),'UNREVIEWED_BRAIN_BINDING_ALIAS');
});
test('Bridge Durable Object and KV cannot be lost in a partial settings patch',()=>{
  blocked(assess({bridgeBindings:eligible().bridgeBindings.filter(x=>x.name!=='APPS_SCRIPT_COORDINATOR')}),'EXISTING_BRIDGE_RESOURCES_NOT_PRESERVED');
  blocked(assess({bridgeBindings:eligible().bridgeBindings.filter(x=>x.name!=='AUTH_KV')}),'EXISTING_BRIDGE_RESOURCES_NOT_PRESERVED');
});
test('key presence requires secret_text, not a lookalike plain binding',()=>{
  blocked(assess({bridgeBindings:eligible().bridgeBindings.map(x=>x.name==='BRAIN_APPS_SCRIPT_INTAKE_KEY'?{type:'plain_text',name:x.name}:x)}),'CALLER_APPS_SCRIPT_KEY_MISSING');
  blocked(assess({brainBindings:eligible().brainBindings.map(x=>x.name==='BRAIN_CAPABILITY_RECEIPT_KEY'?{type:'plain_text',name:x.name}:x)}),'BRAIN_RECEIPT_SIGNING_KEY_MISSING');
});
test('a different DO class is not the canonical Brain coordinator',()=>{
  blocked(assess({brainBindings:eligible().brainBindings.map(x=>x.name==='BRAIN'?{type:x.type,name:x.name,class_name:'WrongBrain'}:x)}),'CANONICAL_BRAIN_DO_MISSING');
});
test('a configured commit string alone does not attest executable bytes',()=>{
  blocked(assess({independentExecutableShaAttested:false}),'BRAIN_EXACT_EXECUTABLE_NOT_ATTESTED');
  blocked(assess({approvedBrainExecutableSha:'b'.repeat(40)}),'BRAIN_EXACT_EXECUTABLE_NOT_ATTESTED');
});
test('staging expiry must be future and no more than 60 minutes',()=>{
  blocked(assess({stagingExpiresAt:'1970-01-01T00:00:00Z'}),'STAGING_NOT_TIME_BOUNDED');
  blocked(assess({stagingExpiresAt:'2026-11-06T23:00:00Z'}),'STAGING_NOT_TIME_BOUNDED');
  blocked(assess({stagingExpiresAt:'not-a-time'}),'STAGING_NOT_TIME_BOUNDED');
});
test('OAuth source scope literal is not a verified granted runtime scope',()=>{
  blocked(assess({runtimeOAuthGrantVerified:false}),'GOOGLE_RUNTIME_SCOPE_NOT_VERIFIED');
  blocked(assess({oauthGrantedScopes:['https://www.googleapis.com/auth/userinfo.email']}),'GOOGLE_RUNTIME_SCOPE_NOT_VERIFIED');
  blocked(assess({oauthGrantedScopes:'https://www.googleapis.com/auth/script.projects'}),'GOOGLE_RUNTIME_SCOPE_NOT_VERIFIED');
});
test('source mount, Google readback and durable audit each independently block',()=>{
  blocked(assess({bridgeSourceMountVerified:false}),'BRIDGE_BRAIN_ADAPTER_NOT_MOUNTED');
  blocked(assess({googleProviderReadbackVerified:false}),'APPS_SCRIPT_PROVIDER_PROVENANCE_NOT_VERIFIED');
  blocked(assess({durableAuditVerified:false}),'DURABLE_AUDIT_NOT_VERIFIED');
});
test('source request key must be in different trust domain from Brain-signed receipts',()=>{
  blocked(assess({keysIndependentVerified:false}),'REQUEST_RECEIPT_TRUST_SEPARATION_NOT_VERIFIED');
});
test('Brain runtime capability and Google write lock require separate verification',()=>{
  blocked(assess({brainCapabilityContractAttested:false}),'BRAIN_CAPABILITY_RUNTIME_NOT_ATTESTED');
  blocked(assess({liveGoogleWritesDisabledVerified:false}),'GOOGLE_WRITE_LOCK_NOT_ATTESTED');
});
test('authorization flags must be actual booleans, not permissive truthy strings',()=>{
  for(const flag of ['bridgeOwnerApproved','brainOwnerApproved','operatorApproved']){
    for(const value of ['true',1,{},null]){
      const r=assess({[flag]:value});
      blocked(r,flag==='operatorApproved'?'OPERATOR_APPROVAL_MISSING':'OWNERS_APPROVAL_MISSING');
    }
  }
});
