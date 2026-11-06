// App-scoped, single-request GitHub REST read credential.
// No user PAT, no refresh token, no token persistence and no second Worker.
// Secrets are supplied only through the existing Cloudflare Worker bindings.
import { Rejected } from './contract.mjs';

const APP_ID = '5641216';
const INSTALLATION_ID = '179225349';
const REPOSITORY = 'dizigs/archelaos-site';
const READ_PERMISSIONS = Object.freeze({actions:'read',checks:'read',metadata:'read'});
const API = 'https://api.github.com';
const encoder = new TextEncoder();

const deny = code => { throw new Rejected(code, 503); };
const asBase64Url = bytes => btoa(String.fromCharCode(...bytes))
  .replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const utf8Base64Url = value => asBase64Url(encoder.encode(value));
function derLength(n) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 16384) deny('GITHUB_APP_KEY_INVALID');
  if (n < 128) return [n];
  const a=[]; let x=n;
  while (x) { a.unshift(x&255); x=Math.floor(x/256); }
  return [0x80|a.length,...a];
}
const der = (tag, bytes) => new Uint8Array([tag,...derLength(bytes.length),...bytes]);
const concat = (...items) => new Uint8Array(items.flatMap(x=>Array.from(x)));

// GitHub supplies BEGIN RSA PRIVATE KEY (PKCS#1); WebCrypto imports PKCS#8.
// The DER wrapper does not modify or expose private key material.
function toPkcs8(pem) {
  if (typeof pem !== 'string' || pem.length < 600 || pem.length > 14000)
    deny('GITHUB_APP_KEY_UNCONFIGURED');
  // Parse PEM as bounded, exact lines, not overlapping whitespace regexes.
  const lines=pem.replaceAll('\\n','\n').trim().split(/\r?\n/);
  if (lines.length < 3 || lines.length > 250) deny('GITHUB_APP_KEY_INVALID');
  const header=lines[0], footer=lines.at(-1);
  const isPkcs1=header==='-----BEGIN RSA PRIVATE KEY-----';
  if (!isPkcs1 && header!=='-----BEGIN PRIVATE KEY-----')
    deny('GITHUB_APP_KEY_INVALID');
  if (footer !== (isPkcs1 ? '-----END RSA PRIVATE KEY-----' : '-----END PRIVATE KEY-----') ||
      lines.slice(1,-1).some(line=>!/^[-A-Za-z0-9+/=]+$/.test(line)))
    deny('GITHUB_APP_KEY_INVALID');
  const body=lines.slice(1,-1).join('');
  let decoded;
  try {
    if(body.length < 500 || body.length > 12000) deny('GITHUB_APP_KEY_INVALID');
    decoded=Uint8Array.from(atob(body),c=>c.charCodeAt(0));
  } catch { deny('GITHUB_APP_KEY_INVALID'); }
  if(!isPkcs1) return decoded; // already PKCS#8
  const version=new Uint8Array([0x02,0x01,0x00]);
  const algorithm=new Uint8Array([
    0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,
    0x01,0x01,0x01,0x05,0x00
  ]);
  return der(0x30,concat(version,algorithm,der(0x04,decoded)));
}

export async function makeGitHubAppJwt(config, now=Date.now()) {
  if (!Number.isSafeInteger(now) || String(config?.BRAIN_GITHUB_APP_ID) !== APP_ID ||
      String(config?.BRAIN_GITHUB_APP_INSTALLATION_ID) !== INSTALLATION_ID)
    deny('GITHUB_APP_IDENTITY_NOT_APPROVED');
  let key;
  try {
    key=await crypto.subtle.importKey('pkcs8',
      toPkcs8(config.BRAIN_GITHUB_APP_PRIVATE_KEY),
      {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  } catch { deny('GITHUB_APP_KEY_INVALID'); }
  const epoch=Math.floor(now/1000);
  const header=utf8Base64Url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const body=utf8Base64Url(JSON.stringify({
    iat:epoch-60,exp:epoch+480,iss:APP_ID
  }));
  const signed=header+'.'+body;
  let signature;
  try {
    signature=asBase64Url(new Uint8Array(await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',key,encoder.encode(signed))));
  } catch { deny('GITHUB_APP_SIGNING_UNAVAILABLE'); }
  return signed+'.'+signature;
}

/** Returns a short-lived token ONLY to the existing private evidence checker. */
export async function getScopedGitHubReadToken(config,{
  fetchImpl=fetch,now=Date.now(),clock=()=>performance.now()
}={}) {
  if(typeof fetchImpl!=='function' || typeof clock!=='function')
    deny('GITHUB_APP_READ_PORT_UNAVAILABLE');
  const jwt=await makeGitHubAppJwt(config,now);
  const requestBody=JSON.stringify({
    repositories:['archelaos-site'],
    permissions:READ_PERMISSIONS
  });
  let response;
  const beganAt=clock();
  try {
    response=await fetchImpl(API+'/app/installations/'+INSTALLATION_ID+'/access_tokens',{
      method:'POST',redirect:'error',cache:'no-store',
      headers:{
        authorization:'Bearer '+jwt,
        accept:'application/vnd.github+json',
        'content-type':'application/json',
        'x-github-api-version':'2022-11-28',
        'user-agent':'archelaos-brain-private-selfheal'
      },
      body:requestBody,
      signal:AbortSignal.timeout(4000)
    });
  } catch { deny('GITHUB_APP_TOKEN_ISSUANCE_UNAVAILABLE'); }
  if(response?.status!==201) deny('GITHUB_APP_TOKEN_ISSUANCE_UNAVAILABLE');
  let data;
  try {
    if(Number(response.headers?.get?.('content-length')||'0')>25000)
      deny('GITHUB_APP_TOKEN_RESPONSE_INVALID');
    const raw=await response.text();
    if(encoder.encode(raw).byteLength>25000)
      deny('GITHUB_APP_TOKEN_RESPONSE_INVALID');
    data=JSON.parse(raw);
  } catch { deny('GITHUB_APP_TOKEN_RESPONSE_INVALID'); }
  const perms=data?.permissions, repositories=data?.repositories,expires=Date.parse(data?.expires_at);
  // GitHub may omit the repository inventory in token responses; never
  // consider its absence proof of scope. Read it back with the issued token.
  const elapsed=clock()-beganAt;
  const validatedAt=now+Math.max(0,elapsed);
  if (!Number.isFinite(elapsed) || elapsed<0 || !Number.isSafeInteger(now) ||
      typeof data?.token!=='string' || data.token.length<43 ||
      !Number.isFinite(expires) || expires <= validatedAt+60_000 ||
      expires > validatedAt+60*60_000 ||
      !perms || Object.keys(perms).length!==3 ||
      Object.keys(READ_PERMISSIONS).some(name=>perms[name]!=='read') ||
      data.repository_selection!=='selected')
    deny('GITHUB_APP_TOKEN_SCOPE_UNVERIFIED');
  if (repositories === undefined) {
    let inventoryResponse;
    try {
      inventoryResponse=await fetchImpl(API+'/installation/repositories?per_page=2',{
        method:'GET',redirect:'error',cache:'no-store',
        headers:{
          authorization:'Bearer '+data.token,
          accept:'application/vnd.github+json',
          'x-github-api-version':'2022-11-28',
          'user-agent':'archelaos-brain-private-selfheal'
        },
        signal:AbortSignal.timeout(4000)
      });
    } catch { deny('GITHUB_APP_TOKEN_SCOPE_UNVERIFIED'); }
    if (inventoryResponse?.status!==200) deny('GITHUB_APP_TOKEN_SCOPE_UNVERIFIED');
    let inventory;
    try {
      const length=Number(inventoryResponse.headers?.get?.('content-length')||'0');
      if (length>5000) deny('GITHUB_APP_TOKEN_SCOPE_UNVERIFIED');
      const raw=await inventoryResponse.text();
      if (encoder.encode(raw).byteLength>5000) deny('GITHUB_APP_TOKEN_SCOPE_UNVERIFIED');
      inventory=JSON.parse(raw);
    } catch { deny('GITHUB_APP_TOKEN_SCOPE_UNVERIFIED'); }
    if (inventory?.total_count!==1 || !Array.isArray(inventory.repositories) ||
        inventory.repositories.length!==1 ||
        inventory.repositories[0]?.full_name!==REPOSITORY)
      deny('GITHUB_APP_TOKEN_SCOPE_UNVERIFIED');
  } else if (!Array.isArray(repositories) || repositories.length!==1 ||
             repositories[0]?.full_name!==REPOSITORY) {
    deny('GITHUB_APP_TOKEN_SCOPE_UNVERIFIED');
  }
  return data.token;
}
