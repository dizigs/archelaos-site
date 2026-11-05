/** Fail-closed, read-only GitHub provenance. All request endpoints are immutable. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config=JSON.parse(readFileSync(new URL('./sources.json',import.meta.url),'utf8'));
const token=process.env.GITHUB_TOKEN;
if(!token||token.length<10)throw Error('Missing read-only GitHub token');
const REPOSITORY='dizigs/archelaos-site';
assert.equal(config.schemaVersion,2);
assert.equal(config.repository,REPOSITORY);
/* These are the only remote PR and merge refs authorized for acceptance.
 * Never derive a network destination from the JSON file or an AI response.
 */
const PRS=Object.freeze({
  scaffold:209,gemini:214,gemma:211,testing:212,integration:213,provenance:228
});
const MERGED=Object.freeze({
  scaffold:'ed1285d1c61aa94de9fb19360ba9d95e12110e92',
  gemini:'c2ec74fac9845ee3dea948c8da65d62e94e37bed',
  gemma:'06d9a8d16aebbb4d0c9317d394af54763b3ea647',
  testing:'d0d06f75a3405f1f0e2ab368bc2a774ba8cde084'
});
const ROOT='https://api.github.com/repos/dizigs/archelaos-site';
async function get(path){
  const res=await fetch(ROOT+path,{method:'GET',redirect:'error',
    headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
      'X-GitHub-Api-Version':'2022-11-28'},
    signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error('GitHub SHA provenance unavailable: HTTP '+res.status);
  return res.json();
}
assert.deepEqual(Object.keys(config.sources).sort((a,b)=>a.localeCompare(b)),
  Object.keys(PRS).sort((a,b)=>a.localeCompare(b)));
for(const [name,pr] of Object.entries(PRS)){
  const pin=config.sources[name];
  assert.equal(pin.pr,pr,'Unapproved source PR ID');
  assert.match(pin.sha,/^[a-f0-9]{40}$/);
  assert.match(pin.headSha,/^[a-f0-9]{40}$/);
  const p=await get('/pulls/'+pr);
  assert.equal(p.number,pr);
  assert.equal(p.base?.ref,pin.base,'Source base changed: '+name);
  assert.equal(p.head?.repo?.full_name,REPOSITORY,'Source head repo changed: '+name);
  assert.equal(p.head?.sha,pin.headSha,'Source PR HEAD moved: '+name);
  if(Object.hasOwn(MERGED,name)){
    assert.equal(pin.state,'merged');
    assert.equal(pin.sha,MERGED[name],'Unapproved merge commit');
    assert.equal(pin.base,'main');
    assert.equal(p.state,'closed');
    assert.equal(p.merged,true);
    assert.ok(typeof p.merged_at==='string');
    assert.equal(p.merge_commit_sha,MERGED[name]);
    const comparison=await get('/compare/'+MERGED[name]+'...main');
    assert.ok(['identical','ahead'].includes(comparison.status)&&
      comparison.behind_by===0,'Merge commit no longer in main: '+name);
  }else{
    assert.equal(pin.state,'open');
    assert.equal(p.state,'open','Open source changed state: '+name);
    assert.equal(p.merged,false);
    assert.equal(p.head.sha,pin.sha,'Open source HEAD changed: '+name);
  }
  console.log('PROVENANCE PASS',name,pin.sha);
}
