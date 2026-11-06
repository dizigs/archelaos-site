import {allowedLanding} from './contract.mjs';
const deny=(ok,code)=>{if(!ok)throw Error(code);};

/**
 * Require a live HTTP 200 HTML page with the exact editor-approved SHA-256.
 * No redirects, arbitrary hosts, content guesses or cached "landing ok" flags.
 * Used only for reviewed PAUSED RSA changes, never to activate serving.
 */
export async function verifyApprovedLanding(url,expectedDigest,{fetcher=fetch}={}){
  deny(allowedLanding(url),'UNTRUSTED_LANDING');
  deny(typeof expectedDigest==='string' && /^[a-f0-9]{64}$/.test(expectedDigest),
    'LANDING_APPROVAL_DIGEST_MISSING');
  const response=await fetcher(url,{method:'GET',redirect:'manual',
    headers:{accept:'text/html'},signal:AbortSignal.timeout(10000)});
  deny(response?.status===200 && response.ok,'LANDING_HTTP_200_REQUIRED');
  deny(!response.url || response.url===url,'LANDING_REDIRECT_NOT_ALLOWED');
  deny(/^text\/html(?:\s*;|$)/i.test(response.headers?.get('content-type')||''),
    'LANDING_NOT_HTML');
  const html=await response.text();
  deny(typeof html==='string'&&html.length>=400&&html.length<=1000000&&
    /<body\b|<main\b/i.test(html),'LANDING_CONTENT_INVALID');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(html))),x=>x.toString(16).padStart(2,'0')).join('');
  deny(digest===expectedDigest,'LANDING_CONTENT_CHANGED_REAPPROVAL_REQUIRED');
  return {url,httpStatus:200,sha256:digest,approved:true,
    checkedAt:new Date().toISOString(),adsMutation:false};
}
