// ARCHELAOS Raisely Bridge — phase 1: strictly read-only fundraising API observer.
// No access to donations, donor records, payments, campaign updates or arbitrary URLs.
const RAISELY_API = 'https://api.raisely.com/v3';
const CAMPAIGN_PATH = 'archelaos-katerini';
const MAX_BYTES = 100_000;

function respond(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'referrer-policy':'no-referrer',
    },
  });
}

function checkSecret(expected, bearer) {
  if (typeof expected !== 'string' || expected.length < 32 ||
      typeof bearer !== 'string' || !bearer.startsWith('Bearer ')) return false;
  const actual = bearer.slice(7);
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i=0; i<actual.length; i++) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

async function limitedJson(url, apiKey, fetcher) {
  const signal = AbortSignal.timeout(9000);
  const res = await fetcher(url, {
    method:'GET',
    redirect:'manual',
    signal,
    headers: {
      Authorization:`Bearer ${apiKey}`,
      Accept:'application/json',
      'User-Agent':'archelaos-raisely-bridge',
    },
  });
  if (!res.ok || res.status>=300) throw new Error('RAISELY_UNAVAILABLE');
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('RAISELY_UNAVAILABLE');
  const reader = res.body?.getReader();
  if (!reader) throw new Error('RAISELY_UNAVAILABLE');
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error('RAISELY_UNAVAILABLE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  const joined = new Uint8Array(total);
  let start=0;
  for (const chunk of chunks) {joined.set(chunk,start); start+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(joined));
}

export function sanitizeCampaigns(document) {
  if (!document || !Array.isArray(document.data)) throw new Error('RAISELY_SCHEMA');
  const campaign = document.data.find(c => c?.path === CAMPAIGN_PATH);
  if (!campaign) throw new Error('CAMPAIGN_MISSING');
  return {
    path:campaign.path,
    name:typeof campaign.name === 'string' ? campaign.name : null,
    currency:typeof campaign.currency === 'string' ? campaign.currency : null,
    goal:typeof campaign.goal === 'number' ? campaign.goal : null,
    mode:typeof campaign.mode === 'string' ? campaign.mode : null,
    // Intentionally never relay campaign.config, branding assets, or private custom fields.
  };
}

export async function audit(env, fetcher=fetch) {
  if (typeof env?.RAISELY_API_KEY !== 'string' || !env.RAISELY_API_KEY)
    throw new Error('NOT_CONFIGURED');
  // Verify token identity with Raisely and then read only this campaign.
  const auth = await limitedJson(`${RAISELY_API}/authenticate`,env.RAISELY_API_KEY,fetcher);
  if (!auth || typeof auth !== 'object' || auth.errors) throw new Error('RAISELY_UNAVAILABLE');
  const query = new URLSearchParams({path:CAMPAIGN_PATH,limit:'3',private:'true',pruneConfig:'true'});
  const data = await limitedJson(`${RAISELY_API}/campaigns?${query}`,env.RAISELY_API_KEY,fetcher);
  return {status:'authenticated',campaign:sanitizeCampaigns(data)};
}

export default {
  async fetch(req,env) {
    let path;
    try {path = new URL(req.url).pathname;} catch {return respond({error:'NOT_FOUND'},404);}
    if (req.method !== 'GET') return respond({error:'NOT_FOUND'},404);
    if (path === '/health') return respond({service:'archelaos-raisely-bridge',status:'deployed'});
    if (path !== '/check') return respond({error:'NOT_FOUND'},404);
    if (!checkSecret(env?.RAISELY_CHECK_KEY,req.headers.get('authorization')||''))
      return respond({error:'NOT_FOUND'},404);
    if (!env?.RAISELY_API_KEY) return respond({status:'not_configured'},503);
    try { return respond(await audit(env)); }
    catch { return respond({status:'unavailable'},503); }
  },
};
