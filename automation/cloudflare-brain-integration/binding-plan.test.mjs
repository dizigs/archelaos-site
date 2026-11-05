import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBinding } from './binding-plan.mjs';
const SHA = 'a'.repeat(40);
const base = () => ({
  caller: 'archelaos-automation-bridge', callerBindings: [],
  brainBindings: [{ type: 'durable_object_namespace', name: 'BRAIN' }, {type:'secret_text', name:'STAGING_INTAKE_KEY'}],
  deployedBrainSha: SHA, approvedBrainSha: SHA,
  stagingExpiresAt: '2026-11-06T00:00:00Z', now: Date.parse('2026-11-05T12:00:00Z'),
  scopedIdentityApproved: true, provenanceApproved: true, durableAuditApproved: true, ownerApproved: true
});
test('approved callers only; no second Brain or public URL', () => {
  const blocked = assessBinding({...base(), caller:'archelaos-raisely-bridge'});
  assert.deepEqual(blocked.blockers,['CALLER_NOT_APPROVED']);
  assert.equal(blocked.proposedBinding,null);
  assert.deepEqual(assessBinding(base()).proposedBinding,{type:'service',name:'BRAIN_PRIVATE',service:'archelaos-brain-staging'});
});
test('actual expired and missing-key configuration blocks a proposal', () => {
  const result = assessBinding({...base(),brainBindings:[{type:'durable_object_namespace',name:'BRAIN'}],stagingExpiresAt:'1970-01-01T00:00:00Z'});
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.blockers.includes('BRAIN_INTAKE_SECRET_ABSENT'));
  assert.ok(result.blockers.includes('STAGING_EXPIRED'));
});
test('misaligned Brain SHA fails closed', () => {
  assert.ok(assessBinding({...base(), approvedBrainSha:'b'.repeat(40)}).blockers.includes('BRAIN_SHA_NOT_PINNED'));
  assert.ok(assessBinding({...base(), deployedBrainSha:null}).blockers.includes('BRAIN_SHA_NOT_PINNED'));
});
test('no silent overwrite of existing conflicting binding', () => {
  const result = assessBinding({...base(),callerBindings:[{type:'kv_namespace',name:'BRAIN_PRIVATE'}]});
  assert.ok(result.blockers.includes('BINDING_NAME_CONFLICT'));
});
test('unreviewed alias to target is rejected',()=>{
  const result=assessBinding({...base(),callerBindings:[{type:'service',name:'OTHER_BRAIN',service:'archelaos-brain-staging'}]});
  assert.ok(result.blockers.includes('UNREVIEWED_EXISTING_BRAIN_BINDING'));
});
test('no inventory, durable object or approvals means blocked', () => {
  const result=assessBinding({...base(),callerBindings:null,brainBindings:[],scopedIdentityApproved:false,provenanceApproved:false,durableAuditApproved:false,ownerApproved:false});
  assert.equal(result.status,'BLOCKED');
  for(const reason of ['INVENTORY_MISSING','CANONICAL_DO_MISSING','BRAIN_INTAKE_SECRET_ABSENT','SOURCE_IDENTITY_CONTRACT_UNAPPROVED','SOURCE_PROVENANCE_UNVERIFIED','DURABLE_AUDIT_UNVERIFIED','EXPLICIT_OWNER_APPROVAL_MISSING']) assert.ok(result.blockers.includes(reason));
});
test('already present exact native binding is merely observed, never CONNECTED',()=>{
  const result=assessBinding({...base(),callerBindings:[{type:'service',name:'BRAIN_PRIVATE',service:'archelaos-brain-staging'}]});
  assert.equal(result.status,'READY_FOR_OWNER_REVIEW');
  assert.equal(result.bindingObserved,true);
  assert.equal(Object.hasOwn(result,'connected'),false);
});
test('valid config is never declared deployed or tested', () => {
  const result=assessBinding(base());
  assert.equal(result.status,'READY_FOR_OWNER_REVIEW');
  assert.equal(result.bindingObserved,false);
  assert.equal(Object.hasOwn(result,'tested'),false);
});
test('Librarian source scope excludes gmail', () => {
  const result=assessBinding({...base(),caller:'archelaos-librarian-staging'});
  assert.deepEqual(result.approvedSources,['drive','news']);
});
