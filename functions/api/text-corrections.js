/* Public text-correction intake. Disabled unless explicitly enabled after D1,
 * Turnstile, GDPR, moderation and verified staging are configured.
 * No AI, auto-publishing, outbound URL fetching or second coordinator. */
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers});
const kinds=new Set(['person','news','story','moment','view','interview','match','photo']);
const ready=env=>env?.ENABLE_TEXT_CORRECTIONS==='true'&&env.ARCHIVE_DB&&env.TURNSTILE_SECRET&&
 env.ARCHIVE_RATE_SALT&&env.ARCHIVE_TURNSTILE_HOSTNAME&&env.TEXT_CORRECTIONS_SITE_KEY;
export function onRequestGet({env}){
 const active=Boolean(ready(env));
 return response(200,{enabled:active,siteKey:active?env.TEXT_CORRECTIONS_SITE_KEY:null});
}
async function readJson(request){
 const reader=request.body?.getReader();if(!reader)return null;
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>8192){await reader.cancel();return {oversize:true}}chunks.push(value)}}
 finally{try{reader.releaseLock()}catch{}}
 const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.byteLength}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all))}catch{return null}
}
async function sha(value){
 const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(h)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function publicUrl(value){
 if(value==='')return '';
 try{
  const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||value.length>650)return null;
  const host=u.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||
     /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)||
     /^(?:\[?::1|\[?fc|\[?fd|\[?fe80)/.test(host))return null;
  return u.href;
 }catch{return null}
}
const plain=(s,min,max)=>typeof s==='string'&&s.trim().length>=min&&s.trim().length<=max&&
 !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s);
export async function onRequestPost({request,env}){
 if(!ready(env))return response(503,{error:'Η υποβολή διορθώσεων δεν έχει ενεργοποιηθεί.'});
 const target=new URL(request.url);
 if(target.protocol!=='https:'||request.headers.get('origin')!==target.origin)
  return response(403,{error:'Μη επιτρεπτή προέλευση.'});
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
  return response(415,{error:'Μη έγκυρος τύπος δεδομένων.'});
 if(Number(request.headers.get('content-length')||0)>8192)return response(413,{error:'Πολύ μεγάλο αίτημα.'});
 const data=await readJson(request);
 if(data?.oversize)return response(413,{error:'Πολύ μεγάλο αίτημα.'});
 if(!data||typeof data!=='object'||Array.isArray(data))return response(400,{error:'Μη έγκυρη υποβολή.'});
 const kind=data.record_kind,id=data.record_id,title=data.record_title,description=data.description,
  excerpt=data.text_excerpt,sourcePage=data.source_page;
 if(!kinds.has(kind)||typeof id!=='string'||!/^[a-zA-Z0-9._:-]{1,170}$/.test(id)||
    !plain(title,1,180)||!plain(description,10,1200)||!plain(excerpt,0,500)||
    typeof data.public_source_url!=='string'||typeof sourcePage!=='string')
  return response(400,{error:'Ελέγξτε το κείμενο, τον τίτλο και την καταχώριση.'});
 let page;
 try{page=new URL(sourcePage)}catch{return response(400,{error:'Μη έγκυρη σελίδα.'})}
 if(page.origin!==target.origin||page.username||page.password||page.hash||
    sourcePage.length>650||!/^\/(?:[a-z0-9-]+\.html|people\/[a-z0-9-]+\.html)?$/i.test(page.pathname))
  return response(400,{error:'Η σελίδα δεν ανήκει στο αρχείο.'});
 const source=publicUrl(data.public_source_url.trim());
 if(source===null)return response(400,{error:'Μη έγκυρη δημόσια πηγή.'});
 const token=data.turnstile_token;
 if(typeof token!=='string'||token.length<8||token.length>2048)return response(400,{error:'Απαιτείται έλεγχος ασφαλείας.'});
 const ip=request.headers.get('cf-connecting-ip');
 if(!ip)return response(403,{error:'Η επαλήθευση ασφαλείας απέτυχε.'});
 let verification;
 try{
  const body=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token,remoteip:ip});
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
   {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(8000)});
  if(!result.ok)throw Error('siteverify');
  verification=await result.json();
 }catch{return response(503,{error:'Ο έλεγχος ασφαλείας δεν είναι διαθέσιμος.'})}
 if(verification?.success!==true||verification.hostname!==env.ARCHIVE_TURNSTILE_HOSTNAME||
    verification.action!=='text_correction')return response(403,{error:'Ο έλεγχος ασφαλείας απέτυχε.'});
 try{
  const ipHash=await sha(env.ARCHIVE_RATE_SALT+'|text_correction|'+ip);
  const minute=Math.floor(Date.now()/60000);
  const rate=await env.ARCHIVE_DB.prepare(
   'INSERT INTO text_correction_rate(ip_hash,minute,hits) VALUES (?1,?2,1) '+
   'ON CONFLICT(ip_hash,minute) DO UPDATE SET hits=hits+1 WHERE hits<5 RETURNING hits'
  ).bind(ipHash,minute).first();
  if(!rate)return response(429,{error:'Πάρα πολλές υποβολές. Προσπαθήστε αργότερα.'});
  const digest=await sha(kind+'|'+id+'|'+description.trim().toLowerCase()+'|'+source);
  const snapshotHash=await sha(excerpt||title);
  const ref=crypto.randomUUID();
  const result=await env.ARCHIVE_DB.prepare(
   'INSERT OR IGNORE INTO text_corrections '+
   '(id,record_kind,record_id,record_title,source_page,text_excerpt,snapshot_hash,description,public_source_url,content_hash,status,created_at) '+
   'VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)'
  ).bind(ref,kind,id,title.trim(),page.href,excerpt.trim(),snapshotHash,description.trim(),source,digest,'pending',new Date().toISOString()).run();
  return result.meta?.changes?response(201,{status:'pending_review',reference:ref}):
    response(202,{status:'already_received'});
 }catch{return response(503,{error:'Η καταχώριση δεν επιβεβαιώθηκε. Δεν αλλάξαμε το δημόσιο αρχείο.'})}
}