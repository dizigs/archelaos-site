// Operator-only UptimeRobot adapter. Isolated from Google Apps Script and legacy routes.
const H={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const TARGETS=[
 ['Αρχική','https://archelaos.club/'],
 ['Νέα','https://archelaos.club/news.html'],
 ['Αναζήτηση','https://archelaos.club/search.html'],
 ['Hall of Fame','https://archelaos.club/hall-of-fame.html'],
 ['Τμήματα','https://archelaos.club/tmimata.html'],
 ['News JSON','https://archelaos.club/news.json'],
 ['Hall of Fame JSON','https://archelaos.club/hall-of-fame-people.json'],
 ['Ψηφιακό Μουσείο','https://archelaos.club/history.html'],
 ['70 Στιγμές','https://archelaos.club/70-stigmes.html'],
 ['Πλήρες Χρονολόγιο','https://archelaos.club/events/index.html'],
 ['Επικοινωνία','https://archelaos.club/contact.html']
];
function out(code,status=200,extra={}){return Response.json({code,...extra},{status,headers:H});}
async function equalSecret(got,expected){
 if(typeof expected!=='string'||expected.length<48||!/^Bearer [A-Za-z0-9_-]{48,128}$/.test(got||''))return false;
 const e=new TextEncoder(),[a,b]=await Promise.all([crypto.subtle.digest('SHA-256',e.encode(got.slice(7))),crypto.subtle.digest('SHA-256',e.encode(expected))]);
 const A=new Uint8Array(a),B=new Uint8Array(b);let x=0;for(let i=0;i<A.length;i++)x|=A[i]^B[i];return x===0;
}
async function readCapped(stream,limit,tooLargeCode){
 if(!stream)return '';
 const reader=stream.getReader(),parts=[];
 let count=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   count+=value.byteLength;
   if(count>limit){
    void reader.cancel().catch(()=>{});
    throw new Error(tooLargeCode);
   }
   parts.push(value);
  }
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(count);
 let pos=0;
 for(const part of parts){bytes.set(part,pos);pos+=part.byteLength}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
async function remote(env,path,method='GET',body){
 const timer=AbortSignal.timeout(10000);
 const res=await fetch('https://api.uptimerobot.com/v3'+path,{method,redirect:'manual',signal:timer,
 headers:{authorization:'Bearer '+env.UPTIMEROBOT_MAIN_API_KEY,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})});
 if(!res.ok)throw new Error('UPTIME_HTTP_'+res.status);
 if(Number(res.headers.get('content-length')||0)>200000)throw new Error('UPTIME_TOO_LARGE');
 const text=await readCapped(res.body,200000,'UPTIME_TOO_LARGE');
 try{return JSON.parse(text)}catch{throw new Error('UPTIME_BAD_JSON')}
}
function items(v){if(Array.isArray(v))return v;if(Array.isArray(v?.data?.items))return v.data.items;if(Array.isArray(v?.data))return v.data;if(Array.isArray(v?.items))return v.items;throw new Error('UPTIME_UNEXPECTED_SHAPE')}
function canon(s){try{const u=new URL(s);u.hash='';return u.href.replace(/\/$/,'')}catch{return ''}}
async function inventory(env){const r=await remote(env,'/monitors?limit=200');if(r.nextLink||r.data?.nextLink)throw new Error('UPTIME_PAGINATION_REQUIRED');return items(r)}
function settingsMatch(m,contactId){
 const codes=m.successHttpResponseCodes;
 const alerts=Array.isArray(m.assignedAlertContacts)?m.assignedAlertContacts:[];
 return String(m.type).toUpperCase()==='HTTP'
  &&Number(m.interval)===300
  &&String(m.httpMethodType).toUpperCase()==='GET'
  &&Array.isArray(codes)&&codes.length===1&&codes[0]==='2xx'
  &&String(m.status).toUpperCase()!=='PAUSED'
  &&alerts.some(c=>Number(c.alertContactId??c.id??c.alertContact?.id)===contactId);
}

// Public, bounded read-only summary of ONLY the eleven pre-existing public
// site URLs. Never expose arbitrary provider records, IDs, contacts or secrets.
// Cloudflare's edge cache and per-isolate coalescing bound upstream API calls.
let publicSummaryInFlight=null;
let publicFailureUntil=0;
async function publicMonitorStatus(request,env,url){
 if(request.method!=='GET')return out('METHOD_NOT_ALLOWED',405);
 if(url.search)return out('UNSUPPORTED_QUERY',400);
 if(!env?.UPTIMEROBOT_MAIN_API_KEY)return out('UPTIME_NOT_CONFIGURED',503);
 const cache=globalThis.caches?.default;
 if(!cache)return out('UPTIME_CACHE_UNAVAILABLE',503);
 const cacheKey=new Request(request.url);
 try{
  const hit=await cache.match(cacheKey);
  if(hit)return hit;
  if(Date.now()<publicFailureUntil)return out('UPTIME_STATUS_UNAVAILABLE',503);
  if(!publicSummaryInFlight){
   publicSummaryInFlight=(async()=>{
    const all=await inventory(env);
    const states=new Set(['UP','DOWN','LOOKS_DOWN','STARTED','PAUSED']);
    const targets=TARGETS.map(([label,target])=>{
     const found=all.filter(m=>canon(m?.url)===canon(target));
     const raw=found.length===1?String(found[0].status).toUpperCase():'';
     return {label,url:target,present:found.length===1,
      status:found.length===0?'MISSING':found.length>1?'DUPLICATE':states.has(raw)?raw:'UNKNOWN'};
    });
    const response=Response.json({
     code:'UPTIME_PUBLIC_STATUS',checkedAt:new Date().toISOString(),
     expected:TARGETS.length,configured:targets.filter(t=>t.present).length,targets
    },{headers:{...H,'cache-control':'public, max-age=120, s-maxage=120'}});
    await cache.put(cacheKey,response.clone());
    return response;
   })().finally(()=>{publicSummaryInFlight=null});
  }
  return (await publicSummaryInFlight).clone();
 }catch{
  publicFailureUntil=Date.now()+30000;
  return out('UPTIME_STATUS_UNAVAILABLE',503);
 }
}

export async function handleUptimeMonitor(request,env){
 const url=new URL(request.url);if(url.pathname==='/api/uptimerobot/public-status')return publicMonitorStatus(request,env,url);
 if(url.pathname!=='/api/uptimerobot/status'&&url.pathname!=='/api/uptimerobot/ensure')return null;
 if(url.search)return out('UNSUPPORTED_QUERY',400);
 const status=url.pathname.endsWith('/status');if(request.method!==(status?'GET':'POST'))return out('METHOD_NOT_ALLOWED',405);
 if(!env?.UPTIMEROBOT_MAIN_API_KEY||!env?.UPTIMEROBOT_OPERATOR_TOKEN)return out('UPTIME_NOT_CONFIGURED',503);
 if(!(await equalSecret(request.headers.get('authorization'),env.UPTIMEROBOT_OPERATOR_TOKEN)))return out('UNAUTHORIZED',401);
 if(!status){
  if(Number(request.headers.get('content-length')||0)>128)return out('INVALID_REQUEST',413);
  let input;
  try{input=await readCapped(request.body,128,'INVALID_REQUEST_TOO_LARGE')}
  catch{return out('INVALID_REQUEST',413)}
  let parsed;try{parsed=JSON.parse(input)}catch{return out('INVALID_REQUEST',400)}
  if(parsed?.scope!=='core-v1'||Object.keys(parsed).length!==1)return out('INVALID_SCOPE',400);
 }
 try{
  const all=await inventory(env);
  const matches=TARGETS.map(([label,target])=>({label,target,found:all.filter(m=>canon(m.url)===canon(target))}));
  if(status)return out('UPTIME_STATUS',200,{monitorCount:all.length,targets:matches.map(m=>({label:m.label,url:m.target,found:m.found.length,ids:m.found.map(x=>x.id),statuses:m.found.map(x=>x.status)}))});
  if(matches.some(m=>m.found.length>1))return out('DUPLICATE_EXISTING_MONITORS',409,{duplicates:matches.filter(m=>m.found.length>1).map(m=>m.target)});
  const missing=matches.filter(m=>!m.found.length);
  if(all.length+missing.length>50)return out('MONITOR_PLAN_CAPACITY',409,{existing:all.length,needed:missing.length});

  const contacts=items(await remote(env,'/user/alert-contacts'));
  const contact=contacts.find(c=>String(c?.type).toLowerCase()==='email'&&String(c?.status).toLowerCase()==='active'&&Number.isSafeInteger(Number(c?.id))&&Number(c?.id)>0);
  if(!contact)return out('NO_ACTIVE_EMAIL_ALERT_CONTACT',409,{needed:missing.length});
  const drift=matches.filter(m=>m.found.length===1&&!settingsMatch(m.found[0],Number(contact.id)));
  if(drift.length)return out('EXISTING_MONITOR_DRIFT',409,{urls:drift.map(m=>m.target)});
  if(!missing.length)return out('UPTIME_ALREADY_CONFIGURED',200,{created:[],existing:matches.map(m=>m.target)});
  const created=[];
  for(const item of missing){
   const r=await remote(env,'/monitors','POST',{type:'HTTP',url:item.target,friendlyName:'ARCHELAOS | '+item.label,interval:300,timeout:30,httpMethodType:'GET',successHttpResponseCodes:['2xx'],assignedAlertContacts:[{alertContactId:Number(contact.id),threshold:0,recurrence:0}]});
   const monitorId=Number(r?.id??r?.data?.id??r?.monitor?.id);
   if(!Number.isSafeInteger(monitorId)||monitorId<=0)throw new Error('UPTIME_INVALID_CREATE_RESPONSE');
   created.push({url:item.target,id:monitorId});
  }
  return out('UPTIME_ENSURE_ACCEPTED',200,{created,existing:matches.filter(m=>m.found.length).map(m=>m.target),notificationContactConfigured:true});
 }catch(error){const e=String(error?.message||'UPTIME_FAILURE');return out(/^UPTIME_[A-Z0-9_]+$/.test(e)?e:'UPTIME_FAILURE',502)}
}
