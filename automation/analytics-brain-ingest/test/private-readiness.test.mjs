import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAnalyticsBrainReadiness} from '../src/private-readiness.mjs';
const sha40='a'.repeat(40);
const sha64='b'.repeat(64);
const now=Date.parse('2026-11-07T09:00:00Z');
const fixture=()=>({
  artifactSource:'google_bundle',
  githubArtifact:{repository:'dizigs/archelaos-site',
    workflowPath:'.github/workflows/google-analytics-aggregate.yml',
    artifactName:'google-search-ga4-private-report',runStatus:'completed',
    runConclusion:'success',zipSha256:'sha256:'+sha64,
    extractedJsonSha256:sha64,runId:123,artifactId:456,
    runSha:sha40,artifactExpired:false},
  authorizedGithubReadbackAttested:true,
  zipAndJsonDigestsIndependentlyVerified:true,
  aggregateSchemaAndConsentReviewed:true,
  noVisitorLevelDataAttested:true,
  minCohortPolicyAttested:true,
  gscImpressionsNotClaimedAnonymity:true,
  clarityRollingPeriodNotSummed:true,
  callingRuntime:'cloudflare_worker',
  callingWorker:'archelaos-analytics',
  installedWorkerAttested:true,
  approvedExecutableShaAttested:true,
  callerBindings:[
    {name:'BRAIN_PRIVATE',type:'service',service:'archelaos-brain-staging'},
    {name:'BRAIN_ANALYTICS_INTAKE_KEY',type:'secret_text'},
    {name:'BRAIN_CAPABILITY_RECEIPT_KEY',type:'secret_text'},
    {name:'ANALYTICS_ENABLED',type:'plain_text',text:'false'}
  ],
  brainBindings:[
    {name:'BRAIN',type:'durable_object_namespace',class_name:'BrainCoordinator'},
    {name:'BRAIN_ANALYTICS_INTAKE_KEY',type:'secret_text'},
    {name:'BRAIN_CAPABILITY_RECEIPT_KEY',type:'secret_text'}
  ],
  nowMs:now,stagingExpiresAt:'2026-11-07T09:30:00Z',
  configuredBrainSha:sha40,approvedBrainSha:sha40,
  brainExecutableBytesIndependentlyAttested:true,
  privateCapabilityImplementationAttested:true,
  privateReceiptDomainSeparatedAttested:true,
  bindingIsNotPublicFallbackAttested:true,
  shortLivedRepoScopedTransferAttested:true,
  transferPayloadIsAggregateOnlyAttested:true,
  canonicalSnapshotUpsertAttested:true,
  independentSignedAckReadbackAttested:true,
  unknownNeverAutoRetriedAttested:true,
  analyticsSourceOwnerApproved:true,brainOwnerApproved:true,
  releaseOperatorApproved:true
});
const assess=override=>assessAnalyticsBrainReadiness({...fixture(),...override});
function denies(result,reason) {
  assert.equal(result.status,'BLOCKED');
  assert.ok(result.blockers.includes(reason),JSON.stringify(result.blockers));
  assert.equal(result.connected,false);
  assert.equal(result.remoteE2EVerified,false);
  assert.equal(result.anyDataDelivered,false);
  assert.equal(result.privateArtifactsAccessed,false);
  assert.equal(result.deploymentAuthorized,false);
  assert.equal(result.aiSpendingAuthorized,false);
}
test('synthetic readiness is only for OWNER review, never a connected Worker',()=>{
  const x=assess({});
  assert.equal(x.status,'READY_FOR_OWNER_PRIVATE_STAGING_REVIEW');
  assert.deepEqual(x.blockers,[]);
  assert.equal(x.onlyCandidate,'archelaos-analytics');
  assert.deepEqual(x.approvedArtifactSources,['google_bundle','clarity']);
  assert.deepEqual(x.proposedBinding,{type:'service',name:'BRAIN_PRIVATE',service:'archelaos-brain-staging'});
  assert.equal(x.connected,false);
  assert.equal(x.deploymentAuthorized,false);
});
test('real Cloudflare nine-script inventory: no installed analytics Worker or binding/keys; staging expired',()=>{
  const x=assess({
    callingRuntime:'node',
    installedWorkerAttested:false,
    approvedExecutableShaAttested:false,
    callerBindings:null,
    brainBindings:[{name:'BRAIN',type:'durable_object_namespace',class_name:'BrainCoordinator'},
      {name:'HEALER',type:'service',service:'archelaos-self-heal'}],
    configuredBrainSha:'5c5401d57fda3a3d1a815c48b43f55a2741a8ded',
    stagingExpiresAt:'1970-01-01T00:00:00Z',
    brainExecutableBytesIndependentlyAttested:false
  });
  for(const reason of ['PRIVATE_WORKER_CALLER_NOT_INSTALLED_OR_ATTESTED','CURRENT_BINDING_INVENTORY_MISSING',
    'BRAIN_ANALYTICS_INTAKE_SECRET_MISSING','BRAIN_RECEIPT_SIGNER_MISSING',
    'BRAIN_STAGING_EXPIRED_OR_UNBOUNDED','BRAIN_EXECUTABLE_VERSION_UNVERIFIED'])
    denies(x,reason);
});
test('Node GitHub artifact reader cannot impersonate a Cloudflare Worker with native Service Binding',()=>{
  denies(assess({callingRuntime:'node'}),'PRIVATE_WORKER_CALLER_NOT_INSTALLED_OR_ATTESTED');
  denies(assess({callingRuntime:'github_actions'}),'PRIVATE_WORKER_CALLER_NOT_INSTALLED_OR_ATTESTED');
  denies(assess({callingWorker:'archelaos-automation-bridge'}),'PRIVATE_WORKER_CALLER_NOT_INSTALLED_OR_ATTESTED');
  denies(assess({installedWorkerAttested:false}),'PRIVATE_WORKER_CALLER_NOT_INSTALLED_OR_ATTESTED');
});
test('GitHub run and artifact MUST match one of two pinned private export workflows',()=>{
  const old=fixture().githubArtifact;
  for(const bad of [
    {repository:'attacker/repo'}, {workflowPath:'.github/workflows/other.yml'},
    {artifactName:'untrusted-report'},{runStatus:'in_progress'},
    {runConclusion:'failure'},{artifactExpired:true},
    {zipSha256:'0'.repeat(64)},{extractedJsonSha256:'bad'},
    {runSha:'main'},{runId:0},{artifactId:-1}
  ]) denies(assess({githubArtifact:{...old,...bad}}),'TRUSTED_ARTIFACT_SOURCE_REQUIRED');
  denies(assess({artifactSource:'google_ads'}),'TRUSTED_ARTIFACT_SOURCE_REQUIRED');
  denies(assess({artifactSource:'clarity'}),'TRUSTED_ARTIFACT_SOURCE_REQUIRED');
  const clarity=assess({artifactSource:'clarity',githubArtifact:{...old,
    workflowPath:'.github/workflows/clarity-daily-export.yml',
    artifactName:'clarity-private-aggregate-report'}});
  assert.equal(clarity.status,'READY_FOR_OWNER_PRIVATE_STAGING_REVIEW');
});
test('independently downloaded authentic ZIP+JSON bytes mandatory, never inferred from metadata',()=>{
  denies(assess({authorizedGithubReadbackAttested:false}),'PRIVATE_ARTIFACT_BYTES_NOT_INDEPENDENTLY_VERIFIED');
  denies(assess({zipAndJsonDigestsIndependentlyVerified:false}),'PRIVATE_ARTIFACT_BYTES_NOT_INDEPENDENTLY_VERIFIED');
});
test('privacy gates block low sample, unreviewed consent, GSC falsely presented as k-anonymous, summed Clarity',()=>{
  for(const key of ['aggregateSchemaAndConsentReviewed','noVisitorLevelDataAttested',
    'minCohortPolicyAttested','gscImpressionsNotClaimedAnonymity',
    'clarityRollingPeriodNotSummed'])
    denies(assess({[key]:false}),'METRIC_PRIVACY_REVIEW_MISSING');
});
test('caller needs a unique native private service binding, NOT an arbitrary HTTP URL or alias',()=>{
  const base=fixture().callerBindings;
  denies(assess({callerBindings:base.filter(b=>b.name!=='BRAIN_PRIVATE')}),'PRIVATE_SERVICE_BINDING_NOT_VERIFIED');
  denies(assess({callerBindings:[...base,{name:'BRAIN_PRIVATE',type:'service',service:'archelaos-brain-staging'}]}),'PRIVATE_SERVICE_BINDING_NOT_VERIFIED');
  denies(assess({callerBindings:base.map(b=>b.name==='BRAIN_PRIVATE'?{...b,service:'bad'}:b)}),'PRIVATE_SERVICE_BINDING_NOT_VERIFIED');
  denies(assess({callerBindings:[...base,{name:'SECOND_BRAIN',type:'service',service:'archelaos-brain-staging'}]}),'PRIVATE_SERVICE_BINDING_NOT_VERIFIED');
});
test('missing or plain-text secrets do not qualify as HMAC or independent receipt verifier',()=>{
  const base=fixture().callerBindings;
  denies(assess({callerBindings:base.filter(b=>b.name!=='BRAIN_ANALYTICS_INTAKE_KEY')}),'CALLER_ANALYTICS_INTAKE_SECRET_MISSING');
  denies(assess({callerBindings:base.map(b=>b.name==='BRAIN_CAPABILITY_RECEIPT_KEY'?{...b,type:'plain_text'}:b)}),'CALLER_RECEIPT_VERIFIER_MISSING');
  const brain=fixture().brainBindings;
  denies(assess({brainBindings:brain.filter(b=>b.name!=='BRAIN_ANALYTICS_INTAKE_KEY')}),'BRAIN_ANALYTICS_INTAKE_SECRET_MISSING');
  denies(assess({brainBindings:brain.filter(b=>b.name!=='BRAIN_CAPABILITY_RECEIPT_KEY')}),'BRAIN_RECEIPT_SIGNER_MISSING');
});
test('the existing canonical Brain DO class is immutable for the design',()=>{
  denies(assess({brainBindings:fixture().brainBindings.map(b=>b.name==='BRAIN'?{...b,class_name:'OtherBrain'}:b)}),'CANONICAL_BRAIN_DO_MISSING');
});
test('analytics code-only candidate remains disabled by literal exact flag false',()=>{
  denies(assess({callerBindings:fixture().callerBindings.map(b=>b.name==='ANALYTICS_ENABLED'?{...b,text:'true'}:b)}),'CALLER_ANALYTICS_DISABLED_FLAG_MISSING');
  denies(assess({callerBindings:fixture().callerBindings.filter(b=>b.name!=='ANALYTICS_ENABLED')}),'CALLER_ANALYTICS_DISABLED_FLAG_MISSING');
});
test('staging deployment identity is NOT proven by configured SHA string or a long expiry',()=>{
  denies(assess({brainExecutableBytesIndependentlyAttested:false}),'BRAIN_EXECUTABLE_VERSION_UNVERIFIED');
  denies(assess({approvedBrainSha:'c'.repeat(40)}),'BRAIN_EXECUTABLE_VERSION_UNVERIFIED');
  denies(assess({stagingExpiresAt:'1970-01-01T00:00:00Z'}),'BRAIN_STAGING_EXPIRED_OR_UNBOUNDED');
  denies(assess({stagingExpiresAt:'2026-11-07T11:30:00Z'}),'BRAIN_STAGING_EXPIRED_OR_UNBOUNDED');
});
test('capability transport authenticity, key separation and private ingress are independent gates',()=>{
  for(const field of ['privateCapabilityImplementationAttested',
    'privateReceiptDomainSeparatedAttested','bindingIsNotPublicFallbackAttested'])
    denies(assess({[field]:false}),'NATIVE_PRIVATE_CAPABILITY_NOT_ATTESTED');
});
test('unapproved private GitHub-to-Cloudflare handoff is never authorized by Node artifact success',()=>{
  denies(assess({shortLivedRepoScopedTransferAttested:false}),'GITHUB_TO_PRIVATE_WORKER_TRANSFER_UNVERIFIED');
  denies(assess({transferPayloadIsAggregateOnlyAttested:false}),'GITHUB_TO_PRIVATE_WORKER_TRANSFER_UNVERIFIED');
});
test('durable snapshot UPSERT, signed readback and UNKNOWN reconciliation all required',()=>{
  for(const field of ['canonicalSnapshotUpsertAttested',
    'independentSignedAckReadbackAttested','unknownNeverAutoRetriedAttested'])
    denies(assess({[field]:false}),'CANONICAL_UPSERT_AND_SIGNED_READBACK_UNVERIFIED');
});
test('owner/operator approvals must be real booleans',()=>{
  for(const field of ['analyticsSourceOwnerApproved','brainOwnerApproved','releaseOperatorApproved']) {
    for(const value of ['true',1,{},null])
      denies(assess({[field]:value}),'SOURCE_RUNTIME_AND_OWNER_APPROVAL_MISSING');
  }
});
