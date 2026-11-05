import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOnlyHints} from '../src/review-hints.mjs';
const report=(date,metrics,source='ga4')=>({schemaVersion:1,source,
  period:{from:date,to:date},rawVisitorDataStored:false,externalAiCalls:0,
  metrics:metrics.map(([name,value,sampleSize=100])=>({pagePath:'/',name,value,sampleSize}))});
test('reports big site-wide volume drops as review-only and no automatic actions',()=>{
  const value=reviewOnlyHints({previous:report('2026-11-01',[['sessions',100]]),
    current:report('2026-11-02',[['sessions',39]])});
  assert.equal(value.mode,'REVIEW_ONLY');
  assert.equal(value.automaticOptimization,false);
  assert.equal(value.causalClaim,false);
  assert.equal(value.hints[0].signal,'VOLUME_DROP');
});
test('no noise for small shifts or missing cohorts',()=>{
  const small=reviewOnlyHints({previous:report('2026-11-01',[['sessions',100]]),
    current:report('2026-11-02',[['sessions',80]])});
  assert.deepEqual(small.hints,[]);
  const noCohorts=reviewOnlyHints({previous:report('2026-11-01',[]),
    current:report('2026-11-02',[])});
  assert.deepEqual(noCohorts.hints,[]);
});
test('advisory Clarity changes do not make daily equivalence or causal claims',()=>{
  const value=reviewOnlyHints({previous:report('2026-11-01',[['rage_clicks',5,30]],'clarity'),
    current:report('2026-11-02',[['rage_clicks',20,30]],'clarity')});
  assert.equal(value.comparison,'ROLLING_24H_NOT_CALENDAR_DAY');
  assert.equal(value.hints[0].advisoryOnly,true);
});
test('rejects personal or page URL detail, low cohorts and mismatched periods',()=>{
  const earlier=report('2026-11-01',[['sessions',100]]);
  const current=report('2026-11-02',[['sessions',30]]);
  assert.throws(()=>reviewOnlyHints({previous:earlier,current:{...current,source:'clarity'}}),
    /INVALID_REVIEW_SNAPSHOT/);
  assert.throws(()=>reviewOnlyHints({previous:earlier,current:{...current,
    metrics:[{pagePath:'/news.html?gclid=secret',name:'sessions',value:30,sampleSize:30}]}}),
    /INVALID_REVIEW_SNAPSHOT/);
  assert.throws(()=>reviewOnlyHints({previous:earlier,current:{...current,
    metrics:[{pagePath:'/',name:'sessions',value:30,sampleSize:5}]}}),
    /INVALID_REVIEW_SNAPSHOT/);
  assert.throws(()=>reviewOnlyHints({previous:current,current:earlier}),
    /INVALID_REVIEW_SNAPSHOT/);
});
