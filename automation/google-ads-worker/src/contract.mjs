/**
 * Google Ad Grants -- strict offline planning and API operation contracts.
 * Existing editorial drafts / policy checks live in PR #70; this executor never
 * converts an unverified draft into a serving ad.
 */
export const MAX_DAILY_USD = 329;
const PATH = /^https:\/\/(?:www\.)?archelaos\.club\/(?:index|tmimata|contact|history|hall-of-fame|70-stigmes|stories|interviews)\.html$/;
const RESOURCE = Object.freeze({
  budget: 'campaignBudgets',
  campaign: 'campaigns',
  adGroup: 'adGroups',
  rsa: 'adGroupAds',
  keyword: 'adGroupCriteria'
});
const requireTrue = (ok, code) => { if (!ok) throw Error(code); };
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
export function allowedLanding(url) { return typeof url === 'string' && PATH.test(url); }
export function scopedName(customer, service, value) {
  requireTrue(/^\d{10}$/.test(customer), 'INVALID_CUSTOMER');
  requireTrue(own(RESOURCE, service), 'INVALID_SERVICE');
  const s=RESOURCE[service];
  requireTrue(typeof value==='string' && new RegExp('^customers/'+customer+'/'+s+'/\\d+(?:~\\d+)?$').test(value),'FOREIGN_RESOURCE');
  return value;
}
export function dailyBudget(draft, month='2026-11') {
  requireTrue(/^\d{4}-(0[1-9]|1[0-2])$/.test(month),'INVALID_MONTH');
  requireTrue(Array.isArray(draft?.campaigns) && draft.campaigns.length > 0 && draft.campaigns.length <= 10, 'INVALID_CAMPAIGNS');
  const [year,number]=month.split('-').map(Number);
  const days=new Date(Date.UTC(year,number,0)).getUTCDate();
  const cents=Math.min(32900,Math.floor(1000000/days));
  const units=draft.campaigns.map((c,i)=>({
    name:c.name, dailyUsd:((Math.floor(cents/draft.campaigns.length)+(i<cents%draft.campaigns.length?1:0))/100).toFixed(2)
  }));
  return {currency:'USD', grantMonthlyCapUsd:10000, grantDailyCapUsd:329,
    plannedDailyUsd:(cents/100).toFixed(2), daysInMonth:days,
    monthMaxUsd:(cents*days/100).toFixed(2), allocations:units,
    nonImportable:true, actualSpendUsd:null};
}
const unique = arr => new Set(arr.map(s=>s.trim().toLocaleLowerCase('el'))).size===arr.length;
export function validateDraft(draft, evidence={}, month='2026-11') {
  requireTrue(draft?.mode==='dry-run' && draft.importable===false && draft.budgets===null &&
    draft.network==='SEARCH_ONLY_DRAFT', 'UNSAFE_EDITORIAL_DRAFT');
  requireTrue(Array.isArray(draft.campaigns) && draft.campaigns.length>=1 && draft.campaigns.length<=10,'INVALID_CAMPAIGNS');
  const blockers=new Set(['GOOGLE_AD_GRANTS_ACCOUNT_UNVERIFIED','ADS_API_AUTH_UNVERIFIED',
    'GOOGLE_POLICY_REVIEW_REQUIRED','GOOGLE_ADS_STAGING_UNVERIFIED','ADS_WRITE_DISABLED']);
  const pages=[];
  for (const c of draft.campaigns) {
    requireTrue(typeof c.name==='string' && c.name.length<=255,'INVALID_CAMPAIGN');
    requireTrue(Array.isArray(c.ad_groups) && c.ad_groups.length>=2,'AD_GROUP_STRUCTURE');
    for (const g of c.ad_groups) {
      requireTrue(typeof g.name==='string' && g.name.length>0 && g.name.length<=255,'INVALID_AD_GROUP');
      requireTrue(allowedLanding(g.landing),'UNTRUSTED_LANDING');
      const check=evidence[g.landing];
      const verified=!!check && check.httpStatus===200 && check.approved===true &&
        Number.isFinite(Date.parse(check.checkedAt)) &&
        Date.now()-Date.parse(check.checkedAt)<=86400000 && Date.parse(check.checkedAt)<=Date.now();
      if(!verified) blockers.add('LANDING_NOT_VERIFIED');
      pages.push({url:g.landing,verified});
      requireTrue(Array.isArray(g.phrase_keywords) && g.phrase_keywords.length>=2 &&
        g.phrase_keywords.every(k=>typeof k==='string' && k.trim().split(/\s+/).length>=2 &&
          k.length<=80 && !/[<>]/.test(k)) && unique(g.phrase_keywords), 'KEYWORD_POLICY_REVIEW');
      requireTrue(Array.isArray(g.rsa_drafts) && g.rsa_drafts.length>=1,'MISSING_RSA');
      for(const a of g.rsa_drafts){
        requireTrue(Array.isArray(a.headlines) && a.headlines.length>=3 && a.headlines.length<=15 &&
          unique(a.headlines) && a.headlines.every(x=>typeof x==='string' && x.length>0 && x.length<=30), 'INVALID_HEADLINES');
        requireTrue(Array.isArray(a.descriptions) && a.descriptions.length>=2 && a.descriptions.length<=4 &&
          unique(a.descriptions) && a.descriptions.every(x=>typeof x==='string' && x.length>0 && x.length<=90), 'INVALID_DESCRIPTIONS');
      }
      if (g.requires_verified_program_availability) blockers.add('ACADEMY_AVAILABILITY_UNVERIFIED');
    }
  }
  return {schemaVersion:1,source:'pr-70-editorial-draft',sourceRef:'rebuild/ads/campaigns.draft.json',
    draftMode:true,readyForLive:false,blockers:[...blockers].sort((a,b)=>a.localeCompare(b)),
    pages, budget:dailyBudget(draft,month),
    campaigns:draft.campaigns.map(c=>({name:c.name,adGroups:c.ad_groups.map(g=>({
      name:g.name,landing:g.landing,keywords:g.phrase_keywords.map(text=>({text,matchType:'PHRASE',plannerVerified:false})),
      ads:g.rsa_drafts.map(ad=>({headlines:ad.headlines,descriptions:ad.descriptions}))
    }))}))};
}
export function validateAnalytics(aggregate) {
  requireTrue(aggregate?.schemaVersion===1 && aggregate.privacyStatus==='AGGREGATED_ONLY' &&
      aggregate.type==='aggregate_report_ready' && aggregate.payload?.rawVisitorDataStored===false,'UNTRUSTED_ANALYTICS');
  const p=aggregate.payload;
  requireTrue(Object.keys(aggregate).every(k=>['schemaVersion','eventId','source','type','sourceRevision','observedAt','correlationId','payload','privacyStatus','aiRouting','publish'].includes(k)) &&
    Object.keys(p).every(k=>['schemaVersion','source','reportDigest','period','metrics','suppressedRows','rawVisitorDataStored','externalAiCalls'].includes(k)),
    'RAW_OR_UNAPPROVED_ANALYTICS');
  requireTrue(typeof p.reportDigest==='string' && /^[a-f0-9]{64}$/.test(p.reportDigest) &&
    Array.isArray(p.metrics) && p.metrics.length<=300,'INVALID_ANALYTICS');
  requireTrue(p.metrics.every(m=>m&&typeof m==='object'&&!Array.isArray(m) &&
    Object.keys(m).every(k=>['pagePath','name','value','sampleSize','confidence'].includes(k)) &&
    typeof m.pagePath==='string' && /^\/[a-zA-Z0-9/_\-.]{0,180}$/.test(m.pagePath) &&
    Number.isInteger(m.sampleSize) && m.sampleSize>=20 && Number.isFinite(m.value) && m.value>=0 &&
    ['sessions','users','engaged_sessions','key_events','clicks','impressions','ctr_pct','position','visits','page_views','dead_clicks','rage_clicks','scroll_depth_pct'].includes(m.name)),
    'RAW_OR_UNAPPROVED_ANALYTICS');
  return {source:p.source,artifactDigest:p.reportDigest,period:p.period,
    hints:p.metrics.filter(m=>['clicks','impressions','key_events','engaged_sessions'].includes(m.name)).map(m=>({
      page:m.pagePath,metric:m.name,count:m.value,
      action:'REVIEW_ONLY_NO_CAUSAL_INFERENCE'
    })),autoChange:false};
}
export function descriptor(kind,action,input,customer) {
  requireTrue(/^\d{10}$/.test(customer),'INVALID_CUSTOMER');
  requireTrue(own(RESOURCE,kind),'UNKNOWN_ADS_KIND');
  requireTrue(['create','pause','updateBudget'].includes(action),'UNKNOWN_ACTION');
  requireTrue(input && typeof input==='object' && !Array.isArray(input),'INVALID_INPUT');
  const service=RESOURCE[kind];
  let operation;
  if(action==='create') {
    if(kind==='budget'){
      requireTrue(/^[\p{L}\p{N} _-]{3,100}$/u.test(input.name) && Number.isSafeInteger(input.amountMicros) &&
          input.amountMicros>0 && input.amountMicros<=329000000,'UNSAFE_BUDGET');
      operation={create:{name:input.name,amountMicros:String(input.amountMicros),explicitlyShared:false}};
    } else if(kind==='campaign'){
      scopedName(customer,'budget',input.campaignBudget);
      requireTrue(typeof input.name==='string' && input.name.length>=3 && input.name.length<=255,'INVALID_NAME');
      // v26 requires an EU political-ads self-declaration for EU targeting.
      // Never infer or silently default the operator's declaration.
      requireTrue(input.containsEuPoliticalAdvertising==='DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        'EU_POLITICAL_DECLARATION_REQUIRED');
      operation={create:{name:input.name,status:'PAUSED',advertisingChannelType:'SEARCH',
        containsEuPoliticalAdvertising:input.containsEuPoliticalAdvertising,
        campaignBudget:input.campaignBudget,networkSettings:{targetGoogleSearch:true,targetSearchNetwork:false,
          targetContentNetwork:false,targetPartnerSearchNetwork:false},manualCpc:{}}};
    } else if(kind==='adGroup'){
      scopedName(customer,'campaign',input.campaign);
      requireTrue(typeof input.name==='string' && input.name.length>=3 && input.name.length<=255,'INVALID_NAME');
      operation={create:{name:input.name,campaign:input.campaign,status:'PAUSED',type:'SEARCH_STANDARD'}};
    } else if(kind==='keyword'){
      scopedName(customer,'adGroup',input.adGroup);
      requireTrue(typeof input.text==='string' && input.text.trim().split(/\s+/).length>=2 &&
        input.text.length<=80 && ['PHRASE','EXACT'].includes(input.matchType),'UNSAFE_KEYWORD');
      operation={create:{adGroup:input.adGroup,status:'PAUSED',
        keyword:{text:input.text,matchType:input.matchType}}};
    } else if(kind==='rsa'){
      scopedName(customer,'adGroup',input.adGroup);
      requireTrue(allowedLanding(input.finalUrl),'UNTRUSTED_LANDING');
      const h=input.headlines,d=input.descriptions;
      requireTrue(Array.isArray(h)&&h.length>=3&&h.length<=15&&unique(h)&&
        h.every(v=>typeof v==='string'&&v.length>0&&v.length<=30)&&
        Array.isArray(d)&&d.length>=2&&d.length<=4&&unique(d)&&
        d.every(v=>typeof v==='string'&&v.length>0&&v.length<=90),'UNSAFE_RSA');
      operation={create:{adGroup:input.adGroup,status:'PAUSED',ad:{type:'RESPONSIVE_SEARCH_AD',
        finalUrls:[input.finalUrl],responsiveSearchAd:{
          headlines:h.map(text=>({text})),descriptions:d.map(text=>({text}))
        }}}};
    }
  } else {
    requireTrue(kind==='campaign' || kind==='adGroup' || kind==='rsa' || kind==='keyword' ||
      (kind==='budget' && action==='updateBudget'), 'UNSUPPORTED_UPDATE');
    const resourceName=scopedName(customer,kind,input.resourceName);
    if(action==='pause') operation={update:{resourceName,status:'PAUSED'},updateMask:'status'};
    else {
      requireTrue(kind==='budget' && Number.isSafeInteger(input.amountMicros) &&
        input.amountMicros>0&&input.amountMicros<=329000000,'UNSAFE_BUDGET');
      operation={update:{resourceName,amountMicros:String(input.amountMicros)},updateMask:'amount_micros'};
    }
  }
  return {kind,action,customer,method:'POST',endpoint:'https://googleads.googleapis.com/v26/customers/'+customer+'/'+service+':mutate',
    body:{operations:[operation],partialFailure:false,validateOnly:true}};
}
