import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createVerify, generateKeyPairSync} from 'node:crypto';
import {makeGitHubAppJwt, getScopedGitHubReadToken} from '../src/github_app_read_token.mjs';

const NOW=Date.parse('2026-11-06T11:00:00Z');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:65537});
const pem1=privateKey.export({type:'pkcs1',format:'pem'});
const pem8=privateKey.export({type:'pkcs8',format:'pem'});
const env=(pem=pem1)=>({
  BRAIN_GITHUB_APP_ID:'5641216',
  BRAIN_GITHUB_APP_INSTALLATION_ID:'179225349',
  BRAIN_GITHUB_APP_PRIVATE_KEY:pem
});
const decode64=value=>Buffer.from(value,'base64url');
const validResponse=(patch={})=>new Response(JSON.stringify({
  token:'ghs_'+ 't'.repeat(60),
  expires_at:new Date(NOW+60*60_000).toISOString(),
  permissions:{actions:'read',checks:'read',metadata:'read'},
  repository_selection:'selected',
  repositories:[{full_name:'dizigs/archelaos-site'}],
  ...patch
}),{status:201,headers:{'content-type':'application/json'}});

test('GitHub-issued RSA PRIVATE KEY (PKCS#1) and PKCS#8 both sign valid RS256 JWT',async()=>{
  for(const pem of [pem1,pem8,pem1.replaceAll('\n','\\n')]){
    const jwt=await makeGitHubAppJwt(env(pem),NOW);
    const [head,body,sig,...extra]=jwt.split('.');
    assert.equal(extra.length,0);
    assert.deepEqual(JSON.parse(decode64(head).toString()),{alg:'RS256',typ:'JWT'});
    assert.deepEqual(JSON.parse(decode64(body).toString()),{
      iat:Math.floor(NOW/1000)-60,
      exp:Math.floor(NOW/1000)+480,
      iss:'5641216'
    });
    const verifier=createVerify('RSA-SHA256');
    verifier.update(head+'.'+body);verifier.end();
    assert.equal(verifier.verify(publicKey,decode64(sig)),true);
  }
});

test('GitHub App creates exactly one single-repository short-lived read-only token',async()=>{
  let calls=0;
  const token=await getScopedGitHubReadToken(env(),{
    now:NOW,
    fetchImpl:async(url,opts)=>{
      calls++;
      assert.equal(url,'https://api.github.com/app/installations/179225349/access_tokens');
      assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');
      assert.equal(opts.cache,'no-store');
      assert.equal(opts.headers['x-github-api-version'],'2022-11-28');
      assert.ok(opts.headers.authorization.startsWith('Bearer eyJ'));
      assert.deepEqual(JSON.parse(opts.body),{
        repositories:['archelaos-site'],
        permissions:{actions:'read',checks:'read',metadata:'read'}
      });
      return validResponse();
    }
  });
  assert.equal(token,'ghs_'+ 't'.repeat(60));
  assert.equal(calls,1);
});

test('wrong app or installation, absent PEM, or malformed private keys deny before any request',async()=>{
  for(const change of [
    e=>{e.BRAIN_GITHUB_APP_ID='123';},
    e=>{e.BRAIN_GITHUB_APP_INSTALLATION_ID='456';},
    e=>{delete e.BRAIN_GITHUB_APP_PRIVATE_KEY;},
    e=>{e.BRAIN_GITHUB_APP_PRIVATE_KEY='bad key';},
    e=>{e.BRAIN_GITHUB_APP_PRIVATE_KEY='-----BEGIN RSA PRIVATE KEY-----\n'+ 'a'.repeat(1200)+'\n-----END RSA PRIVATE KEY-----';}
  ]){
    const e=env();change(e);
    let called=false;
    await assert.rejects(()=>getScopedGitHubReadToken(e,{
      now:NOW,fetchImpl:async()=>{called=true;return validResponse();}
    }),/GITHUB_APP_/);
    assert.equal(called,false);
  }
});

test('GitHub 201 is never enough without exact scoped permissions and repository',async()=>{
  const variants=[
    {permissions:{actions:'read',checks:'read',metadata:'read',contents:'read'}},
    {permissions:{actions:'write',checks:'read',metadata:'read'}},
    {permissions:{actions:'read',metadata:'read'}},
    {repository_selection:'all'},
    {repositories:[{full_name:'other/other'}]},
    {repositories:[{full_name:'dizigs/archelaos-site'},{full_name:'other/other'}]},
    {expires_at:new Date(NOW-1).toISOString()},
    {expires_at:new Date(NOW+2*60*60_000).toISOString()},
    {token:'short'}
  ];
  for(const patch of variants){
    await assert.rejects(()=>getScopedGitHubReadToken(env(),{
      now:NOW,fetchImpl:async()=>validResponse(patch)
    }),/GITHUB_APP_TOKEN_SCOPE_UNVERIFIED/);
  }
});

test('installation HTTP rejection, network failure and corrupt JSON all fail closed',async()=>{
  await assert.rejects(()=>getScopedGitHubReadToken(env(),{
    now:NOW,fetchImpl:async()=>new Response('{}',{status:403})
  }),/GITHUB_APP_TOKEN_ISSUANCE_UNAVAILABLE/);
  await assert.rejects(()=>getScopedGitHubReadToken(env(),{
    now:NOW,fetchImpl:async()=>{throw Error('network uncertainty');}
  }),/GITHUB_APP_TOKEN_ISSUANCE_UNAVAILABLE/);
  await assert.rejects(()=>getScopedGitHubReadToken(env(),{
    now:NOW,fetchImpl:async()=>new Response('not json',{status:201})
  }),/GITHUB_APP_TOKEN_RESPONSE_INVALID/);
});


test('token expires within one hour after elapsed exchange, including boundary',async()=>{
  async function issue(expireOffsetMs, expectedOk){
    let tick=0;
    const clock=()=>[100,6100][Math.min(tick++,1)];
    const promise=getScopedGitHubReadToken(env(),{
      now:NOW,clock,
      fetchImpl:async()=>validResponse({expires_at:new Date(NOW+expireOffsetMs).toISOString()})
    });
    if(expectedOk) assert.equal(await promise,'ghs_'+ 't'.repeat(60));
    else await assert.rejects(promise,/GITHUB_APP_TOKEN_SCOPE_UNVERIFIED/);
  }
  await issue(60*60_000+6000,true); // exactly one hour remaining after 6s
  await issue(60*60_000+6001,false); // even one ms above the maximum is rejected
  await issue(60_000+6000,false); // less than or equal to 60s remaining fails closed
});

test('GitHub token response may omit repositories only with independent scoped readback',async()=>{
  let calls=0;
  const token=await getScopedGitHubReadToken(env(),{
    now:NOW,
    fetchImpl:async(url,options)=>{
      calls++;
      if(calls===1){
        assert.equal(options.method,'POST');
        return validResponse({repositories:undefined});
      }
      assert.equal(url,'https://api.github.com/installation/repositories?per_page=2');
      assert.equal(options.method,'GET');
      assert.equal(options.redirect,'error');
      assert.equal(options.headers.authorization,'Bearer ghs_'+ 't'.repeat(60));
      return new Response(JSON.stringify({
        total_count:1,repositories:[{full_name:'dizigs/archelaos-site'}]
      }),{status:200});
    }
  });
  assert.equal(token,'ghs_'+ 't'.repeat(60));
  assert.equal(calls,2);
});

test('missing repository list never bypasses independent scoped readback',async()=>{
  const scenarios=[
    {total_count:2,repositories:[{full_name:'dizigs/archelaos-site'}]},
    {total_count:1,repositories:[{full_name:'another/repository'}]},
    {total_count:1,repositories:[]},
    {total_count:1},
    {}
  ];
  for(const inventory of scenarios){
    let calls=0;
    await assert.rejects(()=>getScopedGitHubReadToken(env(),{
      now:NOW,fetchImpl:async()=>{
        calls++;return calls===1?validResponse({repositories:undefined}):
          new Response(JSON.stringify(inventory),{status:200});
      }
    }),/GITHUB_APP_TOKEN_SCOPE_UNVERIFIED/);
    assert.equal(calls,2);
  }
  await assert.rejects(()=>getScopedGitHubReadToken(env(),{
    now:NOW,fetchImpl:async(url)=>{
      if(url.includes('/access_tokens'))return validResponse({repositories:undefined});
      return new Response('{}',{status:403});
    }
  }),/GITHUB_APP_TOKEN_SCOPE_UNVERIFIED/);
  await assert.rejects(()=>getScopedGitHubReadToken(env(),{
    now:NOW,fetchImpl:async(url)=>{
      if(url.includes('/access_tokens'))return validResponse({repositories:undefined});
      throw Error('network unavailable');
    }
  }),/GITHUB_APP_TOKEN_SCOPE_UNVERIFIED/);
});
