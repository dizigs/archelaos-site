import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readAuthorizedArtifact,prepareFromAuthorizedGitHub} from '../src/github-artifacts.mjs';
const when=Date.parse('2026-11-05T12:00:00.000Z');
const name='google-analytics-aggregate.json';
const data=()=>({generated_utc:'2026-11-05T11:00:00.123456+00:00',
  search_console:{range:{startDate:'2026-11-01',endDate:'2026-11-02'},
    daily:[{date:'2026-11-01',clicks:12,impressions:90,ctr:12/90,position:9}]},
  ga4:{range:{startDate:'2026-11-01',endDate:'2026-11-02'},
    daily:[{date:'20261101',activeUsers:35,sessions:40,pageViews:63}]}});
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(n=>n.toString(16).padStart(2,'0')).join('');
function crc32(bytes) {
  let x=0xffffffff;
  for(const b of bytes){x^=b;for(let j=0;j<8;j++)x=x&1?(x>>>1)^0xedb88320:x>>>1;}
  return (x^0xffffffff)>>>0;
}
function fixtureZip(file,body){
  const content=Buffer.from(body),packed=deflateRawSync(content),fileName=Buffer.from(file);
  const crc=crc32(content);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);
  local.writeUInt32LE(packed.length,18);local.writeUInt32LE(content.length,22);
  local.writeUInt16LE(fileName.length,26);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);
  central.writeUInt32LE(crc,16);central.writeUInt32LE(packed.length,20);
  central.writeUInt32LE(content.length,24);central.writeUInt16LE(fileName.length,28);
  const cdoffset=local.length+fileName.length+packed.length;
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(1,8);
  eocd.writeUInt16LE(1,10);eocd.writeUInt32LE(central.length+fileName.length,12);
  eocd.writeUInt32LE(cdoffset,16);
  return Buffer.concat([local,fileName,packed,central,fileName,eocd]);
}
async function mockFixture({badDigest=false,redirect='https://results.actions.githubusercontent.com/a.zip',
  filename=name,failed=false,createdBy=null}={}) {
  const zip=fixtureZip(filename,JSON.stringify(data()));
  const digest=await hash(zip);
  const run={id:111,repository:{full_name:'dizigs/archelaos-site',id:1433399999},
    name:'Google Search and GA4 daily aggregate',path:'.github/workflows/google-analytics-aggregate.yml',
    head_branch:'main',head_sha:'a'.repeat(40),event:'schedule',
    status:'completed',conclusion:failed?'failure':'success',updated_at:'2026-11-05T11:05:00Z'};
  const artifact={id:222,name:'google-search-ga4-private-report',
    expired:false,expires_at:'2026-11-19T11:00:00Z',
    digest:'sha256:'+(badDigest?'0'.repeat(64):digest),
    workflow_run:{id:111,repository_id:1433399999,head_repository_id:1433399999,
      head_branch:'main',head_sha:'a'.repeat(40)}};
  const requests=[];
  const fetchImpl=async(url,opts)=>{
    requests.push({url,headers:opts.headers});
    if(createdBy)createdBy(url,opts);
    if(url.endsWith('/actions/runs/111'))return Response.json(run);
    if(url.endsWith('/actions/artifacts/222'))return Response.json(artifact);
    if(url.endsWith('/actions/artifacts/222/zip'))
      return new Response(null,{status:302,headers:{location:redirect}});
    return new Response(zip);
  };
  return {input:{source:'google_bundle',runId:111,artifactId:222,
    token:'fake-token-123456',fetchImpl,now:when},requests};
}
test('reads authoritative run, artifact and ZIP, hashes exact JSON, not fake caller digest',async()=>{
  const {input,requests}=await mockFixture();
  const result=await readAuthorizedArtifact(input);
  assert.equal(result.evidence.verifiedContentSha256,await hash(result.artifactBytes));
  assert.equal(result.artifactBytes.length>0,true);
  assert.equal(requests.length,4);
  assert.equal(Object.hasOwn(requests[3].headers,'Authorization'),false);
  assert.equal(result.evidence.run.completedAt,'2026-11-05T11:05:00Z');
  assert.equal(JSON.stringify(result.evidence).includes('fake-token'),false);
});
test('full private adapter handles Python +00:00 and GitHub second precision UTC',async()=>{
  const {input}=await mockFixture();
  const result=await prepareFromAuthorizedGitHub(input);
  assert.equal(result.verified,true);
  assert.equal(result.events.length,2);
  assert.equal(result.events[0].event.payload.metrics[0].name,'users');
  assert.equal(result.evidence.observedAt,'2026-11-05T11:05:00.000Z');
  assert.equal(result.events[0].event.publish,false);
  assert(!JSON.stringify(result).includes('pageViews'));
});
test('fails closed for archive digest mismatch, spoofed CDN and unsuccessful run',async()=>{
  for(const p of [
    {badDigest:true,pattern:/GITHUB_ARCHIVE_DIGEST_MISMATCH/},
    {redirect:'https://attacker.example/a.zip',pattern:/UNTRUSTED_GITHUB_REDIRECT/},
    {failed:true,pattern:/UNVERIFIED_GITHUB_METADATA/},
    {filename:'other.json',pattern:/UNEXPECTED_ARCHIVE_FILE/}
  ]) {
    const {input}=await mockFixture(p);
    await assert.rejects(readAuthorizedArtifact(input),p.pattern);
  }
});
test('does not start HTTP requests without repository-scoped token',async()=>{
  const {input,requests}=await mockFixture();
  await assert.rejects(readAuthorizedArtifact({...input,token:null}),/ARTIFACT_READER_NOT_AUTHORIZED/);
  assert.equal(requests.length,0);
});
