/* Cloudflare Pages Function: deploy only after D1, Turnstile and privacy review.
 * Disabled-by-default; no frontend or public release currently invokes this.
 * A submission is an untrusted PENDING suggestion, never an approved fact.
 */
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const kinds=new Set(['person','event','verification_request','general']);
const safeId=(kind,id)=>{
 if(kind==='general')return id==='';
 if(kind==='person')return /^arch-[a-z0-9-]{6,90}$/.test(id);
 if(kind==='event')return /^arc-[a-z0-9-]{8,100}$/.test(id);
 return /^request-[a-z-]{8,100}$/.test(id);
};
const safeUrl=(s)=>{
 if(!s)return '';
 try{
  const u=new URL(s);
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.href.length>650)return null;
  const host=u.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||
     /^(?:127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(host)||
     /^\[?(?:fe80:|fc|fd|::1)/.test(host))return null;
  return u.href;
 }catch{return null}
};
async function limitedJson(request){
 const reader=request.body?.getReader();
 if(!reader)return null;
 const chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>8192){await reader.cancel();return {oversize:true}}
   chunks.push(value);
  }
 }finally{try{reader.releaseLock()}catch{}}
 const buffer=new Uint8Array(size);let start=0;
 for(const chunk of chunks){buffer.set(chunk,start);start+=chunk.byteLength}
 try{return JSON.parse(new TextDecoder().decode(buffer))}catch{return null}
}
async function sha(s){
 const bytes=new TextEncoder().encode(s);
 const buf=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(buf)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function onRequestPost({request,env}){
 if(env?.ENABLE_ARCHIVE_SUGGESTIONS!=='true'||!env.ARCHIVE_DB||!env.TURNSTILE_SECRET||
    !env.ARCHIVE_RATE_SALT||!env.ARCHIVE_TURNSTILE_HOSTNAME)
    return reply(503,{error:'Η online υποβολή δεν είναι ακόμη διαθέσιμη.'});
 const url=new URL(request.url);
 if(url.protocol!=='https:'||request.headers.get('origin')!==url.origin)
   return reply(403,{error:'Μη επιτρεπτή προέλευση αιτήματος.'});
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
   return reply(415,{error:'Μη υποστηριζόμενος τύπος αιτήματος.'});
 if(Number(request.headers.get('content-length')||0)>8192)
   return reply(413,{error:'Υπερβολικά μεγάλο αίτημα.'});
 const data=await limitedJson(request);
 if(data?.oversize)return reply(413,{error:'Υπερβολικά μεγάλο αίτημα.'});
 if(!data||typeof data!=='object'||Array.isArray(data))return reply(400,{error:'Μη έγκυρα δεδομένα.'});
 const kind=data.kind,recordId=data.record_id,description=data.description;
 if(!kinds.has(kind)||typeof recordId!=='string'||!safeId(kind,recordId)||
    typeof description!=='string'||description.trim().length<30||
    description.trim().length>1200||/[\u0000-\u0008\u000b-\u001f]/.test(description))
   return reply(400,{error:'Συμπληρώστε αναγνωριστικό και περιγραφή τουλάχιστον 30 χαρακτήρων.'});
 if(typeof data.public_source_url!=='string')return reply(400,{error:'Απαιτείται πεδίο πηγής.'});
 const source=safeUrl(data.public_source_url.trim());
 if(source===null)return reply(400,{error:'Η δημόσια διεύθυνση της πηγής δεν είναι έγκυρη.'});
 const token=data.turnstile_token;
 if(typeof token!=='string'||token.length<8||token.length>2048)
   return reply(400,{error:'Απαιτείται έλεγχος κατά ανεπιθύμητων υποβολών.'});
 const clientIp=request.headers.get('cf-connecting-ip')||'';
 if(!clientIp)return reply(403,{error:'Δεν ήταν δυνατή η επαλήθευση της υποβολής.'});
 let verification;
 try{
  const p=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token,remoteip:clientIp});
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
   method:'POST',body:p,headers:{'content-type':'application/x-www-form-urlencoded'},
   signal:AbortSignal.timeout(8000)
  });
  if(!result.ok)throw Error('siteverify unavailable');
  verification=await result.json();
 }catch{return reply(503,{error:'Η επαλήθευση δεν είναι προσωρινά διαθέσιμη.'})}
 if(!verification?.success||verification.action!=='archive_suggestion'||
    verification.hostname!==env.ARCHIVE_TURNSTILE_HOSTNAME)
   return reply(403,{error:'Η επαλήθευση ασφαλείας δεν ήταν επιτυχής.'});
 const minute=Math.floor(Date.now()/60000),ipHash=await sha(env.ARCHIVE_RATE_SALT+'|'+clientIp);
 const payloadHash=await sha(kind+'|'+recordId+'|'+description.trim().toLocaleLowerCase()+'|'+source);
 try{
  // Transactionally lock each rate bucket using SQLite conflict updates.
  const ticket=await env.ARCHIVE_DB.prepare(
   'INSERT INTO archive_rate_buckets(ip_hash, minute, hits) VALUES (?1,?2,1) '+
   'ON CONFLICT(ip_hash,minute) DO UPDATE SET hits=hits+1 WHERE hits<5 RETURNING hits'
  ).bind(ipHash,minute).first();
  if(!ticket)return reply(429,{error:'Πολλές υποβολές. Δοκιμάστε αργότερα.'});
  const id=crypto.randomUUID();
  const result=await env.ARCHIVE_DB.prepare(
   'INSERT OR IGNORE INTO archive_suggestions '+
   '(id,kind,record_id,description,public_source_url,content_hash,status,created_at) '+
   'VALUES (?1,?2,?3,?4,?5,?6,?7,?8)'
  ).bind(id,kind,recordId,description.trim(),source,payloadHash,'pending',new Date().toISOString()).run();
  if(!result.meta?.changes)return reply(202,{status:'already_received'});
  return reply(201,{status:'pending_review',reference:id});
 }catch{
  return reply(503,{error:'Η καταχώριση απέτυχε. Δεν αποθηκεύσαμε επιβεβαιωμένο γεγονός.'});
 }
}
