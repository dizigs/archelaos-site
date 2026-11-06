/**
 * Future Google Ads READ-ONLY reporting contract.
 * This is deliberately NOT a live provider adapter or an Analytics Worker
 * source: PR #196 does not yet allow "google_ads" and Google Ads credentials,
 * account scope and Brain support have not been independently verified.
 */
const ISO_DATE=/^\d{4}-\d\d-\d\d$/;
const ISO_TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
function invalid(){throw Error('INVALID_GOOGLE_ADS_AGGREGATE');}
function exact(o,fields){
  if(!o||typeof o!=='object'||Array.isArray(o)||
     fields.some(k=>!Object.hasOwn(o,k))||Object.keys(o).some(k=>!fields.includes(k)))invalid();
}
export function validateGoogleAdsContract(report,{enabled=false,verifiedProvider=false}={}){
  if(enabled!==true||verifiedProvider!==true)throw Error('GOOGLE_ADS_DISABLED');
  exact(report,['schemaVersion','source','date','observedAt','metrics']);
  if(report.schemaVersion!==1||report.source!=='google_ads'||
     !ISO_DATE.test(report.date)||Number.isNaN(Date.parse(report.date+'T00:00:00Z'))||
     new Date(report.date+'T00:00:00Z').toISOString().slice(0,10)!==report.date||
     !ISO_TIME.test(report.observedAt)||Number.isNaN(Date.parse(report.observedAt))||
     new Date(report.observedAt).toISOString()!==report.observedAt)invalid();
  exact(report.metrics,['impressions','clicks','costMicros','conversions']);
  for(const k of ['impressions','clicks','costMicros'])
    if(!Number.isSafeInteger(report.metrics[k])||report.metrics[k]<0||report.metrics[k]>1e12)invalid();
  if(report.metrics.clicks>report.metrics.impressions||
     typeof report.metrics.conversions!=='number'||
     !Number.isFinite(report.metrics.conversions)||report.metrics.conversions<0||
     report.metrics.conversions>1e9)invalid();
  // Coarse daily account totals ONLY: no query, term, ad click IDs (gclid),
  // email, IP, location, audience list, campaign names or personal ad data.
  // Google Ads spend reporting is NOT AI budget authorization.
  return {schemaVersion:1,source:'google_ads',period:{from:report.date,to:report.date},
    observedAt:report.observedAt,metrics:{...report.metrics},
    privacy:'ACCOUNT_DAILY_TOTALS_ONLY',billableAiCalls:0};
}
