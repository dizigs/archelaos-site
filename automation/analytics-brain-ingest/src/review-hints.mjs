/**
 * Read-only, deterministic anomaly/review hints from the approved site-wide
 * aggregates. No AI inference, third-party calls or autonomous optimization.
 * Clarity is a rolling 24h window; comparing UTC report labels is advisory.
 */
const KNOWN=new Set(['ga4','search_console','clarity','cloudflare_web_analytics']);
const METRICS=new Set(['sessions','users','engaged_sessions','key_events',
  'clicks','impressions','ctr_pct','position','dead_clicks','rage_clicks',
  'scroll_depth_pct','visits','page_views']);
const DAY=86400000;
const fail=()=>{throw Error('INVALID_REVIEW_SNAPSHOT');};
function parseDay(value) {
  if(typeof value!=='string'||!(/^\d{4}-\d{2}-\d{2}$/).test(value))fail();
  const t=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==value)fail();
  return t;
}
function approved(payload) {
  if(!payload||payload.schemaVersion!==1||!KNOWN.has(payload.source)||
     payload.rawVisitorDataStored!==false||payload.externalAiCalls!==0||
     !payload.period||!Array.isArray(payload.metrics)||payload.metrics.length>300)
    fail();
  const from=parseDay(payload.period.from),to=parseDay(payload.period.to);
  if(from>to||to-from>31*DAY)fail();
  const metrics=new Map();
  for(const row of payload.metrics){
    if(row?.pagePath!=='/'||!METRICS.has(row.name)||
       !Number.isFinite(row.value)||row.value<0||row.value>1e9||
       !Number.isSafeInteger(row.sampleSize)||row.sampleSize<20||
       metrics.has(row.name))fail();
    metrics.set(row.name,row);
  }
  return {from,to,metrics};
}
export function reviewOnlyHints({current,previous}={}) {
  if(!current||!previous||current.source!==previous.source)fail();
  const a=approved(current),b=approved(previous);
  if(a.from<=b.to||a.to-b.to>14*DAY)fail();
  const hints=[];
  const volume=new Set(['sessions','users','clicks','impressions','visits','page_views','engaged_sessions']);
  const friction=new Set(['dead_clicks','rage_clicks']);
  for(const [metric,row] of a.metrics) {
    const prev=b.metrics.get(metric);
    if(!prev||Math.min(prev.sampleSize,row.sampleSize)<20||prev.value<=0)continue;
    if(!volume.has(metric)&&!friction.has(metric))continue;
    const abs=Math.abs(row.value-prev.value);
    const delta=(row.value-prev.value)/prev.value;
    const down=volume.has(metric)&&prev.value>=20&&delta<=-0.5&&abs>=10;
    const up=friction.has(metric)&&delta>=1&&abs>=10;
    if(!down&&!up)continue;
    hints.push({metric,signal:down?'VOLUME_DROP':'FRICTION_INCREASE',
      direction:down?'DOWN':'UP',changePct:Math.round(delta*100),
      advisoryOnly:true,action:'REVIEW_ONLY_NO_AUTOMATIC_CHANGES'});
  }
  return {schemaVersion:1,source:current.source,mode:'REVIEW_ONLY',
    from:current.period.from,to:current.period.to,
    comparison:current.source==='clarity'?'ROLLING_24H_NOT_CALENDAR_DAY':'DAILY_SNAPSHOT',
    causalClaim:false,automaticOptimization:false,
    hints:hints.slice(0,12)};
}
