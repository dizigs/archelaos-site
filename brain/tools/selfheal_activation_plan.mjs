// Offline deployment review packet only. No fetch, SDK, secret input or writes.
// Reuses existing private_hmac_candidate/protocol and existing durable ACK tests.
const SHA=/^[a-f0-9]{40}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const NAMES=Object.freeze({brain:'archelaos-brain-staging',healer:'archelaos-self-heal'});
const FLAGS=Object.freeze(['BRAIN_SELFHEAL_RECOVERY_ENABLED','BRAIN_SELFHEAL_DISPATCH_ENABLED',
  'BRAIN_SELFHEAL_BINDING_ATTESTED','BRAIN_SELFHEAL_DURABLE_ACK_ENABLED','HEALER_DURABLE_ACK_ENABLED']);
const doc='https://developers.cloudflare.com/workers/previews/resources/#limitations';
export function prepareSelfhealActivation(snapshot){
  if(!snapshot||!SHA.test(snapshot.sourceSha||'')||snapshot.sourceSha==='0'.repeat(40)||
    !['preview-pair','existing-workers-named-ports'].includes(snapshot.transport))
    throw Error('INVALID_ACTIVATION_SNAPSHOT');
  const pair=['brain','healer'].map(role=>{
    const item=snapshot[role];
    if(!item||item.worker!==NAMES[role]||!UUID.test(item.versionId||'')||
      !UUID.test(item.deploymentId||''))throw Error('WORKER_BASELINE_UNVERIFIED');
    return {role,worker:item.worker,versionId:item.versionId,deploymentId:item.deploymentId};
  });
  const blockers=[];
  if(snapshot.transport==='preview-pair')blockers.push('PREVIEW_BINDINGS_TARGET_PARENT_NOT_PEER_PREVIEW');
  if(FLAGS.some(name=>snapshot.operationalFlags?.[name]!=='false')||
    snapshot.stagingExpiresAt!=='1970-01-01T00:00:00Z')
    blockers.push('OPERATIONAL_OFF_BASELINE_NOT_VERIFIED');
  for(const [field,code] of [
    ['sourceSecurityReviewed','SOURCE_SECURITY_REVIEW_PENDING'],
    ['namedPortsInstalled','PRIVATE_NAMED_PORTS_NOT_INSTALLED'],
    ['deployedBytesAttested','EXACT_DEPLOYED_SOURCE_NOT_ATTESTED'],
    ['privateRunnerAttested','PRIVATE_RUNNER_NOT_ATTESTED'],
    ['bindingTargetsAttested','PRIVATE_BINDING_TARGETS_NOT_ATTESTED'],
    ['nonceNamespacesAttested','ISOLATED_NONCE_NAMESPACES_NOT_ATTESTED'],
    ['rollbackReviewed','ROLLBACK_REVIEW_PENDING']])
    if(snapshot[field]!==true)blockers.push(code);
  // Namespace IDs are metadata. Explicit disjointness must be checked even if
  // a reviewer incorrectly supplies nonceNamespacesAttested:true.
  const qa=snapshot.qaNonceNamespaceIds;
  const canonical=snapshot.canonicalNamespaceIds;
  if(!Array.isArray(qa)||qa.length!==2||!Array.isArray(canonical)||canonical.length!==2||
    ![...qa,...canonical].every(x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x))||
    new Set([...qa,...canonical]).size!==4)
    blockers.push('QA_CANONICAL_STORAGE_SEPARATION_UNVERIFIED');
  return Object.freeze({
    status:blockers.length?'BLOCKED_FOR_LIVE_ACTIVATION':'PREPARED_FOR_OPERATOR_REVIEW',
    liveActionAuthorized:false,sourceSha:snapshot.sourceSha,transport:snapshot.transport,
    blockers:Object.freeze(blockers),baseline:Object.freeze(pair),
    existingCode:Object.freeze([
      'brain/src/private_hmac_candidate.mjs','brain/src/private_hmac_protocol.mjs',
      'brain/test/private_hmac_acceptance.test.mjs','brain/test/selfheal_ack.test.mjs'
    ]),
    supportedProposal:Object.freeze({
      transport:'existing-workers-named-ports',newWorkers:0,newSchedulers:0,
      brainExport:'BrainHmacAcceptancePort',healerExport:'HealerHmacAcceptancePort',
      binding:{name:'HMAC_PEER',service:NAMES.healer,entrypoint:'HealerHmacAcceptancePort'},
      nonceClass:'PrivateHmacNonceStore',nonceBinding:'HMAC_NONCES',
      namespacePolicy:'isolated QA only; neither canonical namespace',
      maximumPermitMs:300000,secretPolicy:'retain sealed HEALER_EVENT_HMAC_KEY in each existing Worker; never copy/read',
      sourceFilesToReview:['brain/src/worker.mjs','automation/self-heal-worker/src/worker.mjs',
        'brain/wrangler.toml','automation/self-heal-worker/wrangler.toml']
    }),
    operationalFlags:Object.freeze(Object.fromEntries(FLAGS.map(name=>[name,'false']))),
    stagingExpiresAt:'1970-01-01T00:00:00Z',
    acceptanceOrder:Object.freeze(['freeze exact source/baselines','independent code/namespace/runner review',
      'deploy reviewed dormant named ports with permit OFF','private binding/namespace/key-lineage readback',
      'approve <=5 minute HMAC-only permit','one private challenge; never retry UNKNOWN',
      'revoke permit/remove temporary binding','baseline and zero-action readback',
      'separate durable ACK real-staging decision']),
    rollback:Object.freeze({revokePermitFirst:true,removeTemporaryBinding:true,restoreBaselines:pair,
      preserveCanonicalStorage:true,deleteCanonicalNamespaces:false,
      schemaRollback:'Version rollback does not reverse migrations. Preserve QA namespaces until reviewed retention cleanup.'}),
    notProven:Object.freeze(['live HMAC parity','production ACK/readback','automated recovery permission']),
    providerLimitation:doc
  });
}
