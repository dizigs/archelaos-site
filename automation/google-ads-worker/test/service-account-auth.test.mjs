import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceAccountAdsToken} from '../src/service-account-auth.mjs';
import {adsAccessToken} from '../src/google-ads-api.mjs';

const root='archelaos-test-automation';
async function ephemeral(){
  const pair=await crypto.subtle.generateKey(
    {name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
      publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const bytes=new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey));
  const raw=Buffer.from(bytes).toString('base64');
  return {key:pair.publicKey,env:{
    ADS_OAUTH_MODE:'SERVICE_ACCOUNT',
    ADS_SERVICE_ACCOUNT_PROJECT_ID:root,
    ADS_SERVICE_ACCOUNT_CLIENT_EMAIL:'archelaos-ads@'+root+'.iam.gserviceaccount.com',
    ADS_SERVICE_ACCOUNT_PRIVATE_KEY_PEM:
      '-----BEGIN PRIVATE KEY-----\n'+raw+'\n-----END PRIVATE KEY-----'}};
}
const b64=value=>JSON.parse(Buffer.from(value.replaceAll('-','+').replaceAll('_','/'),'base64').toString('utf8'));
test('service-account JWT signs only fixed Ads OAuth scope, short validity, correct project',async()=>{
  const fixture=await ephemeral();
  let called=0;
  const now=Date.parse('2026-11-05T12:00:00Z');
  const token=await adsAccessToken(fixture.env,async(url,options)=>{
    called++;
    assert.equal(url,'https://oauth2.googleapis.com/token');
    assert.equal(options.method,'POST');
    assert.equal(options.body.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const jwt=options.body.get('assertion');
    const parts=jwt.split('.');
    assert.equal(parts.length,3);
    assert.equal(b64(parts[0]).alg,'RS256');
    const claims=b64(parts[1]);
    assert.equal(claims.scope,'https://www.googleapis.com/auth/adwords');
    assert.equal(claims.iss,fixture.env.ADS_SERVICE_ACCOUNT_CLIENT_EMAIL);
    assert.equal(claims.aud,url);
    assert(claims.exp-claims.iat<=3600);
    const sig=Buffer.from(parts[2].replaceAll('-','+').replaceAll('_','/'),'base64');
    const verified=await crypto.subtle.verify(
      {name:'RSASSA-PKCS1-v1_5'},fixture.key,sig,new TextEncoder().encode(parts[0]+'.'+parts[1]));
    assert.equal(verified,true);
    return {ok:true,json:async()=>({access_token:'mock-ads-bearer',token_type:'Bearer'})};
  });
  assert.equal(token,'mock-ads-bearer');
  assert.equal(called,1);
});
test('cannot silently use a different project, missing key or unsupported auth mode',async()=>{
  const fixture=await ephemeral();
  await assert.rejects(()=>serviceAccountAdsToken({...fixture.env,
    ADS_SERVICE_ACCOUNT_PROJECT_ID:'another-organization'},{fetcher(){throw Error('MUST_NOT_FETCH')}}),
    /IDENTITY_MISMATCH/);
  await assert.rejects(()=>serviceAccountAdsToken({...fixture.env,
    ADS_SERVICE_ACCOUNT_PRIVATE_KEY_PEM:''},{fetcher(){throw Error('MUST_NOT_FETCH')}}),
    /KEY_MISSING/);
  await assert.rejects(()=>adsAccessToken({...fixture.env,ADS_OAUTH_MODE:'UNCONFIGURED'},
    ()=>{throw Error('MUST_NOT_FETCH')}),/AUTH_MODE_NOT_APPROVED/);
});
test('oauth errors fail closed without leaking token response',async()=>{
  const fixture=await ephemeral();
  await assert.rejects(()=>serviceAccountAdsToken(fixture.env,{fetcher:async()=>
    ({ok:false,status:403})}),/ADS_SERVICE_ACCOUNT_OAUTH_REJECTED/);
  await assert.rejects(()=>serviceAccountAdsToken(fixture.env,{fetcher:async()=>({
    ok:true,json:async()=>({access_token:'secret-no-token-type'})})}),
    /ADS_SERVICE_ACCOUNT_ACCESS_TOKEN_INVALID/);
});
