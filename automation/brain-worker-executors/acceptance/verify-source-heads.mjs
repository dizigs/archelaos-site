/** Read-only GitHub proof: merged SHA ancestor of main; open heads exactly pinned. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config=JSON.parse(readFileSync(new URL('./sources.json',import.meta.url),'utf8'));
const token=process.env.GITHUB_TOKEN;
if(!token||token.length<10)throw Error('Missing read-only GitHub token');
const base='https://api.github.com/repos/'+config.repository;
async function get(path){
  const res=await fetch(base+path,{method:'GET',redirect:'error',
    headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error('GitHub SHA provenance unavailable: HTTP '+res.status);
  return res.json();
}
for(const [name,pin] of Object.entries(config.sources)){
  const p=await get('/pulls/'+pin.pr);
  assert.equal(p.number,pin.pr);
  assert.equal(p.base?.ref,pin.base);
  assert.equal(p.head?.repo?.full_name,config.repository);
  assert.equal(p.head?.sha,pin.headSha,'Historical PR HEAD mismatch: '+name);
  if(pin.state==='merged'){
    assert.equal(p.state,'closed');
    assert.equal(p.merged,true);
    assert.ok(typeof p.merged_at==='string');
    assert.equal(p.merge_commit_sha,pin.sha,'Merge SHA mismatch: '+name);
    const x=await get('/compare/'+pin.sha+'...main');
    assert.ok(['identical','ahead'].includes(x.status)&&x.behind_by===0,
      'Merge commit not in main history: '+name);
  }else{
    assert.equal(p.state,'open','Open source merged or closed: '+name);
    assert.equal(p.merged,false);
    assert.equal(p.head.sha,pin.sha,'Source head moved: '+name);
  }
  console.log('PROVENANCE PASS',name,pin.sha);
}
