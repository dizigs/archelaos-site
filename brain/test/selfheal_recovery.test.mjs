import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  SELFHEAL_SCHEMA, validateCiFinding, verifyRequiredCiFromGithub,
  recordVerifiedCi, storeSelfHealReview, deniedHealthProbe
} from '../src/selfheal_recovery.mjs';

const NOW = Date.parse('2026-11-06T10:30:00Z');
const SHA = 'a'.repeat(40);
const TOKEN = 'test-only-read-token-cccccccccccccccccccccccccccccccccccccccccc';
const RUN = 42022399427;
const CHECK = 'ESLint JavaScript quality';
const finding = (patch = {}) => ({
  schemaVersion: 1, repository:'dizigs/archelaos-site',source:'github_actions',
  code:'CI_FAILURE',resource:'/ci',commit:SHA,
  evidenceId:'actions:' + RUN,observedAt:new Date(NOW - 9000).toISOString(),...patch
});
function proofFixtures() {
  return {
    run: {id:RUN, repository:{full_name:'dizigs/archelaos-site'},
      head_sha:SHA, status:'completed',conclusion:'failure',run_attempt:2,
      updated_at:new Date(NOW - 20000).toISOString(),check_suite_id:88,
      event:'pull_request',pull_requests:[{base:{ref:'main'},head:{sha:SHA}}]},
    rules: {id:26357426,source:'dizigs/archelaos-site',
      enforcement:'active',target:'branch',
      conditions:{ref_name:{include:['~DEFAULT_BRANCH']}},
      rules:[{type:'required_status_checks',parameters:{required_status_checks:[
        {context:'JavaScript syntax (all site scripts)'},
        {context:CHECK}
      ]}}]},
    checks: {total_count:1,check_runs:[
      {id:999,name:CHECK,status:'completed',conclusion:'failure',check_suite:{id:88}}
    ]}
  };
}
function port(fixtures, calls) {
  return async (url, options) => {
    calls.push({url,method:options.method,redirect:options.redirect,
      noStore:options.cache,hasAuth:options.headers.authorization.startsWith('Bearer ')});
    const selected = url.includes('/actions/runs/') ? fixtures.run :
      url.includes('/rulesets/') ? fixtures.rules : fixtures.checks;
    return new Response(JSON.stringify(selected),{status:200,headers:{'content-type':'application/json'}});
  };
}
function fixture() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: {exec(statement,...params) {
      const q = db.prepare(statement);
      if (/^\s*SELECT\b/i.test(statement)) return q.all(...params);
      q.run(...params);
      return [];
    }},
    transactionSync(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const out=fn();db.exec('COMMIT');return out; }
      catch(err) { db.exec('ROLLBACK');throw err; }
    }
  };
  db.exec('CREATE TABLE controls(name TEXT PRIMARY KEY,value INTEGER NOT NULL)');
  db.exec('CREATE TABLE control_audit(at INTEGER NOT NULL,code TEXT NOT NULL,revision INTEGER NOT NULL,scope TEXT NOT NULL)');
  db.exec("INSERT INTO controls(name,value) VALUES ('global',0),('ai',1),('revision',0)");
  for (const statement of SELFHEAL_SCHEMA) db.exec(statement);
  return {storage,db};
}
function review(receipt, patch = {}) {
  return {receiptId:receipt.receiptId,repository:receipt.repository,
    commit:receipt.commit,evidenceId:receipt.evidenceId,code:receipt.code,
    resource:receipt.resource,reviewOnly:true,autoMerge:false,deploy:false,
    retryBudget:0,ledgerOwner:'canonical-brain',bindingScope:'selfheal.recover',
    requiredCiHalted:true,...patch};
}

test('strict Self-Heal metadata scope rejects forged CI and unrelated site findings', () => {
  assert.equal(validateCiFinding(finding(),NOW).code,'CI_FAILURE');
  for(const f of [
    finding({repository:'attacker/repo'}),finding({source:'site_watch'}),
    finding({code:'HTML_ESCAPED_TEXT'}),finding({resource:'/news.html'}),
    finding({extra:'allow'}), finding({observedAt:'2020-01-01T00:00:00Z'})
  ]) assert.throws(() => validateCiFinding(f,NOW));
});

test('authoritative GitHub GET verifies exact run, branch, ruleset and failed required check',async () => {
  const fixtures=proofFixtures(), calls=[];
  const p=await verifyRequiredCiFromGithub(finding(),{
    token:TOKEN,fetchImpl:port(fixtures,calls),now:NOW
  });
  assert.equal(p.verified,true);
  assert.equal(p.runAttempt,2);
  assert.equal(p.requiredCheck,CHECK);
  assert.match(p.evidenceDigest,/^[0-9a-f]{64}$/);
  assert.equal(calls.length,3);
  assert.equal(calls.every(c=>c.method==='GET'&&c.redirect==='error'&&
    c.noStore==='no-store'&&c.hasAuth),true);
});

test('no missing credentials, stale run, wrong SHA, unrequired check or truncated inventory is trusted',async()=>{
  const options={token:TOKEN,now:NOW};
  await assert.rejects(()=>verifyRequiredCiFromGithub(finding(),{
    ...options,token:null,fetchImpl:port(proofFixtures(),[])
  }),/GITHUB_READ_CREDENTIAL_UNAVAILABLE/);
  for(const mutate of [
    f=>{f.run.head_sha='b'.repeat(40);},
    f=>{f.run.status='in_progress';},
    f=>{f.run.conclusion='success';},
    f=>{f.run.updated_at=new Date(NOW-60*60000).toISOString();},
    f=>{f.run.pull_requests[0].base.ref='other';},
    f=>{f.run.check_suite_id=11;},
    f=>{f.rules.enforcement='disabled';},
    f=>{f.rules.conditions.ref_name.include=['refs/heads/test'];},
    f=>{f.rules.rules[0].parameters.required_status_checks=[{context:'other'}];},
    f=>{f.checks.check_runs[0].conclusion='success';},
    f=>{f.checks.total_count=101;},
    f=>{f.checks.total_count=2;}
  ]) {
    const fixtures=proofFixtures();mutate(fixtures);
    await assert.rejects(()=>verifyRequiredCiFromGithub(finding(),{
      ...options,fetchImpl:port(fixtures,[])
    }));
  }
});

test('only verified required CI evidence creates immutable Brain receipt and HALTS its GitHub source chain',async()=>{
  const {storage,db}=fixture();
  const f=finding();
  const evidence=await verifyRequiredCiFromGithub(f,{
    token:TOKEN,fetchImpl:port(proofFixtures(),[]),now:NOW
  });
  const receipt=await recordVerifiedCi(storage,f,evidence,NOW);
  assert.equal(receipt.verified,true);
  assert.equal(receipt.builderRoutingAllowed,true);
  assert.equal(receipt.repairWritesAllowed,false);
  assert.equal(receipt.requiredCi.chainHaltReadback,true);
  assert.equal(receipt.requiredCi.runAttempt,2);
  assert.equal(db.prepare("SELECT value FROM controls WHERE name='source:github'").get().value,1);
  assert.equal(db.prepare("SELECT value FROM controls WHERE name='revision'").get().value,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM control_audit').get().n,1);
  const duplicate=await recordVerifiedCi(storage,f,evidence,NOW+1000);
  assert.equal(duplicate.receiptId,receipt.receiptId);
  assert.equal(db.prepare('SELECT count(*) AS n FROM selfheal_ci_proofs').get().n,1);
  const first=storeSelfHealReview(storage,review(receipt),
    {globalPaused:false,sourcePaused:{github:true}},NOW+2000);
  assert.equal(first.accepted,true);
  assert.equal(first.verifiedReadback,true);
  assert.equal(first.status,'PENDING_MANUAL_REVIEW');
  assert.equal(first.aiCalls,0);
  assert.equal(first.duplicate,false);
  const same=storeSelfHealReview(storage,review(receipt),
    {globalPaused:false,sourcePaused:{github:true}},NOW+2000);
  assert.equal(same.duplicate,true);
  assert.equal(db.prepare('SELECT count(*) AS n FROM selfheal_review_intents').get().n,1);
  db.close();
});

test('untrusted receipt/readback, emergency pause, wrong-SHA and expired proof never route a review',async()=>{
  const {storage,db}=fixture(),f=finding();
  const evidence=await verifyRequiredCiFromGithub(f,{
    token:TOKEN,fetchImpl:port(proofFixtures(),[]),now:NOW
  });
  await assert.rejects(()=>recordVerifiedCi(storage,f,{...evidence,verified:false},NOW));
  assert.equal(db.prepare('SELECT count(*) AS n FROM selfheal_ci_proofs').get().n,0);
  const receipt=await recordVerifiedCi(storage,f,evidence,NOW);
  const controls={globalPaused:false,sourcePaused:{github:true}};
  for(const p of [
    review(receipt,{commit:'b'.repeat(40)}),
    review(receipt,{receiptId:'00000000-0000-4000-8000-000000000000'}),
    review(receipt,{autoMerge:true}),
    review(receipt,{deploy:true}),review(receipt,{retryBudget:1}),
    review(receipt,{reviewOnly:false}), review(receipt,{extra:true})
  ]) assert.throws(()=>storeSelfHealReview(storage,p,controls,NOW));
  assert.throws(()=>storeSelfHealReview(storage,review(receipt),
    {globalPaused:true,sourcePaused:{github:true}},NOW));
  assert.throws(()=>storeSelfHealReview(storage,review(receipt),
    {globalPaused:false,sourcePaused:{github:false}},NOW));
  assert.throws(()=>storeSelfHealReview(storage,review(receipt),controls,NOW+300000));
  assert.equal(db.prepare('SELECT count(*) AS n FROM selfheal_review_intents').get().n,0);
  db.close();
});

test('health probe is NEVER reported as verified from caller-supplied metadata',()=>{
  const res=deniedHealthProbe({resource:'/news.html',verified:true,health:'HEALTHY'});
  assert.equal(res.verified,false);
  assert.equal(res.health,'NON_RETRYABLE');
  assert.equal(res.readOnly,true);
});
