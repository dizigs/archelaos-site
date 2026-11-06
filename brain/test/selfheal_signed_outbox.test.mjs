import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {
  SELFHEAL_OUTBOX_SCHEMA, signCanonicalRecoveryFinding,
  attemptOneSignedSelfHealDelivery
} from '../src/selfheal_signed_outbox.mjs';
import {SELFHEAL_SCHEMA} from '../src/selfheal_recovery.mjs';
import {verifySignedRecoveryEvent} from '../../automation/self-heal-worker/src/contract.mjs';

const NOW=Date.parse('2026-11-06T10:30:00Z');
const SHA='a'.repeat(40);
const KEY='offline-signing-fixture-not-a-secret-'.repeat(3);
const RECEIPT='123e4567-e89b-42d3-a456-426614174000';
const finding={
  schemaVersion:1,source:'github_actions',repository:'dizigs/archelaos-site',
  code:'CI_FAILURE',resource:'/ci',commit:SHA,
  observedAt:new Date(NOW).toISOString(),evidenceId:'actions:42022399427'
};

function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE controls(name TEXT PRIMARY KEY,value INTEGER NOT NULL)');
  for(const sql of [...SELFHEAL_SCHEMA,...SELFHEAL_OUTBOX_SCHEMA]) db.exec(sql);
  db.exec("INSERT INTO controls(name,value) VALUES('global',0),('ai',1),('source:github',1)");
  db.prepare('INSERT INTO selfheal_ci_proofs(receipt_id,fingerprint,source,repository,commit_sha,evidence_id,resource,code,required_check,run_attempt,evidence_digest,issued,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(RECEIPT,'f'.repeat(64),'github_actions','dizigs/archelaos-site',SHA,
      'actions:42022399427','/ci','CI_FAILURE','ESLint JavaScript quality',1,
      'a'.repeat(64),NOW-1000,NOW+120000);
  const storage={
    sql:{exec(statement,...params) {
      const st=db.prepare(statement);
      if (/^\s*SELECT\b/i.test(statement)) return st.all(...params);
      st.run(...params);return [];
    }},
    transactionSync(fn){
      db.exec('BEGIN IMMEDIATE');
      try{const value=fn();db.exec('COMMIT');return value;}
      catch(e){db.exec('ROLLBACK');throw e;}
    }
  };
  const env={
    ENVIRONMENT:'staging',
    BRAIN_SELFHEAL_DISPATCH_ENABLED:'true',
    BRAIN_SELFHEAL_RECOVERY_ENABLED:'true',
    BRAIN_SELFHEAL_BINDING_ATTESTED:'true',
    BRAIN_SELFHEAL_APPROVED_SHA:SHA,DEPLOY_SHA:SHA,
    STAGING_EXPIRES_AT:new Date(NOW+30*60000).toISOString(),
    HEALER_EVENT_HMAC_KEY:KEY,
    HEALER:{attemptRecovery:async()=>({status:'ROUTED'})}
  };
  return {db,storage,env};
}

test('signer interoperates with actual existing Healer HMAC and finding validator',async()=>{
  const nonce='b'.repeat(32);
  const envelope=await signCanonicalRecoveryFinding(finding,KEY,NOW,nonce);
  assert.equal(envelope.issuer,'canonical-brain');
  assert.equal(envelope.scope,'selfheal.recover');
  assert.match(envelope.signature,/^[a-f0-9]{64}$/);
  const parsed=await verifySignedRecoveryEvent(envelope,KEY,{claim:async()=>true},NOW);
  assert.deepEqual(parsed,finding);
  await assert.rejects(()=>verifySignedRecoveryEvent(envelope,KEY+'wrong',{claim:async()=>true},NOW),
    /INVALID_RECOVERY_SIGNATURE/);
});

test('single canonical Brain proof sends once; ambiguous ACK never authorizes retry',async()=>{
  const {db,storage,env}=fixture();
  let calls=0;
  env.HEALER.attemptRecovery=async envelope=>{
    calls++;
    const parsed=await verifySignedRecoveryEvent(envelope,KEY,{claim:async()=>true},NOW);
    assert.deepEqual(parsed,finding);
    return {status:'ROUTED',autoMergeAllowed:false};
  };
  const result=await attemptOneSignedSelfHealDelivery(storage,env,RECEIPT,NOW);
  assert.equal(result.status,'UNKNOWN');
  assert.equal(result.safeToRetry,false);
  assert.equal(result.needsIndependentReadback,true);
  assert.equal(calls,1);
  assert.equal(db.prepare('SELECT status FROM selfheal_signed_outbox').get().status,'UNKNOWN');
  await assert.rejects(()=>attemptOneSignedSelfHealDelivery(storage,env,RECEIPT,NOW),
    /SIGNED_DISPATCH_ALREADY_CLAIMED/);
  assert.equal(calls,1);
});

test('network failure is UNKNOWN and does not re-send after a crash or restart',async()=>{
  const {db,storage,env}=fixture();
  let calls=0;
  env.HEALER.attemptRecovery=async()=>{calls++;throw Error('network ambiguous');};
  const result=await attemptOneSignedSelfHealDelivery(storage,env,RECEIPT,NOW);
  assert.equal(result.status,'UNKNOWN');
  assert.equal(result.code,'HEALER_DELIVERY_UNVERIFIED');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM selfheal_signed_outbox').get().n,1);
  await assert.rejects(()=>attemptOneSignedSelfHealDelivery(storage,env,RECEIPT,NOW),
    /SIGNED_DISPATCH_ALREADY_CLAIMED/);
  assert.equal(calls,1);
});

test('off-by-default staging gate rejects missing binding, old SHA, expired time or key',async()=>{
  for(const mutation of [
    e=>{delete e.BRAIN_SELFHEAL_DISPATCH_ENABLED;},
    e=>{e.BRAIN_SELFHEAL_DISPATCH_ENABLED='false';},
    e=>{e.BRAIN_SELFHEAL_RECOVERY_ENABLED='false';},
    e=>{e.BRAIN_SELFHEAL_BINDING_ATTESTED='false';},
    e=>{e.ENVIRONMENT='production';},
    e=>{e.DEPLOY_SHA='b'.repeat(40);},
    e=>{e.STAGING_EXPIRES_AT='1970-01-01T00:00:00Z';},
    e=>{e.STAGING_EXPIRES_AT=new Date(NOW+7200000).toISOString();},
    e=>{delete e.HEALER_EVENT_HMAC_KEY;},
    e=>{delete e.HEALER;}
  ]){
    const {db,storage,env}=fixture();
    mutation(env);
    await assert.rejects(()=>attemptOneSignedSelfHealDelivery(storage,env,RECEIPT,NOW),
      /SELFHEAL_SIGNED_DISPATCH_DISABLED/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM selfheal_signed_outbox').get().n,0);
  }
});

test('caller cannot fabricate durable CI evidence or bypass canonical chain halt',async()=>{
  for(const mutation of [
    ({db})=>{db.exec("UPDATE controls SET value=1 WHERE name='global'");},
    ({db})=>{db.exec("UPDATE controls SET value=0 WHERE name='source:github'");},
    ({db})=>{db.exec("UPDATE controls SET value=0 WHERE name='ai'");},
    ({db})=>{db.exec("UPDATE selfheal_ci_proofs SET code='HTML_ESCAPED_TEXT'");},
    ({db})=>{db.exec("UPDATE selfheal_ci_proofs SET evidence_digest='not-real'");},
    ({db})=>{db.exec("UPDATE selfheal_ci_proofs SET expires=1");},
    ({db})=>{db.exec("DELETE FROM selfheal_ci_proofs");}
  ]){
    const f=fixture();mutation(f);
    let sent=0;f.env.HEALER.attemptRecovery=async()=>{sent++;};
    await assert.rejects(()=>attemptOneSignedSelfHealDelivery(f.storage,f.env,RECEIPT,NOW),
      /CANONICAL_CI_PROOF_OR_HALT_UNVERIFIED/);
    assert.equal(sent,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM selfheal_signed_outbox').get().n,0);
  }
});
