/**
 * Code-only bridge for the already-existing private GitHub Actions exports.
 * It never calls a provider, creates a schedule, or exposes an HTTP endpoint.
 * Its trustedLookup port must read GitHub's authoritative run AND artifact,
 * extract the private archive, and hash the *exact* JSON bytes it returns.
 */
import { buildBrainAnalyticsEvent, digest } from '../../analytics-worker/src/aggregate.mjs';

const SOURCE = Object.freeze({
  google_bundle: {workflow:'Google Search and GA4 daily aggregate', artifact:'google-search-ga4-private-report',
    path:'.github/workflows/google-analytics-aggregate.yml'},
  clarity: {workflow:'Clarity daily private aggregate report', artifact:'clarity-private-aggregate-report',
    path:'.github/workflows/clarity-daily-export.yml'}
});
const SHA=/^[0-9a-f]{64}$/;
const COMMIT=/^[0-9a-f]{40}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/;
const DATE=/^\d{4}-\d\d-\d\d$/;
const MAX_BYTES=256*1024;
const DAY=86400000;
function fail(code){throw new Error(code);}
// GitHub timestamps normally use seconds with Z; Python UTC timestamps use
// six fractional digits with +00:00. Accept only actual UTC instants.
function utcTime(value,code) {
  if(typeof value!=='string'||!ISO.test(value)||!Number.isFinite(Date.parse(value))||
     new Date(value).toISOString().slice(0,10)!==value.slice(0,10))fail(code);
  return new Date(value).getTime();
}
function object(x,keys,code='UNEXPECTED_FIELDS'){
  if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!keys.includes(k)))fail(code);
}
function date(s) {
  if(typeof s!=='string'||!DATE.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z'))||
    new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail('INVALID_REPORT_DATE');
  return s;
}
function integer(n){if(!Number.isSafeInteger(n)||n<0||n>1e9)fail('INVALID_COUNT');return n;}
function number(n,max=1e9){if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>max)fail('INVALID_VALUE');return n;}
function within(d,from,to){if(d<from||d>to)fail('DATE_OUTSIDE_REPORTED_RANGE');}
function rowsForGoogle(data,hash) {
  object(data,['generated_utc','search_console','ga4']);
  const results=[];
  for(const [source,part,allowed,make] of [
    ['ga4',data.ga4,['date','activeUsers','sessions','pageViews'],r=>{
      const users=integer(r.activeUsers);
      integer(r.sessions); integer(r.pageViews);
      return [{pagePath:'/',name:'users',value:users,sampleSize:users},
        {pagePath:'/',name:'sessions',value:r.sessions,sampleSize:users}];
    }],
    ['search_console',data.search_console,['date','clicks','impressions','ctr','position'],r=>{
      const impressions=integer(r.impressions);
      integer(r.clicks);
      if(r.clicks>impressions)fail('INVALID_GSC_COUNTS');
      // Site-level impressions are a *volume proxy*, not a count of unique visitors.
      // Search query, location, device, page URL and person dimensions are absent.
      const ctr=number(r.ctr,1),position=number(r.position,1000);
      return [{pagePath:'/',name:'clicks',value:r.clicks,sampleSize:impressions},
        {pagePath:'/',name:'impressions',value:impressions,sampleSize:impressions},
        {pagePath:'/',name:'ctr_pct',value:ctr*100,sampleSize:impressions},
        {pagePath:'/',name:'position',value:position,sampleSize:impressions}];
    }]
  ]) {
    object(part,['range','daily']);
    object(part.range,['startDate','endDate']);
    const from=date(part.range.startDate),to=date(part.range.endDate);
    if(to<from||(Date.parse(to)-Date.parse(from))/DAY>31)fail('INVALID_REPORT_RANGE');
    if(!Array.isArray(part.daily)||part.daily.length>32)fail('INVALID_DAILY_ROWS');
    const seen=new Set();
    for(const row of part.daily){
      object(row,allowed);
      let day=row.date;
      if(source==='ga4'&&typeof day==='string'&&/^\d{8}$/.test(day))
        day=day.slice(0,4)+'-'+day.slice(4,6)+'-'+day.slice(6);
      day=date(day);within(day,from,to);
      if(seen.has(day))fail('DUPLICATE_DAILY_ROW'); seen.add(day);
      results.push({schemaVersion:1,source,reportDigest:hash,
        period:{from:day,to:day},metrics:make(row)});
    }
  }
  return results;
}
function rowsForClarity(data,hash) {
  object(data,['date_utc','range','breakdown','metrics']);
  const day=date(data.date_utc);
  if(data.range!=='previous 24 hours'||data.breakdown!=='Device'||
     !Array.isArray(data.metrics)||data.metrics.length>30)fail('INVALID_CLARITY_FORMAT');
  const perDevice=new Map();
  for(const group of data.metrics) {
    object(group,['metric','rows']);
    if(typeof group.metric!=='string'||group.metric.length>64||
       !Array.isArray(group.rows)||group.rows.length>15)fail('INVALID_CLARITY_GROUP');
    for(const row of group.rows) {
      object(row,['Device','totalSessionCount','totalBotSessionCount','distantUserCount',
        'PagesPerSessionPercentage','scrollDepth','engagementTime','deadClickCount',
        'rageClickCount','quickbackClickCount','scriptErrorCount','errorClickCount','excessiveScrollCount']);
      if(!['Desktop','Mobile','Tablet','Other'].includes(row.Device))fail('UNKNOWN_DEVICE');
      const old=perDevice.get(row.Device)??{};
      for(const [k,v] of Object.entries(row)) {
        if(k==='Device')continue;
        const n=number(v,k==='scrollDepth'?100:1e9);
        if(Object.hasOwn(old,k)&&old[k]!==n)fail('AMBIGUOUS_CLARITY_BREAKDOWN');
        old[k]=n;
      }
      perDevice.set(row.Device,old);
    }
  }
  // Do not release granular device cohorts. Drop devices with fewer than 20
  // sessions (including if a denominator is absent); never invent one.
  const safe=[...perDevice.values()].filter(x=>Number.isSafeInteger(x.totalSessionCount)&&x.totalSessionCount>=20);
  if(safe.length===0)return [];
  const metrics=[];
  function sum(name,field){
    const withValue=safe.filter(x=>Object.hasOwn(x,field));
    if(withValue.length!==safe.length)return; // incomplete data is not zero
    const count=withValue.reduce((a,x)=>a+x[field],0);
    const size=withValue.reduce((a,x)=>a+x.totalSessionCount,0);
    if(!Number.isSafeInteger(count)||count>1e9||size>1e9)fail('CLARITY_COUNT_OUT_OF_RANGE');
    metrics.push({pagePath:'/',name,value:count,sampleSize:size});
  }
  sum('sessions','totalSessionCount');
  sum('dead_clicks','deadClickCount');
  sum('rage_clicks','rageClickCount');
  if(safe.every(x=>Object.hasOwn(x,'scrollDepth'))) {
    const size=safe.reduce((n,x)=>n+x.totalSessionCount,0);
    const value=safe.reduce((n,x)=>n+x.totalSessionCount*x.scrollDepth,0)/size;
    metrics.push({pagePath:'/',name:'scroll_depth_pct',value,sampleSize:size});
  }
  return metrics.length?[{schemaVersion:1,source:'clarity',reportDigest:hash,
    // Exporter provides a UTC reporting date and rolling-24-hour window, NOT
    // calendar-day boundaries. No cross-day summation is permitted.
    period:{from:day,to:day},metrics}]:[];
}
function bytesOf(bytes){
  if(typeof bytes==='string')bytes=new TextEncoder().encode(bytes);
  if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>MAX_BYTES)
    fail('INVALID_PRIVATE_ARTIFACT_BYTES');
  return bytes;
}
function checkEvidence(e,source,runId,artifactId,hash,now) {
  object(e,['run','artifact','verifiedContentSha256']);
  const spec=SOURCE[source];
  object(e.run,['id','repository','workflow','workflowPath','headBranch','headSha','event','status','conclusion','completedAt']);
  object(e.artifact,['id','name','runId','expired']);
  const x=e.run, a=e.artifact;
  if(x.id!==runId||a.id!==artifactId||a.runId!==runId||
     x.repository!=='dizigs/archelaos-site'||x.workflow!==spec.workflow||
     x.workflowPath!==spec.path||x.headBranch!=='main'||!COMMIT.test(x.headSha)||
     !['schedule','workflow_dispatch'].includes(x.event)||x.status!=='completed'||
     x.conclusion!=='success'||a.name!==spec.artifact||a.expired!==false||
     !SHA.test(e.verifiedContentSha256)||e.verifiedContentSha256!==hash)
    fail('UNVERIFIED_ARTIFACT_PROVENANCE');
  const completed=utcTime(x.completedAt,'STALE_OR_INVALID_PROVENANCE');
  if(completed>now+300000||completed<now-7*DAY)
    fail('STALE_OR_INVALID_PROVENANCE');
}
export async function preparePrivateExport({source,artifactBytes,runId,artifactId,trustedLookup,now=Date.now()}) {
  if(!Object.hasOwn(SOURCE,source)||!Number.isSafeInteger(runId)||runId<=0||
     !Number.isSafeInteger(artifactId)||artifactId<=0||typeof trustedLookup!=='function')
    fail('UNTRUSTED_PROVIDER_PORT');
  const bytes=bytesOf(artifactBytes);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  let evidence;
  try { evidence=await trustedLookup({source,runId,artifactId,expectedArtifact:SOURCE[source].artifact});}
  catch {fail('PROVENANCE_LOOKUP_UNAVAILABLE');}
  checkEvidence(evidence,source,runId,artifactId,hash,now);
  let json;
  try {json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch {fail('INVALID_AGGREGATE_JSON');}
  const generated=source==='google_bundle'?json?.generated_utc:evidence.run.completedAt;
  const generatedMs=utcTime(generated,'INVALID_GENERATED_TIMESTAMP');
  if(generatedMs>now+300000||generatedMs<now-7*DAY)
    fail('INVALID_GENERATED_TIMESTAMP');
  const reports=source==='google_bundle'?rowsForGoogle(json,hash):rowsForClarity(json,hash);
  if(reports.length===0)fail('NO_VERIFIABLE_AGGREGATE_ROWS');
  const events=[];
  for(const report of reports) {
    const event=await buildBrainAnalyticsEvent(report,new Date(evidence.run.completedAt).toISOString());
    // A fully suppressed cohort is not an Analytics event. Never hand off
    // an empty GA4/GSC snapshot (even when its source artifact was valid).
    if (event.payload.metrics.length === 0) continue;
    events.push({event,snapshotKey:report.source+'|'+report.period.from+'|'+report.period.to,
      metricRevision:await digest(JSON.stringify(event.payload.metrics))});
  }
  if (events.length === 0) fail('NO_VERIFIABLE_AGGREGATE_ROWS');
  return {schemaVersion:1,verified:true,evidence:{
    repository:'dizigs/archelaos-site',runId,artifactId,runSha:evidence.run.headSha,
    reportDigest:hash,workflow:SOURCE[source].workflow,observedAt:new Date(evidence.run.completedAt).toISOString()
  },events};
}
/**
 * Must be backed by a separately verified authenticated Brain Service Binding,
 * a durable source+period UPSERT/replay ledger, independently verified signed
 * receipt AND independently verified durable snapshot readback.
 * The merged Brain currently lacks an analytics v1 capability; default is OFF.
 */
export async function deliverToBrain(prepared,brainPort){
  if(!prepared?.verified||!Array.isArray(prepared.events)||!prepared.events.length ||
     typeof brainPort?.capabilities!=='function'||typeof brainPort?.submitSnapshot!=='function'||
     typeof brainPort?.verifyReceipt!=='function'||typeof brainPort?.readbackSnapshot!=='function'||
     typeof brainPort?.verifyReadback!=='function')fail('BRAIN_ANALYTICS_NOT_CONFIGURED');
  let cap;
  try{cap=await brainPort.capabilities();}
  catch{fail('BRAIN_CAPABILITY_UNAVAILABLE');}
  if(cap?.version!=='analytics.aggregate.v1'||cap?.authenticatedServiceBinding!==true||
     cap?.durableSnapshotUpsert!==true||cap?.receiptSignatureVerification!==true||
     cap?.immutableReceiptReadback!==true)
    fail('BRAIN_ANALYTICS_CAPABILITY_UNVERIFIED');
  const receipts=[];
  for(const record of prepared.events){
    const request={schemaVersion:1,event:record.event,snapshotKey:record.snapshotKey,
      metricRevision:record.metricRevision,evidence:prepared.evidence,operation:'UPSERT_NOT_INCREMENT'};
    let ack;
    try{ack=await brainPort.submitSnapshot(request);}
    catch{fail('BRAIN_DELIVERY_UNCERTAIN_RECONCILE_REQUIRED');}
    if(ack?.eventId!==record.event.eventId||ack?.snapshotKey!==record.snapshotKey||
       ack?.metricRevision!==record.metricRevision||!['ACCEPTED','DUPLICATE','UPDATED'].includes(ack?.status)||
       ack?.durable!==true||typeof ack?.receiptId!=='string'||ack.receiptId.length<8||
       ack.receiptId.length>100)fail('UNVERIFIED_BRAIN_RECEIPT');
    let valid=false;
    try{valid=await brainPort.verifyReceipt(ack,request)===true;}
    catch{valid=false;}
    if(!valid)fail('UNVERIFIED_BRAIN_RECEIPT');
    // An ACK alone does not prove the committed snapshot survived a restart.
    // Read back from the authoritative Brain store; fail closed on uncertainty.
    let stored;
    try {stored=await brainPort.readbackSnapshot({receiptId:ack.receiptId,
      eventId:record.event.eventId,snapshotKey:record.snapshotKey});}
    catch {fail('BRAIN_READBACK_UNCERTAIN_RECONCILE_REQUIRED');}
    if(stored?.receiptId!==ack.receiptId||stored?.eventId!==record.event.eventId||
       stored?.snapshotKey!==record.snapshotKey||stored?.metricRevision!==record.metricRevision||
       stored?.reportDigest!==prepared.evidence.reportDigest||
       stored?.source!==record.event.payload.source||stored?.correlationId!==record.event.correlationId||
       stored?.durable!==true)fail('UNVERIFIED_BRAIN_READBACK');
    let readbackValid=false;
    try {readbackValid=await brainPort.verifyReadback(stored,request,ack)===true;}
    catch {readbackValid=false;}
    if(!readbackValid)fail('UNVERIFIED_BRAIN_READBACK');
    receipts.push({receiptId:ack.receiptId,snapshotKey:ack.snapshotKey,status:ack.status,
      readbackVerified:true});
  }
  return {delivered:receipts.length,receipts};
}
