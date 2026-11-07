import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTask, validateTrustedBrainClaim, buildSessionRequest } from './policy.mjs';
import { submitAuthorizedReview } from './transport.mjs';

const task = Object.freeze({
  taskId: '11111111-1111-4111-8111-111111111111',
  repository: 'dizigs/archelaos-site',
  commitSha: 'a'.repeat(40),
  taskClass: 'REVIEW',
  allowedPaths: ['automation/agent-kit/cli.mjs'],
  instruction: 'Review this source excerpt and suggest safe tests.',
  sourceExcerpt: 'export const ready = false;',
});
const validClaim = () => ({
  verification: 'BRAIN_SIGNED_READBACK',
  state: 'CLAIMED',
  taskId: task.taskId,
  repository: task.repository,
  commitSha: task.commitSha,
  allowedPaths: [...task.allowedPaths],
  reservationId: '22222222-2222-4222-8222-222222222222',
  dispatchAttemptId: '33333333-3333-4333-8333-333333333333',
  expiresAtMs: Date.now() + 60000,
  maxUsdCents: 70,
  approvalEvidenceSha: 'b'.repeat(64),
  permissions: { gitWrite: false, merge: false, deploy: false },
});
function mocks(overrides = {}) {
  const claim = validClaim();
  const calls = { network: 0, begin: 0, settle: 0 };
  const config = {
    task,
    activation: 'STAGING_EXPLICIT_APPROVAL',
    apiKey: 'sk-local',
    readBackClaim: async () => claim,
    beginExclusiveAttempt: async input => {
      calls.begin++;
      return { state: 'BEGUN', dispatchAttemptId: input.dispatchAttemptId };
    },
    fetchImpl: async (url, init) => {
      calls.network++;
      assert.equal(url, 'https://api.openai.com/v1/agents/sessions');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['OpenAI-Beta'], 'agents=v1');
      assert.equal(init.redirect, 'error');
      const body = JSON.parse(init.body);
      assert.equal(body.spend_control.limit, 70);
      return { status: 201, headers: { get: () => 'application/json' }, json: async () => ({
        id: 'sess_test1234', object: 'agent.session', status: 'in_progress',
        metadata: { task_id: task.taskId }, spend_control: { limit: 70 },
      }) };
    },
    settleSubmission: async input => {
      calls.settle++;
      return { state: 'ACKNOWLEDGED', providerSessionId: input.providerSessionId };
    },
    ...overrides,
  };
  return { config, calls, claim };
}

test('policy is narrowly scoped: exact repo, commit, paths and no secret-looking input', () => {
  assert.equal(validateTask(task).taskId, task.taskId);
  for (const patch of [
    { repository: 'another/repo' },
    { commitSha: 'main' },
    { allowedPaths: ['../.env'] },
    { allowedPaths: ['.git/config'] },
    { allowedPaths: ['automation/agent-kit/cli.mjs','automation/agent-kit/cli.mjs'] },
    { instruction: 'Bearer ' + 's'.repeat(40) },
    { sourceExcerpt: '-----BEGIN PRIVATE KEY-----' },
    { taskClass: 'DEPLOY' },
    { unexpected: true },
  ]) assert.throws(() => validateTask({ ...task, ...patch }), /CODEX_CONTRACT_REJECTED/);
});

test('claim validation checks expiry, exact SHA/scope and approvals', () => {
  assert.equal(validateTrustedBrainClaim(task,validClaim()).state,'CLAIMED');
  for (const change of [
    { state: 'PENDING_REVIEW' },
    { verification: 'CLAIM_UNVERIFIED' },
    { commitSha: 'f'.repeat(40) },
    { allowedPaths: ['brain/src/worker.mjs'] },
    { maxUsdCents: 0 },
    { maxUsdCents: 101 },
    { permissions: {gitWrite:false,merge:true,deploy:false} },
    { expiresAtMs: Date.now()-1000 },
  ]) assert.throws(() => validateTrustedBrainClaim(task,{ ...validClaim(), ...change }),
    /CODEX_CONTRACT_REJECTED/);
});

test('official Agents API request is review only, no network or GitHub rights, bounded cost', () => {
  const body = buildSessionRequest(task, validClaim());
  assert.equal(body.agent.model, 'gpt-6-astra');
  assert.deepEqual(body.agent.tools, []);
  assert.equal(body.agent.multi_agent.enabled,false);
  assert.equal(body.environment.network.access,'disabled');
  assert.equal(body.environment.container_size,'small');
  assert.equal(body.spend_control.limit,70);
  assert.equal(body.metadata.commit_sha,task.commitSha);
  assert.equal(body.stream,false);
  assert.equal(body.review,'none');
  assert.ok(!JSON.stringify(body).includes('OPENAI_API_KEY'));
});

test('disabled by default, with no provider requests or Brain calls', async () => {
  const {config,calls} = mocks({activation:'OFF'});
  const result=await submitAuthorizedReview(config);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason,'PROVIDER_DISABLED');
  assert.deepEqual(calls,{network:0,begin:0,settle:0});
});

test('unverified Brain claim never reaches the API', async () => {
  const {config,calls}=mocks({readBackClaim:async()=>({...validClaim(),verification:'UNVERIFIED'})});
  const r=await submitAuthorizedReview(config);
  assert.equal(r.reason,'BRAIN_CLAIM_NOT_VERIFIED');
  assert.equal(calls.network,0);
});

test('no begin/lease receipt means no API call', async () => {
  const {config,calls}=mocks({beginExclusiveAttempt:async()=>({state:'UNKNOWN'})});
  const r=await submitAuthorizedReview(config);
  assert.equal(r.reason,'BRAIN_BEGIN_NOT_ATTESTED');
  assert.equal(calls.network,0);
});

test('one permitted simulated submission creates a session, not a completed coding task', async () => {
  const {config,calls}=mocks();
  const r=await submitAuthorizedReview(config);
  assert.equal(r.status,'SESSION_SUBMITTED_NOT_TURN_VERIFIED');
  assert.equal(r.providerSessionId,'sess_test1234');
  assert.equal(r.safeToRetry,false);
  assert.deepEqual(calls,{network:1,begin:1,settle:1});
  assert.ok(!JSON.stringify(r).includes('sk-local'));
});

test('network error is UNKNOWN and never automatically retried',async()=>{
  const {config,calls}=mocks({fetchImpl:async()=>{calls.network++;throw Error('sensitive-provider-detail');}});
  const r=await submitAuthorizedReview(config);
  assert.equal(r.status,'UNKNOWN_RECONCILE_REQUIRED');
  assert.equal(r.safeToRetry,false);
  assert.equal(calls.network,1);
  assert.doesNotMatch(JSON.stringify(r),/sensitive-provider-detail/);
});

test('HTTP rejection, invalid session and failed durable settlement fail closed',async()=>{
  const first=mocks({fetchImpl:async()=>({status:429})});
  const r1=await submitAuthorizedReview(first.config);
  assert.equal(r1.status,'UNKNOWN_RECONCILE_REQUIRED');
  assert.equal(first.calls.settle,0);
  const second=mocks({fetchImpl:async()=>({status:201,headers:{get:()=> 'application/json'},
    json:async()=>({object:'agent.session',id:'sess_test1234',
      metadata:{task_id:task.taskId},spend_control:{limit:999}})})});
  const r2=await submitAuthorizedReview(second.config);
  assert.equal(r2.reason,'PROVIDER_READBACK_MISMATCH');
  const third=mocks({settleSubmission:async()=>({state:'UNKNOWN'})});
  const r3=await submitAuthorizedReview(third.config);
  assert.equal(r3.reason,'BRAIN_SETTLEMENT_NOT_ATTESTED');
});

test('key missing / Brain bridge missing remain blocked before any network',async()=>{
  const noKey=mocks({apiKey:null});
  const a=await submitAuthorizedReview(noKey.config);
  assert.equal(a.reason,'PROVIDER_CREDENTIAL_OR_TRANSPORT_UNAVAILABLE');
  assert.equal(noKey.calls.network,0);
  const noBrain=mocks({readBackClaim:null});
  const b=await submitAuthorizedReview(noBrain.config);
  assert.equal(b.reason,'BRAIN_PORTS_UNWIRED');
  assert.equal(noBrain.calls.network,0);
});
