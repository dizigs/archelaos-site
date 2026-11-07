import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareSelfhealActivation} from '../tools/selfheal_activation_plan.mjs';
const flags=()=>Object.fromEntries(['BRAIN_SELFHEAL_RECOVERY_ENABLED','BRAIN_SELFHEAL_DISPATCH_ENABLED',
 'BRAIN_SELFHEAL_BINDING_ATTESTED','BRAIN_SELFHEAL_DURABLE_ACK_ENABLED','HEALER_DURABLE_ACK_ENABLED'].map(k=>[k,'false']));
const baseline=()=>({
 sourceSha:'a1d7a7fffb335eb1e396b7eccd5935ee3d6f4da6',transport:'existing-workers-named-ports',
 brain:{worker:'archelaos-brain-staging',versionId:'e565910f-bbb4-44f6-b0b5-3463906ce495',
 deploymentId:'bac07481-10c6-4c82-8251-8dfb2ce8a0a6'},
 healer:{worker:'archelaos-self-heal',versionId:'65b729ea-c5c2-4118-8632-9d37e615d0cb',
 deploymentId:'f4ee7e96-c0dd-43d3-bd0b-8034c2db55c8'},
 operationalFlags:flags(),stagingExpiresAt:'1970-01-01T00:00:00Z'
});
const reviewed=()=>({...baseline(),sourceSecurityReviewed:true,namedPortsInstalled:true,
 deployedBytesAttested:true,privateRunnerAttested:true,bindingTargetsAttested:true,
 nonceNamespacesAttested:true,rollbackReviewed:true,
 qaNonceNamespaceIds:['1'.repeat(32),'2'.repeat(32)],
 canonicalNamespaceIds:['3'.repeat(32),'4'.repeat(32)]});
test('preview-pair is blocked even if all metadata/approvals look successful',()=>{
 const p=prepareSelfhealActivation({...reviewed(),transport:'preview-pair'});
 assert.equal(p.status,'BLOCKED_FOR_LIVE_ACTIVATION');
 assert.ok(p.blockers.includes('PREVIEW_BINDINGS_TARGET_PARENT_NOT_PEER_PREVIEW'));
 assert.equal(p.liveActionAuthorized,false);
});
test('missing deployed ports and private runner stay explicit blockers, not implicit readiness',()=>{
 const p=prepareSelfhealActivation(baseline());
 for(const code of ['PRIVATE_NAMED_PORTS_NOT_INSTALLED','PRIVATE_RUNNER_NOT_ATTESTED',
 'EXACT_DEPLOYED_SOURCE_NOT_ATTESTED','QA_CANONICAL_STORAGE_SEPARATION_UNVERIFIED'])
 assert.ok(p.blockers.includes(code));
 assert.equal(p.supportedProposal.newWorkers,0);assert.equal(p.supportedProposal.newSchedulers,0);
 assert.ok(p.existingCode.includes('brain/src/private_hmac_candidate.mjs'));
});
test('even complete evidence generates only an operator review packet, never live permission',()=>{
 const p=prepareSelfhealActivation(reviewed());
 assert.equal(p.status,'PREPARED_FOR_OPERATOR_REVIEW');assert.equal(p.liveActionAuthorized,false);
 assert.equal(p.supportedProposal.binding.entrypoint,'HealerHmacAcceptancePort');
 assert.equal(p.supportedProposal.maximumPermitMs,300000);
 assert.ok(Object.values(p.operationalFlags).every(x=>x==='false'));
 assert.equal(p.stagingExpiresAt,'1970-01-01T00:00:00Z');
});
test('namespace aliasing/collision cannot be approved by a metadata boolean',()=>{
 const b=reviewed();
 for(const qaNonceNamespaceIds of [b.canonicalNamespaceIds,['1'.repeat(32),'1'.repeat(32)],
 ['1'.repeat(32)],['not-a-namespace','2'.repeat(32)]])
 assert.ok(prepareSelfhealActivation({...b,qaNonceNamespaceIds}).blockers.includes('QA_CANONICAL_STORAGE_SEPARATION_UNVERIFIED'));
});
test('any active or unknown operational flag/expiry blocks the HMAC-only plan',()=>{
 const b=reviewed();
 for(const name of Object.keys(b.operationalFlags))
 for(const value of ['true',true,undefined])
 assert.ok(prepareSelfhealActivation({...b,operationalFlags:{...b.operationalFlags,[name]:value}})
 .blockers.includes('OPERATIONAL_OFF_BASELINE_NOT_VERIFIED'));
 assert.ok(prepareSelfhealActivation({...b,stagingExpiresAt:'2099-01-01T00:00:00Z'})
 .blockers.includes('OPERATIONAL_OFF_BASELINE_NOT_VERIFIED'));
});
test('wrong source pins and Worker identities cannot select a production substitute',()=>{
 assert.throws(()=>prepareSelfhealActivation({...baseline(),sourceSha:'0'.repeat(40)}));
 assert.throws(()=>prepareSelfhealActivation({...baseline(),transport:'public-http'}));
 assert.throws(()=>prepareSelfhealActivation({...baseline(),healer:{...baseline().healer,worker:'unrelated-worker'}}));
});
test('rollback retains canonical storage and acknowledges irreversible migration state',()=>{
 const p=prepareSelfhealActivation(reviewed());
 assert.equal(p.rollback.revokePermitFirst,true);assert.equal(p.rollback.deleteCanonicalNamespaces,false);
 assert.equal(p.rollback.preserveCanonicalStorage,true);assert.match(p.rollback.schemaRollback,/does not reverse migrations/);
 assert.equal(p.rollback.restoreBaselines[0].versionId,baseline().brain.versionId);
});
