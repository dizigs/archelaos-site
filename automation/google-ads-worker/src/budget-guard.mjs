import {adsAccessToken, stagingReady} from './google-ads-api.mjs';
import {scopedName} from './contract.mjs';

const requireSafe=(condition,code)=>{if(!condition)throw Error(code);};
const micros=value=>{
  requireSafe(typeof value==='string' && /^(0|[1-9]\d{0,14})$/.test(value),'ADS_BUDGET_NUMERIC_INVALID');
  const n=Number(value);
  requireSafe(Number.isSafeInteger(n),'ADS_BUDGET_NUMERIC_INVALID');
  return n;
};
const USD_MICROS=1000000;
const MONTHLY_LIMIT=10000*USD_MICROS;
const DAILY_LIMIT=329*USD_MICROS;
const dateParts=now=>{
  const date=new Date(now);
  requireSafe(Number.isFinite(date.getTime()),'INVALID_AUDIT_TIME');
  const year=date.getUTCFullYear(),month=date.getUTCMonth()+1;
  return {daysInMonth:new Date(Date.UTC(year,month,0)).getUTCDate()};
};

/** Read-only GAQL inventory. No offline fixture, inferred spend or cached account status. */
export async function readAccountBudget(env,{fetcher=fetch}={}){
  requireSafe(stagingReady(env) && env?.ADS_BUDGET_AUDIT_READ_ENABLED==='true',
    'ADS_BUDGET_AUDIT_DISABLED');
  const customer=env.ADS_CUSTOMER_ID;
  const token=await adsAccessToken(env,fetcher);
  const endpoint='https://googleads.googleapis.com/v26/customers/'+customer+'/googleAds:searchStream';
  async function query(gaql){
    const response=await fetcher(endpoint,{method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer '+token,
        ...(env.ADS_LOGIN_CUSTOMER_ID?{'login-customer-id':env.ADS_LOGIN_CUSTOMER_ID}:{})},
      body:JSON.stringify({query:gaql})});
    requireSafe(response.ok,'ADS_BUDGET_AUDIT_API_REJECTED');
    const chunks=await response.json();
    requireSafe(Array.isArray(chunks)&&chunks.length<=50,'ADS_BUDGET_AUDIT_INCOMPLETE');
    const rows=[];
    for(const chunk of chunks){
      requireSafe((chunk.results===undefined || Array.isArray(chunk.results)) && !chunk.nextPageToken,
        'ADS_BUDGET_AUDIT_INCOMPLETE');
      rows.push(...(chunk.results||[]));
      requireSafe(rows.length<=500,'ADS_BUDGET_AUDIT_TOO_LARGE');
    }
    return rows;
  }
  const account=await query('SELECT customer.id, customer.status, customer.currency_code, customer.test_account, customer.manager FROM customer');
  const budgets=await query('SELECT campaign_budget.resource_name, campaign_budget.status, campaign_budget.period, campaign_budget.amount_micros FROM campaign_budget');
  const campaigns=await query("SELECT campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.status != 'REMOVED'");
  const month=await query('SELECT metrics.cost_micros FROM customer WHERE segments.date DURING THIS_MONTH');
  const today=await query('SELECT metrics.cost_micros FROM customer WHERE segments.date DURING TODAY');
  requireSafe(account.length===1&&month.length===1&&today.length===1,'ADS_ACCOUNT_AUDIT_INCOMPLETE');
  const a=account[0].customer;
  requireSafe(String(a?.id)===customer && a?.status==='ENABLED' &&
    a?.currencyCode==='USD' && a?.testAccount===false && a?.manager===false,
    'ADS_GRANTS_ACCOUNT_NOT_VERIFIED');
  requireSafe(campaigns.every(row=>row.campaign?.advertisingChannelType==='SEARCH'),
    'ADS_NON_SEARCH_CAMPAIGN_PRESENT');
  const inventory=[];
  for(const row of budgets){
    const b=row.campaignBudget;
    requireSafe(b?.status==='REMOVED'||b?.status==='ENABLED','ADS_BUDGET_STATUS_UNKNOWN');
    if(b.status==='REMOVED')continue;
    scopedName(customer,'budget',b.resourceName);
    requireSafe(b.period==='DAILY','ADS_NON_DAILY_BUDGET');
    const amountMicros=micros(b.amountMicros);
    requireSafe(amountMicros>0,'ADS_BUDGET_NUMERIC_INVALID');
    inventory.push({resourceName:b.resourceName,amountMicros});
  }
  const names=new Set(inventory.map(b=>b.resourceName));
  requireSafe(names.size===inventory.length,'ADS_DUPLICATE_BUDGET');
  return {source:'GOOGLE_ADS_API_GAQL',customerId:customer,currency:'USD',
    observedAt:new Date().toISOString(),budgets:inventory,
    spentMonthMicros:micros(month[0].metrics?.costMicros),
    spentTodayMicros:micros(today[0].metrics?.costMicros),
    activeCampaignsReviewed:campaigns.length,actualSpendObserved:true};
}

/** Fail closed on any unobserved account-wide spending or daily budgets. */
export function assertGrantBudget(snapshot,operation,now=Date.now()){
  requireSafe(snapshot?.source==='GOOGLE_ADS_API_GAQL'&&snapshot?.currency==='USD'&&
    snapshot?.actualSpendObserved===true&&/^\d{10}$/.test(snapshot.customerId||'')&&
    Array.isArray(snapshot.budgets)&&snapshot.budgets.length<=500,
    'ADS_ACCOUNT_BUDGET_UNVERIFIED');
  const age=now-Date.parse(snapshot.observedAt);
  requireSafe(Number.isFinite(age)&&age>=-1500&&age<=120000,'ADS_BUDGET_AUDIT_STALE');
  const {daysInMonth}=dateParts(now);
  const dailyConservative=Math.min(DAILY_LIMIT,Math.floor(MONTHLY_LIMIT/daysInMonth));
  let total=0;
  const byName=new Map();
  for(const b of snapshot.budgets){
    scopedName(snapshot.customerId,'budget',b.resourceName);
    requireSafe(Number.isSafeInteger(b.amountMicros)&&b.amountMicros>0 &&
      !byName.has(b.resourceName),'ADS_BUDGET_INVENTORY_INVALID');
    byName.set(b.resourceName,b.amountMicros);
    total+=b.amountMicros;
  }
  requireSafe(Number.isSafeInteger(snapshot.spentMonthMicros)&&snapshot.spentMonthMicros>=0&&
    Number.isSafeInteger(snapshot.spentTodayMicros)&&snapshot.spentTodayMicros>=0,
    'ADS_ACTUAL_SPEND_UNVERIFIED');
  requireSafe(snapshot.spentMonthMicros<=MONTHLY_LIMIT &&
    snapshot.spentTodayMicros<=DAILY_LIMIT,'ADS_GRANTS_SPEND_LIMIT_BREACHED');
  requireSafe(operation&&typeof operation==='object','ADS_OPERATION_MISSING');
  if(operation.kind==='budget'&&operation.action==='create'){
    requireSafe(Number.isSafeInteger(operation.input?.amountMicros)&&operation.input.amountMicros>0,
      'ADS_PROPOSED_BUDGET_INVALID');
    total+=operation.input.amountMicros;
  }else if(operation.kind==='budget'&&operation.action==='updateBudget'){
    const name=operation.input?.resourceName;
    scopedName(snapshot.customerId,'budget',name);
    requireSafe(byName.has(name)&&Number.isSafeInteger(operation.input?.amountMicros),
      'ADS_BUDGET_NOT_IN_ACCOUNT');
    total+=operation.input.amountMicros-byName.get(name);
  }else if(operation.kind==='campaign'&&operation.action==='create'){
    scopedName(snapshot.customerId,'budget',operation.input?.campaignBudget);
    requireSafe(byName.has(operation.input.campaignBudget),'ADS_BUDGET_NOT_IN_ACCOUNT');
  }
  requireSafe(total<=dailyConservative,'ADS_ACCOUNT_WIDE_BUDGET_EXCEEDED');
  requireSafe(snapshot.spentMonthMicros<MONTHLY_LIMIT&&snapshot.spentTodayMicros<DAILY_LIMIT,
    'ADS_GRANTS_SPEND_LIMIT_REACHED');
  return {source:snapshot.source,currency:'USD',actualSpendObserved:true,
    accountDailyBudgetUsd:(total/USD_MICROS).toFixed(2),
    todaySpendUsd:(snapshot.spentTodayMicros/USD_MICROS).toFixed(2),
    thisMonthSpendUsd:(snapshot.spentMonthMicros/USD_MICROS).toFixed(2),
    conservativeDailyLimitUsd:(dailyConservative/USD_MICROS).toFixed(2),
    grantMonthlyLimitUsd:'10000.00',aiBudgetLedger:'SEPARATE_EUR_20'};
}
