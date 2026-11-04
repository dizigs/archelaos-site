import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyGithubProbeToken, oidcAudience } from '../../automation/apps-script/github-oidc.mjs';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const key={...pair.publicKey.export({format:'jwk'}),kid:'demo',use:'sig',alg:'RS256'};
const now=Math.floor(Date.now()/1000);
const good={iss:'https://token.actions.githubusercontent.com',aud:oidcAudience,
repository:'dizigs/archelaos-site',repository_id:'1433399999',
ref:'refs/heads/codex/automation-bridge-integration',event_name:'push',
workflow_ref:'dizigs/archelaos-site/.github/workflows/apps-script-oidc-probe.yml@refs/heads/codex/automation-bridge-integration',
runner_environment:'github-hosted',sha:'a'.repeat(40),run_id:'1234567',run_attempt:'1',
jti:'unique-oidc-token-id',iat:now-5,nbf:now-5,exp:now+300};
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function signed(fields={}){const plain=b64({alg:'RS256',kid:'demo'})+'.'+b64({...good,...fields});return plain+'.'+sign('RSA-SHA256',Buffer.from(plain),pair.privateKey).toString('base64url');}
const config={now:()=>now*1000,fetchKeys:async()=>Response.json({keys:[key]})};
test('GitHub signed OIDC identity verifies issuer, RSA, repo and branch',async()=>{
 const x=await verifyGithubProbeToken(signed(),config);
 assert.equal(x.runKey,'1234567:1');assert.equal(x.sourceCommit,good.sha);
 assert.match(x.tokenHash,/^[a-f0-9]{64}$/);
});
test('untrusted OIDC claims are rejected before accepting an actor',async()=>{
 for(const fields of [{aud:'other'},{repository_id:'wrong'},{ref:'refs/heads/main'},
 {workflow_ref:'unknown'},{event_name:'pull_request'},{exp:now-1},{run_attempt:'0'}]){
  await assert.rejects(verifyGithubProbeToken(signed(fields),config),e=>e.code==='GITHUB_OIDC_AUTH_REQUIRED');
 }
});
test('bad signature is rejected',async()=>{
 const t=signed();const bad=t.slice(0,-8)+'00000000';
 await assert.rejects(verifyGithubProbeToken(bad,config),e=>e.code==='GITHUB_OIDC_AUTH_REQUIRED');
});
