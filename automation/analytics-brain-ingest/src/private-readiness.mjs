/**
 * Pure, read-only operator gate for a FUTURE private Analytics → Brain handoff.
 *
 * GitHub Actions artifacts are read by Node (github-artifacts.mjs). A Node job
 * CANNOT directly call a native Cloudflare Worker Service Binding. This
 * preflight requires a separately installed and owner-approved Cloudflare
 * caller before proposing any private Brain handoff; never silently turn a
 * GitHub workflow or public URL into a privileged private caller.
 *
 * This module authorizes no Cloudflare mutation, source read, AI call or
 * Analytics/Brain write, even when a synthetic fixture satisfies every gate.
 */
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const TARGET='archelaos-brain-staging';
const BINDING='BRAIN_PRIVATE';
const CANDIDATE='archelaos-analytics';
const artifactSources=Object.freeze({
  google_bundle:Object.freeze({
    workflowPath:'.github/workflows/google-analytics-aggregate.yml',
    artifactName:'google-search-ga4-private-report'
  }),
  clarity:Object.freeze({
    workflowPath:'.github/workflows/clarity-daily-export.yml',
    artifactName:'clarity-private-aggregate-report'
  })
});
const expectedBinding=Object.freeze({type:'service',name:BINDING,service:TARGET});
const hasBinding=(list,name,type,extra={})=>
  list.filter(x=>x?.name===name).length===1 &&
  list.some(x=>x?.name===name && x.type===type &&
    Object.entries(extra).every(([k,v])=>x[k]===v));
const block=(arr,name,ok)=>{if(!ok)arr.push(name);};

export function assessAnalyticsBrainReadiness(evidence={}) {
  const blockers=[];
  const source=artifactSources[evidence.artifactSource];
  const workflow=evidence.githubArtifact;
  block(blockers,'TRUSTED_ARTIFACT_SOURCE_REQUIRED',Boolean(source&&workflow&&
    workflow.repository==='dizigs/archelaos-site' &&
    workflow.workflowPath===source.workflowPath &&
    workflow.artifactName===source.artifactName &&
    workflow.runStatus==='completed' &&
    workflow.runConclusion==='success' &&
    /^sha256:[a-f0-9]{64}$/.test(workflow.zipSha256||'') &&
    SHA64.test(workflow.extractedJsonSha256||'') &&
    Number.isSafeInteger(workflow.runId) && workflow.runId>0 &&
    Number.isSafeInteger(workflow.artifactId) && workflow.artifactId>0 &&
    SHA40.test(workflow.runSha||'') &&
    workflow.artifactExpired===false));
  block(blockers,'PRIVATE_ARTIFACT_BYTES_NOT_INDEPENDENTLY_VERIFIED',
    evidence.authorizedGithubReadbackAttested===true &&
    evidence.zipAndJsonDigestsIndependentlyVerified===true);
  block(blockers,'METRIC_PRIVACY_REVIEW_MISSING',
    evidence.aggregateSchemaAndConsentReviewed===true &&
    evidence.noVisitorLevelDataAttested===true &&
    evidence.minCohortPolicyAttested===true &&
    evidence.gscImpressionsNotClaimedAnonymity===true &&
    evidence.clarityRollingPeriodNotSummed===true);

  // Not all pure JS source adapters are deployed Workers; the current
  // analytics Worker is *code-only* and has no installed Cloudflare binding.
  block(blockers,'PRIVATE_WORKER_CALLER_NOT_INSTALLED_OR_ATTESTED',
    evidence.callingRuntime==='cloudflare_worker' &&
    evidence.callingWorker===CANDIDATE &&
    evidence.installedWorkerAttested===true &&
    evidence.approvedExecutableShaAttested===true);
  const caller=Array.isArray(evidence.callerBindings)?evidence.callerBindings:null;
  const brain=Array.isArray(evidence.brainBindings)?evidence.brainBindings:null;
  if(!caller||!brain)blockers.push('CURRENT_BINDING_INVENTORY_MISSING');
  if(caller) {
    block(blockers,'PRIVATE_SERVICE_BINDING_NOT_VERIFIED',
      hasBinding(caller,BINDING,'service',{service:TARGET}) &&
      !caller.some(x=>x?.type==='service'&&x.service===TARGET&&x.name!==BINDING));
    block(blockers,'CALLER_ANALYTICS_INTAKE_SECRET_MISSING',
      hasBinding(caller,'BRAIN_ANALYTICS_INTAKE_KEY','secret_text'));
    block(blockers,'CALLER_RECEIPT_VERIFIER_MISSING',
      hasBinding(caller,'BRAIN_CAPABILITY_RECEIPT_KEY','secret_text'));
    block(blockers,'CALLER_ANALYTICS_DISABLED_FLAG_MISSING',
      hasBinding(caller,'ANALYTICS_ENABLED','plain_text',{text:'false'}));
  }
  if(brain) {
    block(blockers,'CANONICAL_BRAIN_DO_MISSING',
      hasBinding(brain,'BRAIN','durable_object_namespace',{class_name:'BrainCoordinator'}));
    block(blockers,'BRAIN_ANALYTICS_INTAKE_SECRET_MISSING',
      hasBinding(brain,'BRAIN_ANALYTICS_INTAKE_KEY','secret_text'));
    block(blockers,'BRAIN_RECEIPT_SIGNER_MISSING',
      hasBinding(brain,'BRAIN_CAPABILITY_RECEIPT_KEY','secret_text'));
  }
  const now=evidence.nowMs,expiry=evidence.stagingExpiresAt;
  block(blockers,'BRAIN_STAGING_EXPIRED_OR_UNBOUNDED',
    Number.isSafeInteger(now) && typeof expiry==='string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(expiry) &&
    Number.isFinite(Date.parse(expiry))&&
    Date.parse(expiry)>now&&Date.parse(expiry)<=now+3600000);
  block(blockers,'BRAIN_EXECUTABLE_VERSION_UNVERIFIED',
    SHA40.test(evidence.configuredBrainSha||'') &&
    evidence.configuredBrainSha===evidence.approvedBrainSha &&
    evidence.brainExecutableBytesIndependentlyAttested===true);
  block(blockers,'NATIVE_PRIVATE_CAPABILITY_NOT_ATTESTED',
    evidence.privateCapabilityImplementationAttested===true &&
    evidence.privateReceiptDomainSeparatedAttested===true &&
    evidence.bindingIsNotPublicFallbackAttested===true);
  block(blockers,'GITHUB_TO_PRIVATE_WORKER_TRANSFER_UNVERIFIED',
    evidence.shortLivedRepoScopedTransferAttested===true &&
    evidence.transferPayloadIsAggregateOnlyAttested===true);
  block(blockers,'CANONICAL_UPSERT_AND_SIGNED_READBACK_UNVERIFIED',
    evidence.canonicalSnapshotUpsertAttested===true &&
    evidence.independentSignedAckReadbackAttested===true &&
    evidence.unknownNeverAutoRetriedAttested===true);
  block(blockers,'SOURCE_RUNTIME_AND_OWNER_APPROVAL_MISSING',
    evidence.analyticsSourceOwnerApproved===true &&
    evidence.brainOwnerApproved===true &&
    evidence.releaseOperatorApproved===true);
  return Object.freeze({
    status:blockers.length?'BLOCKED':'READY_FOR_OWNER_PRIVATE_STAGING_REVIEW',
    blockers:Object.freeze(blockers),
    onlyCandidate:CANDIDATE,
    approvedArtifactSources:Object.freeze(Object.keys(artifactSources)),
    proposedBinding:expectedBinding,
    connected:false,
    remoteE2EVerified:false,
    anyDataDelivered:false,
    privateArtifactsAccessed:false,
    aiSpendingAuthorized:false,
    deploymentAuthorized:false
  });
}
