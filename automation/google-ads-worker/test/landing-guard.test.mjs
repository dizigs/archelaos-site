import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyApprovedLanding} from '../src/landing-guard.mjs';

const url='https://archelaos.club/history.html';
const html='<html><body><main>'+('Επίσημη ιστορία αθλητικού συλλόγου. '.repeat(30))+'</main></body></html>';
async function sha256(text){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
test('approved immutable HTML and HTTP 200 give a non-mutating receipt',async()=>{
  const digest=await sha256(html);
  const result=await verifyApprovedLanding(url,digest,{fetcher:async()=>new Response(html,
    {status:200,headers:{'content-type':'text/html; charset=utf-8'}})});
  assert.equal(result.httpStatus,200);
  assert.equal(result.sha256,digest);
  assert.equal(result.adsMutation,false);
});
test('changed content, redirects and 404 fail before any Ads operation',async()=>{
  const digest=await sha256(html);
  await assert.rejects(()=>verifyApprovedLanding(url,digest,{fetcher:async()=>
    new Response(html+'x',{status:200,headers:{'content-type':'text/html'}})}),
  /LANDING_CONTENT_CHANGED/);
  await assert.rejects(()=>verifyApprovedLanding(url,digest,{fetcher:async()=>
    new Response('',{status:302,headers:{location:'https://another-site.test'}})}),
  /LANDING_HTTP_200_REQUIRED/);
  await assert.rejects(()=>verifyApprovedLanding(url,digest,{fetcher:async()=>
    new Response('Not found',{status:404})}),/LANDING_HTTP_200_REQUIRED/);
});
test('no digest, external host or non-HTML cannot receive approval',async()=>{
  await assert.rejects(()=>verifyApprovedLanding(url,'',{}),/DIGEST_MISSING/);
  await assert.rejects(()=>verifyApprovedLanding('https://archelaos.club.evil.test/history.html',
    'a'.repeat(64),{}),/UNTRUSTED_LANDING/);
  await assert.rejects(()=>verifyApprovedLanding(url,'a'.repeat(64),{fetcher:async()=>
    new Response(html,{status:200,headers:{'content-type':'text/plain'}})}),
  /LANDING_NOT_HTML/);
});
