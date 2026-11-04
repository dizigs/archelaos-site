import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runReadinessProbe } from '../../automation/apps-script/oidc-probe-runner.mjs';
const sha = 'a'.repeat(40);
const id = '11111111-1111-4111-8111-111111111111';
const path = 'automation/apps-script/operator-requests/probe-' + id + '.json';
function setup() {
  const env = { GITHUB_REPOSITORY:'dizigs/archelaos-site', GITHUB_EVENT_NAME:'push', GITHUB_REF:'refs/heads/codex/automation-bridge-integration', GITHUB_SHA:sha, GH_TOKEN:'synthetic-readonly-github-token', ACTIONS_ID_TOKEN_REQUEST_URL:'https://run.synthetic.actions.githubusercontent.com/idtoken', ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic-oidc-request-token' };
  const state = { calls:[], files:[{ filename:path,status:'added' }], payload:{ id,version:1,task:'readiness' } };
  const transport = async (url, options) => {
    state.calls.push({ url,options });
    if (url.includes('/commits/')) return Response.json({ sha, parents:[{}],files:state.files });
    if (url.includes('/contents/')) return Response.json(state.payload);
    if (url.includes('actions.githubusercontent.com')) return Response.json({ value:'x'.repeat(250) });
    return Response.json({ status:'GITHUB_OIDC_READONLY_PROBE_VERIFIED',signedExecution:true,readOnly:true,encryptedBackupPresent:true,googleEditsPerformed:false,editorEnabled:false });
  };
  return { env,state,transport };
}
test('immutable GitHub metadata replaces OS command/file reads; no token is sent to foreign origins', async () => {
  const f=setup(); assert.equal(await runReadinessProbe(f),'GITHUB_OIDC_READONLY_PROBE_VERIFIED'); assert.equal(f.state.calls.length,4);
  assert.ok(f.state.calls[1].url.endsWith('?ref='+sha));
  assert.ok(f.state.calls.every(r=>r.options.redirect==='manual'));
});
test('modified/multiple/traversal/non-addition requests fail before requesting OIDC authority',async()=>{
  for(const invalid of [[{filename:'../private',status:'added'}],[{filename:path,status:'modified'}],[{filename:path,status:'added'},{filename:'automation/apps-script/github-oidc.mjs',status:'modified'}]]){
    const f=setup();f.state.files=invalid;await assert.rejects(runReadinessProbe(f));assert.equal(f.state.calls.length,1);
  }
});
test('unknown task fields and mismatched IDs are not accepted',async()=>{
  for(const patch of [{task:'write'},{extra:true},{id:crypto.randomUUID()}]){const f=setup();Object.assign(f.state.payload,patch);await assert.rejects(runReadinessProbe(f));assert.equal(f.state.calls.length,2);}
});
test('foreign OIDC request endpoint cannot receive the runner request token',async()=>{
  const f=setup();f.env.ACTIONS_ID_TOKEN_REQUEST_URL='https://foreign.invalid/token';await assert.rejects(runReadinessProbe(f));assert.equal(f.state.calls.length,2);
});
