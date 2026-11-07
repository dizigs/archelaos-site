/**
 * Archelaos Analytics Worker: privacy-safe aggregate contract.
 * All original data stays in the already-authorized collector.
 * No session IDs, cookie IDs, user agents, full URLs, recordings or raw search queries.
 * Every accepted row has an explicit source, period and source artifact hash.
 */
const sources={
  clarity:new Set(['sessions','dead_clicks','rage_clicks','scroll_depth_pct']),
  ga4:new Set(['sessions','users','engaged_sessions','key_events']),
  search_console:new Set(['clicks','impressions','ctr_pct','position']),
  cloudflare_web_analytics:new Set(['visits','page_views'])
};
const limits={scroll_depth_pct:100,ctr_pct:100,position:1000};
const exactly=(o,keys)=>{
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k)))
    throw Error('UNTRUSTED_REPORT_FIELDS');
};
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !Number.isNaN(Date.parse(s+'T00:00:00Z')) &&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const validPath=p=>typeof p==='string'&&/^\/[A-Za-z0-9/_\-.]{0,180}$/.test(p)&&
  !p.includes('..')&&!p.includes('//')&&!p.includes('\\');
const bytes=s=>new TextEncoder().encode(s);
export async function digest(value) {
  const b=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)));
  return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
}
export function normalizeReport(report){
  exactly(report,['schemaVersion','source','reportDigest','period','metrics']);
  if(report.schemaVersion!==1||!Object.hasOwn(sources,report.source)||
      typeof report.reportDigest!=='string'||!/^[a-f0-9]{64}$/.test(report.reportDigest))
    throw Error('UNVERIFIED_SOURCE');
  exactly(report.period,['from','to']);
  const {from,to}=report.period;
  if(!validDate(from)||!validDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>31)
    throw Error('INVALID_PERIOD');
  if(!Array.isArray(report.metrics)||report.metrics.length===0||report.metrics.length>300)
    throw Error('INVALID_METRIC_COUNT');
  const cleaned=[],seen=new Set();
  let suppressed=0;
  for(const row of report.metrics){
    exactly(row,['pagePath','name','value','sampleSize']);
    if(!validPath(row.pagePath))throw Error('INVALID_PAGE_PATH');
    if(!sources[report.source].has(row.name))throw Error('UNAPPROVED_METRIC');
    if(!Number.isFinite(row.value)||row.value<0||row.value>(limits[row.name]??1000000000))
      throw Error('INVALID_MEASUREMENT');
    if(!Number.isSafeInteger(row.sampleSize)||row.sampleSize<0||row.sampleSize>1000000000)
      throw Error('INVALID_SAMPLE');
    const key=row.pagePath+'|'+row.name;
    if(seen.has(key))throw Error('DUPLICATE_MEASUREMENT');
    seen.add(key);
    if(row.sampleSize<20){suppressed++;continue;}
    cleaned.push({pagePath:row.pagePath,name:row.name,value:row.value,sampleSize:row.sampleSize,
      confidence:'AGGREGATE_ONLY_NO_CAUSAL_INFERENCE'});
  }
  return {schemaVersion:1,source:report.source,reportDigest:report.reportDigest,period:{from,to},
    metrics:cleaned,suppressedRows:suppressed,rawVisitorDataStored:false,externalAiCalls:0};
}
export async function buildBrainAnalyticsEvent(report,observedAt){
  if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt))||
     new Date(observedAt).toISOString()!==observedAt)throw Error('INVALID_OBSERVATION_TIMESTAMP');
  const payload=normalizeReport(report);
  const unique=await digest('analytics|'+payload.source+'|'+payload.reportDigest+'|'+payload.period.from+'|'+payload.period.to);
  return {schemaVersion:1,eventId:unique,source:'analytics',type:'aggregate_report_ready',
    sourceRevision:payload.reportDigest,observedAt,correlationId:unique.slice(0,24),payload,
    privacyStatus:'AGGREGATED_ONLY',aiRouting:'CENTRAL_BRAIN_ONLY',publish:false};
}
