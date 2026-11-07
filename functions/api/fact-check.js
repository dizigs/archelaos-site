/* Cloudflare Pages Function. Anonymous, moderated research leads. No public vote totals.
   Do not persist IP, session IDs, or personal profiles. */
const SITEKEY='0x4AAAAAAFoyKwIFuvMbrcAd';
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function onRequestGet({env}){return json(200,{ready:Boolean(env.FACTCHECK_DB&&env.TURNSTILE_SECRET),sitekey:SITEKEY});}
const validClaim=x=>typeof x==='string'&&/^TF0(?:[0-5][0-9]|6[01])$/.test(x);
const clean=(x,max)=>typeof x==='string'&&x.length<=max?x.replace(/[\u0000-\u001F\u007F]/g,' ').trim():null;
async function verify(token,request,secret){if(typeof token!=='string'||token.length<1||token.length>2048)return false;try{const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret,response:token})});if(!r.ok)return false;const data=await r.json();return data.success===true&&data.hostname===new URL(request.url).hostname&&data.action==='fact_check';}catch{return false;}}
export async function onRequestPost({request,env}){
 if(!env.FACTCHECK_DB||!env.TURNSTILE_SECRET)return json(503,{ok:false,error:'unavailable'});
 if(request.headers.get('Origin')!==new URL(request.url).origin)return json(403,{ok:false,error:'forbidden'});
 if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return json(415,{ok:false,error:'content_type'});
 if(Number(request.headers.get('Content-Length')||0)>6000)return json(413,{ok:false,error:'too_large'});
 let data;try{const raw=await request.text();if(raw.length>6000)return json(413,{ok:false,error:'too_large'});data=JSON.parse(raw);}catch{return json(400,{ok:false,error:'invalid_json'});}
 if(!data||typeof data!=='object'||Array.isArray(data)||!validClaim(data.claimId)||!['true','false','unknown'].includes(data.choice))return json(400,{ok:false,error:'invalid_claim'});
 const evidence=clean(data.evidence||'',1200),url=clean(data.referenceUrl||'',500);
 if(evidence===null||url===null)return json(400,{ok:false,error:'invalid_fields'});
 if(url){try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return json(400,{ok:false,error:'invalid_url'});}catch{return json(400,{ok:false,error:'invalid_url'});}}
 if(!await verify(data.turnstileToken,request,env.TURNSTILE_SECRET))return json(403,{ok:false,error:'verification_failed'});
 try{const receipt=crypto.randomUUID();await env.FACTCHECK_DB.prepare('INSERT INTO factcheck_responses (receipt,claim_id,choice,evidence,reference_url) VALUES (?,?,?,?,?)').bind(receipt,data.claimId,data.choice,evidence,url).run();return json(201,{ok:true,receipt});}catch{return json(503,{ok:false,error:'storage_unavailable'});}
}
