/**
 * Short-lived Google Ads OAuth token from an existing Google Cloud service account.
 * The PEM key must be a Cloudflare secret; never store or report it with receipts.
 * Google Ads API scope is fixed, and the service account identity is pinned.
 */
const OAUTH_AUD='https://oauth2.googleapis.com/token';
const ADS_SCOPE='https://www.googleapis.com/auth/adwords';
const must=(v,code)=>{if(!v)throw Error(code);};
function base64url(bytes){
  let s='';
  for(const n of bytes)s+=String.fromCharCode(n);
  return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
const enc=value=>base64url(new TextEncoder().encode(JSON.stringify(value)));

export async function serviceAccountAdsToken(env,{fetcher=fetch,now=Date.now()}={}){
  const email=env?.ADS_SERVICE_ACCOUNT_CLIENT_EMAIL;
  const project=env?.ADS_SERVICE_ACCOUNT_PROJECT_ID;
  const pem=env?.ADS_SERVICE_ACCOUNT_PRIVATE_KEY_PEM;
  must(typeof project==='string' && /^[a-z][a-z0-9-]{4,62}$/.test(project),
    'ADS_SERVICE_ACCOUNT_PROJECT_UNVERIFIED');
  must(typeof email==='string' &&
    /^[a-z0-9][a-z0-9-]*@[a-z][a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(email) &&
    email.endsWith('@'+project+'.iam.gserviceaccount.com'),
    'ADS_SERVICE_ACCOUNT_IDENTITY_MISMATCH');
  must(typeof pem==='string' && /^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----\s*$/.test(pem),
    'ADS_SERVICE_ACCOUNT_KEY_MISSING');
  must(Number.isFinite(now) && now>=0,'ADS_OAUTH_TIME_INVALID');
  const body=pem.replace('-----BEGIN PRIVATE KEY-----','')
    .replace('-----END PRIVATE KEY-----','').replace(/\s+/g,'');
  must(/^[A-Za-z0-9+/]+={0,2}$/.test(body),'ADS_SERVICE_ACCOUNT_KEY_INVALID');
  let key;
  try{
    const bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));
    key=await crypto.subtle.importKey('pkcs8',bytes,
      {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  }catch{throw Error('ADS_SERVICE_ACCOUNT_KEY_INVALID');}
  const issued=Math.floor(now/1000);
  const head=enc({alg:'RS256',typ:'JWT'});
  const claims=enc({iss:email,scope:ADS_SCOPE,aud:OAUTH_AUD,
    iat:issued-30,exp:issued+3300});
  const input=head+'.'+claims;
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(input));
  const assertion=input+'.'+base64url(new Uint8Array(sig));
  const payload=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion});
  const response=await fetcher(OAUTH_AUD,{method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:payload,signal:AbortSignal.timeout(10000)});
  must(response?.ok,'ADS_SERVICE_ACCOUNT_OAUTH_REJECTED');
  const token=await response.json();
  must(typeof token?.access_token==='string' && token.access_token.length>0 &&
    token.token_type?.toLowerCase()==='bearer',
    'ADS_SERVICE_ACCOUNT_ACCESS_TOKEN_INVALID');
  return token.access_token;
}
