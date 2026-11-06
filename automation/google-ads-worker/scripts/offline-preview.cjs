'use strict';
/* Reuse PR #70 as-is, read-only. The output is an inert, non-importable preview. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../../..');
const core=require(path.join(root,'rebuild/ads/ad_grants_core.js'));
const draft=JSON.parse(fs.readFileSync(path.join(root,'rebuild/ads/campaigns.draft.json'),'utf8'));
(async()=>{
  const {allowedLanding,validateDraft}=await import(pathToFileURL(path.join(__dirname,'../src/contract.mjs')).href);
  for(const campaign of draft.campaigns)
    for(const group of campaign.ad_groups){
      assert.equal(core.allowedUrl(group.landing),true,'PR70 core must approve landing');
      assert.equal(allowedLanding(group.landing),true,'worker must approve landing');
    }
  const month=process.argv[2]||'2026-11';
  const preview=validateDraft(draft,{},month);
  assert.equal(preview.readyForLive,false);
  assert(preview.blockers.includes('LANDING_NOT_VERIFIED'));
  const out=path.join(root,'rebuild/test-artifacts/ad-grants/worker-plan');
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'preview.json'),JSON.stringify(preview,null,2)+'\n');
  console.log(JSON.stringify({status:'DRY_RUN_COMPLETE_NOT_ACTIVATABLE',month,
    campaignCount:preview.campaigns.length,adGroupCount:preview.campaigns.reduce((n,c)=>n+c.adGroups.length,0),
    allocatedUsdPerDay:preview.budget.plannedDailyUsd,blockers:preview.blockers,
    artifact:'rebuild/test-artifacts/ad-grants/worker-plan/preview.json'}));
})().catch(error=>{console.error('DRY_RUN_FAILED:',error.message);process.exitCode=1});
