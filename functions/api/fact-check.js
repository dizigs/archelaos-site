/* Cloudflare Pages: anonymous pending-only historical source intake.
   Never store IP, identity/session metadata, score, or publish visitor responses. */
const SITEKEY='0x4AAAAAAFoyKwIFuvMbrcAd';
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validClaim=x=>typeof x==='string'&&/^TF(?:00[1-9]|0[1-5][0-9]|06[01])$/.test(x);
const validReceipt=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const clean=(x,max)=>typeof x==='string'&&x.length<=max?x.replace(/[\u0000-\u001f\u007f]/g,' ').trim():null;
export async function onRequestGet({env}){
 let ready=false;
 if(env?.FACTCHECK_DB&&env?.TURNSTILE_SECRET){
  try{const row=await env.FACTCHECK_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='factcheck_responses' LIMIT 1").first();ready=Boolean(row);}
  catch{ready=false;}
 }
 return json(200,{ready,sitekey:SITEKEY});
}
async function boundedJSON(request){
 const reader=request.body?.getReader();if(!reader)return null;
 const chunks=[];let bytes=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
   if(bytes>6000){await reader.cancel();return {oversize:true};}
   chunks.push(value);
  }
 }finally{try{reader.releaseLock();}catch{}}
 const body=new Uint8Array(bytes);let at=0;
 for(const c of chunks){body.set(c,at);at+=c.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{return null;}
}
async function verifyTurnstile(token,request,secret){
 if(typeof token!=='string'||token.length<1||token.length>2048)return false;
 try{
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret,response:token})});
  if(!result.ok)return false;
  const data=await result.json();
  return data.success===true&&data.hostname===new URL(request.url).hostname&&data.action==='fact_check';
 }catch{return false;}
}
export async function onRequestPost({request,env}){
 if(!env?.FACTCHECK_DB||!env?.TURNSTILE_SECRET)return json(503,{ok:false,error:'unavailable'});
 const target=new URL(request.url);
 if(target.protocol!=='https:'||request.headers.get('Origin')!==target.origin)return json(403,{ok:false,error:'forbidden'});
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return json(415,{ok:false,error:'content_type'});
 if(Number(request.headers.get('Content-Length')||0)>6000)return json(413,{ok:false,error:'too_large'});
 const data=await boundedJSON(request);
 if(data?.oversize)return json(413,{ok:false,error:'too_large'});

 // Fast card flow: a single verified Turnstile token can save up to four
 // already-selected responses. Existing single-response clients stay compatible.
 if(Array.isArray(data?.answers)){
  const input=data.answers;
  if(data.catalogVersion!==1||input.length<1||input.length>4||
     new Set(input.map(x=>x?.claimId)).size!==input.length||
     new Set(input.map(x=>x?.receipt)).size!==input.length)
   return json(400,{ok:false,error:'invalid_batch'});
  const entries=[];
  for(const item of input){
   if(!item||typeof item!=='object'||Array.isArray(item)||!validClaim(item.claimId)||
      !['true','false','unknown'].includes(item.choice)||!validReceipt(item.receipt))
    return json(400,{ok:false,error:'invalid_claim'});
   const evidence=clean(item.evidence===undefined?'':item.evidence,600);
   const referenceUrl=clean(item.referenceUrl===undefined?'':item.referenceUrl,350);
   if(evidence===null||referenceUrl===null)return json(400,{ok:false,error:'invalid_fields'});
   if(referenceUrl){try{
    const u=new URL(referenceUrl),host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||host==='localhost'||
       host.endsWith('.local')||host.endsWith('.internal')||
       /^(127\\.|10\\.|192\\.168\\.|169\\.254\\.|0\\.)/.test(host))
      return json(400,{ok:false,error:'invalid_url'});
   }catch{return json(400,{ok:false,error:'invalid_url'});}}
   entries.push({claimId:item.claimId,choice:item.choice,receipt:item.receipt,evidence,referenceUrl});
  }
  if(!await verifyTurnstile(data.turnstileToken,request,env.TURNSTILE_SECRET))
   return json(403,{ok:false,error:'verification_failed'});
  try{
   const insert=[];
   for(const item of entries){
    const existing=await env.FACTCHECK_DB.prepare(
     'SELECT claim_id,choice,evidence,reference_url FROM factcheck_responses WHERE receipt=?'
    ).bind(item.receipt).first();
    if(existing){
     if(existing.claim_id!==item.claimId||existing.choice!==item.choice||
        existing.evidence!==item.evidence||existing.reference_url!==item.referenceUrl)
      return json(409,{ok:false,error:'receipt_conflict'});
    }else insert.push(item);
   }
   if(insert.length){
    // D1 batch is atomic; no per-card round trips and no extra Turnstile challenge per card.
    const statements=insert.map(item=>env.FACTCHECK_DB.prepare(
     'INSERT OR IGNORE INTO factcheck_responses (receipt,claim_id,choice,evidence,reference_url) VALUES (?,?,?,?,?)'
    ).bind(item.receipt,item.claimId,item.choice,item.evidence,item.referenceUrl));
    const results=await env.FACTCHECK_DB.batch(statements);
    if(!Array.isArray(results)||results.length!==insert.length)throw Error('batch_failed');
    // Race-safe final receipt validation; never report success on an unconfirmed write.
    for(const item of insert){
     const actual=await env.FACTCHECK_DB.prepare(
      'SELECT claim_id,choice,evidence,reference_url FROM factcheck_responses WHERE receipt=?'
     ).bind(item.receipt).first();
     if(!actual||actual.claim_id!==item.claimId||actual.choice!==item.choice||
        actual.evidence!==item.evidence||actual.reference_url!==item.referenceUrl)
      return json(409,{ok:false,error:'receipt_conflict'});
    }
   }
   return json(insert.length?201:202,{ok:true,accepted:entries.length,duplicate:!insert.length});
  }catch{return json(503,{ok:false,error:'storage_unavailable'});}
 }

 if(!data||typeof data!=='object'||Array.isArray(data)||!validClaim(data.claimId)||
    !['true','false','unknown'].includes(data.choice)||data.catalogVersion!==1||!validReceipt(data.receipt))
  return json(400,{ok:false,error:'invalid_claim'});
 const evidence=clean(data.evidence===undefined?'':data.evidence,1200);
 const url=clean(data.referenceUrl===undefined?'':data.referenceUrl,500);
 if(evidence===null||url===null)return json(400,{ok:false,error:'invalid_fields'});
 if(url){try{
  const value=new URL(url),host=value.hostname.toLowerCase();
  if(value.protocol!=='https:'||value.username||value.password||host==='localhost'||
    host.endsWith('.local')||host.endsWith('.internal')||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host))return json(400,{ok:false,error:'invalid_url'});
 }catch{return json(400,{ok:false,error:'invalid_url'});}}
 if(!await verifyTurnstile(data.turnstileToken,request,env.TURNSTILE_SECRET))
  return json(403,{ok:false,error:'verification_failed'});
 try{
  const receipt=data.receipt;
  const result=await env.FACTCHECK_DB.prepare(
   'INSERT OR IGNORE INTO factcheck_responses (receipt,claim_id,choice,evidence,reference_url) VALUES (?,?,?,?,?)'
  ).bind(receipt,data.claimId,data.choice,evidence,url).run();
  if(result.meta?.changes===0){
   const earlier=await env.FACTCHECK_DB.prepare(
    'SELECT claim_id,choice,evidence,reference_url FROM factcheck_responses WHERE receipt=?'
   ).bind(receipt).first();
   if(!earlier||earlier.claim_id!==data.claimId||earlier.choice!==data.choice||
      earlier.evidence!==evidence||earlier.reference_url!==url)return json(409,{ok:false,error:'receipt_conflict'});
   return json(202,{ok:true,receipt,duplicate:true});
  }
  return json(201,{ok:true,receipt});
 }catch{return json(503,{ok:false,error:'storage_unavailable'});}
}
