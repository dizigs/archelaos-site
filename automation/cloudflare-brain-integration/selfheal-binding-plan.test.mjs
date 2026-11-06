import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessSelfHealStagingBindings, REQUIRED_PRIVATE_LINKS } from './selfheal-binding-plan.mjs';

const NOW = Date.parse('2026-11-06T11:00:00Z');
const sha = 'a'.repeat(40);
const binding = (name, type, extras = {}) => ({name,type,...extras});
const env = (name, text) => binding(name, 'plain_text', {text});
const key = name => binding(name,'secret_text');
function fixture() {
  return {
    brainBindings: [
      binding('BRAIN','durable_object_namespace',{class_name:'BrainCoordinator'}),
      {...REQUIRED_PRIVATE_LINKS.brainToSelfHeal},
      key('HEALER_EVENT_HMAC_KEY'), key('BRAIN_GITHUB_READ_TOKEN'),
      env('ENVIRONMENT','staging'), env('DEPLOY_SHA',sha),
      env('BRAIN_SELFHEAL_APPROVED_SHA',sha),
      env('BRAIN_SELFHEAL_RECOVERY_ENABLED','true'),
      env('BRAIN_SELFHEAL_BINDING_ATTESTED','true'),
      env('STAGING_EXPIRES_AT',new Date(NOW + 30*60000).toISOString())
    ],
    healerBindings: [
      binding('HEALER_MEMORY','durable_object_namespace',{class_name:'HealerMemory'}),
      {...REQUIRED_PRIVATE_LINKS.selfHealToBrain}, key('HEALER_EVENT_HMAC_KEY')
    ],
    now:NOW, attestedBrainSha:sha, brainSourceBytesAttested:true,
    healerSourceBytesAttested:true,brainOwnerApproved:true,
    healerOwnerApproved:true,cloudflareOperatorApproved:true,
    recoveryContractReviewed:true,providerEvidenceScopeReviewed:true,
    sameSealedHmacVerified:true,aiDisabledVerified:true,
    repairWritesDisabledVerified:true,rollbackProved:true,
    brainPublicRoutes:0,healerPublicRoutes:0,
    brainCronTriggers:0,healerCronTriggers:0
  };
}

test('observed old Cloudflare settings are hard BLOCKED; no synthetic connected claim', () => {
  const result=assessSelfHealStagingBindings({
    brainBindings:[
      binding('BRAIN','durable_object_namespace',{class_name:'BrainCoordinator'}),
      env('ENVIRONMENT','staging'),env('DEPLOY_SHA','d3d13b605f409bfda6f372742d629fd8eaf12145'),
      env('STAGING_EXPIRES_AT','1970-01-01T00:00:00Z')
    ],
    healerBindings:[binding('HEALER_MEMORY','durable_object_namespace',{class_name:'HealerMemory'})],
    now:NOW
  });
  assert.equal(result.status,'BLOCKED');
  for (const blocker of ['BRAIN_HEALER_BINDING_MISSING','HEALER_BRAIN_RECOVERY_BINDING_MISSING',
    'SIGNED_DELIVERY_KEY_METADATA_MISSING','EXACT_RELEASE_PROVENANCE_UNVERIFIED',
    'BOUNDED_STAGING_EXPIRY_UNVERIFIED']) assert.ok(result.blockers.includes(blocker));
  assert.equal(result.verifiedConnectivity,false);
  assert.equal(result.automationEnabled,false);
});

test('all reviewed metadata still only means READY_FOR_STAGING_REVIEW, not CONNECTED', () => {
  const p=assessSelfHealStagingBindings(fixture());
  assert.deepEqual(p.blockers,[]);
  assert.equal(p.status,'READY_FOR_STAGING_REVIEW');
  assert.equal(p.verifiedConnectivity,false);
  assert.equal(p.e2eProved,false);
  assert.equal(p.automationEnabled,false);
  assert.ok(Object.isFrozen(p));
});

test('named entrypoint cannot be omitted or substituted by public fetch default', () => {
  for (const entrypoint of [undefined,'default','BrainCoordinator','OtherPort']) {
    const f=fixture();
    f.healerBindings[1]={name:'BRAIN_RECOVERY',type:'service',service:'archelaos-brain-staging'};
    if (entrypoint !== undefined) f.healerBindings[1].entrypoint=entrypoint;
    assert.ok(assessSelfHealStagingBindings(f).blockers.includes('HEALER_BRAIN_RECOVERY_BINDING_CONFLICT'));
  }
});

test('conflicting or duplicated binding names are never treated as proof', () => {
  const f=fixture();
  f.brainBindings.push({...REQUIRED_PRIVATE_LINKS.brainToSelfHeal});
  assert.ok(assessSelfHealStagingBindings(f).blockers.includes('BRAIN_HEALER_BINDING_CONFLICT'));
  const g=fixture();
  g.healerBindings[1].service='public-brain';
  assert.ok(assessSelfHealStagingBindings(g).blockers.includes('HEALER_BRAIN_RECOVERY_BINDING_CONFLICT'));
});

test('flags alone never override expired staging, wrong SHA or missing proof', () => {
  for (const change of [
    f=>{f.brainBindings.find(b=>b.name==='STAGING_EXPIRES_AT').text='1970-01-01T00:00:00Z';},
    f=>{f.brainBindings.find(b=>b.name==='STAGING_EXPIRES_AT').text=new Date(NOW + 2*3600000).toISOString();},
    f=>{f.brainBindings.find(b=>b.name==='DEPLOY_SHA').text='b'.repeat(40);},
    f=>{f.sameSealedHmacVerified=false;},
    f=>{f.brainSourceBytesAttested=false;},
    f=>{f.healerOwnerApproved=false;},
    f=>{f.brainPublicRoutes=1;},
    f=>{f.healerCronTriggers=1;},
    f=>{f.aiDisabledVerified=false;},
    f=>{f.rollbackProved=false;}
  ]) {const f=fixture();change(f);assert.equal(assessSelfHealStagingBindings(f).status,'BLOCKED');}
});

test('no inventory/unknown values fail closed; input objects are not mutated',()=>{
  const f=fixture();const snapshot=JSON.stringify(f);
  assert.equal(assessSelfHealStagingBindings().status,'BLOCKED');
  assert.equal(assessSelfHealStagingBindings({}).status,'BLOCKED');
  assert.equal(assessSelfHealStagingBindings(f).status,'READY_FOR_STAGING_REVIEW');
  assert.equal(JSON.stringify(f),snapshot);
});
