/**
 * Private Ceramic discovery adapter for the central ARCHELAOS Brain.
 * OFF by default. No HTTP handler, Cron Trigger, route, autonomous AI calls,
 * generated public article, or local collection of search results.
 *
 * The caller may only select a public club topic and historical year.
 * A trusted Brain implementation must supply every privileged port.
 */
export const CERAMIC_PROVIDER = 'ceramic';
export const CERAMIC_GATEWAY = 'default';
export const CERAMIC_STATUS = 'OFF';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX=/^[a-f0-9]{64}$/;
const MAX_SHARED_MONTHLY_EUR_MICROS=20_000_000;
const TOPICS=Object.freeze({
  news:'ΓΑΣ Αρχέλαος Κατερίνης αθλητικές ειδήσεις',
  history:'ΓΑΣ Αρχέλαος Κατερίνης ιστορία',
  handball:'ΓΑΣ Αρχέλαος Κατερίνης χάντμπολ',
  athletics:'ΓΑΣ Αρχέλαος Κατερίνης στίβος',
  gymnastics:'ΓΑΣ Αρχέλαος Κατερίνης ενόργανη',
  archery:'ΓΑΣ Αρχέλαος Κατερίνης τοξοβολία',
  shooting:'ΓΑΣ Αρχέλαος Κατερίνης σκοποβολή',
  wrestling:'ΓΑΣ Αρχέλαος Κατερίνης πάλη',
  volleyball:'ΓΑΣ Αρχέλαος Κατερίνης βόλεϊ',
  swimming:'ΓΑΣ Αρχέλαος Κατερίνης κολύμβηση',
  finswimming:'ΓΑΣ Αρχέλαος Κατερίνης τεχνική κολύμβηση',
  weightlifting:'ΓΑΣ Αρχέλαος Κατερίνης άρση βαρών'
});
function exact(o,ks){
  return !!o&&typeof o==='object'&&!Array.isArray(o)&&
    Object.keys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k));
}
function blocked(reason){return {status:'CERAMIC_HELD',reason,searchCalls:0,published:false};}
function validUrl(s){
  if(typeof s!=='string'||s.length>2048)return false;
  try{
    const u=new URL(s);
    return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password&&
      !['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname)&&
      !u.hostname.endsWith('.local');
  }catch{return false;}
}
export function makePublicDiscoveryQuery(command){
  if(!exact(command,['eventId','topic','year'])||!UUID.test(command.eventId)||
    !Object.hasOwn(TOPICS,command.topic)||
    !(command.year===null||(Number.isInteger(command.year)&&
      command.year>=1956&&command.year<=new Date().getUTCFullYear()))) {
    throw new Error('PUBLIC_SEARCH_COMMAND_INVALID');
  }
  // Free-text input is deliberately not accepted: no private source, person name,
  // contact details, Google OAuth tokens or Analytics PII reach the provider.
  return TOPICS[command.topic]+(command.year===null?'':' '+command.year);
}

/** Trusted Cloudflare Worker binding transport; call only after Brain authorization.
 * Cloudflare docs: env.AI.websearch({gatewayId,query,provider,limit}).
 * Returning items is EPHEMERAL. Callers may not cache search Output.
 */
export function createCeramicBindingTransport(ai){
  if(!ai||typeof ai.websearch!=='function')throw new Error('AI_BINDING_UNAVAILABLE');
  return async ({query,limit,provider,gatewayId})=>{
    if(provider!=='ceramic'||gatewayId!=='default'||limit!==5||
      typeof query!=='string'||query.length>1024)throw new Error('CERAMIC_TRANSPORT_POLICY');
    const response=await ai.websearch({gatewayId:'default',query,provider:'ceramic',limit:5});
    if(!response||response.ok!==true||typeof response.json!=='function')
      throw new Error('CERAMIC_PROVIDER_UNCERTAIN');
    const data=await response.json();
    if(!data||!Array.isArray(data.items)||data.items.length>10)
      throw new Error('CERAMIC_PROVIDER_INVALID');
    // No logging, disk writes, state persistence, analytics, or cache here.
    return data.items;
  };
}
/** No provider output is asserted to be a historical fact.
 * Verification must fetch the independent publisher source, not the snippet.
 */
export async function runCeramicDiscovery(command, ports){
  const query=makePublicDiscoveryQuery(command);
  const required=['readControls','readBudget','reserve','search','verifyPrimary','reconcile'];
  if(!ports||required.some(k=>typeof ports[k]!=='function'))
    return blocked('PRIVATE_BRAIN_PORTS_UNAVAILABLE');
  let controls;
  try{controls=await ports.readControls();}
  catch{return blocked('CONTROLS_UNAVAILABLE');}
  if(!exact(controls,['globalPaused','ceramicEnabled','publicDiscoveryEnabled'])||
    controls.globalPaused!==false||controls.ceramicEnabled!==true||
    controls.publicDiscoveryEnabled!==true)
    return blocked('DISABLED_BY_CENTRAL_BRAIN');

  let budget;
  try{budget=await ports.readBudget();}
  catch{return blocked('SHARED_BUDGET_UNAVAILABLE');}
  const fields=['accountVerified','gatewayCreditsVerified','hardStopVerified',
    'monthlyCombinedCapMicroEur','quoteVerified','quoteMicroEur'];
  if(!exact(budget,fields)||budget.accountVerified!==true||
    budget.gatewayCreditsVerified!==true||budget.hardStopVerified!==true||
    budget.quoteVerified!==true||
    !Number.isSafeInteger(budget.monthlyCombinedCapMicroEur)||
    budget.monthlyCombinedCapMicroEur>MAX_SHARED_MONTHLY_EUR_MICROS||
    budget.monthlyCombinedCapMicroEur<=0||
    !Number.isSafeInteger(budget.quoteMicroEur)||budget.quoteMicroEur<=0||
    budget.quoteMicroEur>budget.monthlyCombinedCapMicroEur)
    return blocked('CREDITS_OR_HARD_BILLING_CAP_UNVERIFIED');

  let claim;
  try{
    claim=await ports.reserve({eventId:command.eventId,topic:command.topic,year:command.year,
      provider:'ceramic',gatewayId:'default',maximumBillMicroEur:budget.quoteMicroEur});
  }catch{return blocked('DURABLE_RESERVATION_FAILED');}
  if(!exact(claim,['id','status'])||!UUID.test(claim.id)||claim.status!=='AUTHORIZED')
    return blocked('DUPLICATE_OR_UNKNOWN_RESERVATION');

  let items;
  try{
    items=await ports.search({query,provider:'ceramic',gatewayId:'default',limit:5});
    if(!Array.isArray(items)||items.length>5)throw new Error('UNVERIFIED_SEARCH_RESULT_SHAPE');
  }catch{
    // Search may have been billed even when response failed; never retry blindly.
    try{await ports.reconcile({id:claim.id,state:'UNKNOWN',reason:'SEARCH_OUTCOME_UNCERTAIN'});}
    catch{}
    return {status:'CERAMIC_RECONCILIATION_REQUIRED',searchCalls:'UNKNOWN',published:false};
  }
  let bill;
  try{
    bill=await ports.reconcile({id:claim.id,state:'PROVIDER_ACCEPTED',
      reason:'RECONCILE_AUTHENTIC_PROVIDER_BILLING'});
  }catch{return {status:'CERAMIC_RECONCILIATION_REQUIRED',searchCalls:1,published:false};}
  // A settled receipt is required; provider discovery NEVER counts as a fact.
  if(!exact(bill,['durablyRecorded','actualMicroEur'])||bill.durablyRecorded!==true||
    !Number.isSafeInteger(bill.actualMicroEur)||bill.actualMicroEur<0||
    bill.actualMicroEur>budget.quoteMicroEur)
    return {status:'CERAMIC_RECONCILIATION_REQUIRED',searchCalls:1,published:false};

  const verified=[];
  // Results are used only in memory, for immediate independent source checks.
  for(const item of items){
    if(!item||!validUrl(item.url))continue;
    let primary;
    try{primary=await ports.verifyPrimary(item.url);}
    catch{continue;}
    // This result must be independently validated by a trusted verifier and
    // must not be derived solely from Ceramic output.
    if(!exact(primary,['verified','canonicalUrl','sourceSha256','publisherVerified'])||
      primary.verified!==true||primary.publisherVerified!==true||
      !validUrl(primary.canonicalUrl)||!HEX.test(primary.sourceSha256))
      continue;
    if(!verified.some(x=>x.sourceSha256===primary.sourceSha256))
      verified.push(Object.freeze({canonicalUrl:primary.canonicalUrl,
        sourceSha256:primary.sourceSha256,independentVerification:true}));
  }
  return {status:'CERAMIC_INDEPENDENT_SOURCES_FOR_REVIEW',
    verifiedSources:verified,searchCalls:1,published:false,
    editorialReviewRequired:true,searchOutputStored:false};
}
