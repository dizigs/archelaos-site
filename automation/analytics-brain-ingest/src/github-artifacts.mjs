/**
 * Node 22-only, opt-in private Actions artifact reader. No schedules, storage,
 * public endpoints or provider calls. Caller supplies a short-lived
 * repository-scoped actions:read token; it is never returned or logged.
 * Do NOT import this module into the Cloudflare Worker runtime.
 */
import {inflateRawSync} from 'node:zlib';
import {preparePrivateExport} from './bridge.mjs';

const REPOSITORY='dizigs/archelaos-site';
const SPECS=Object.freeze({
  google_bundle:{name:'Google Search and GA4 daily aggregate',
    path:'.github/workflows/google-analytics-aggregate.yml',
    artifact:'google-search-ga4-private-report',file:'google-analytics-aggregate.json'},
  clarity:{name:'Clarity daily private aggregate report',
    path:'.github/workflows/clarity-daily-export.yml',
    artifact:'clarity-private-aggregate-report',file:'clarity-aggregate-report.json'}
});
const MAX_ZIP=1024*1024;
const MAX_JSON=256*1024;
const fail=code=>{throw new Error(code);};
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(n=>n.toString(16).padStart(2,'0')).join('');

function extractSingleReport(bytes,expectedFile) {
  if(!(bytes instanceof Uint8Array)||bytes.length<22||bytes.length>MAX_ZIP)fail('UNSAFE_ARCHIVE');
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=i=>dv.getUint16(i,true),u32=i=>dv.getUint32(i,true);
  let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) {
    if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){eocd=i;break;}
  }
  if(eocd<0||u16(eocd+4)!==0||u16(eocd+6)!==0||
      u16(eocd+8)!==1||u16(eocd+10)!==1)fail('UNSAFE_ARCHIVE');
  const cdOffset=u32(eocd+16),cdSize=u32(eocd+12);
  if(cdOffset+cdSize!==eocd||cdSize<46||u32(cdOffset)!==0x02014b50)
    fail('UNSAFE_ARCHIVE');
  const flags=u16(cdOffset+8),method=u16(cdOffset+10);
  const crc=u32(cdOffset+16),packed=u32(cdOffset+20),unpacked=u32(cdOffset+24);
  const nameLength=u16(cdOffset+28),extra=u16(cdOffset+30),comment=u16(cdOffset+32);
  const external=u32(cdOffset+38),local=u32(cdOffset+42);
  if(flags&1||![0,8].includes(method)||packed>MAX_ZIP||unpacked>MAX_JSON||
      (external>>>16&0o170000)===0o120000||
      cdOffset+46+nameLength+extra+comment!==eocd||local+30>cdOffset)
    fail('UNSAFE_ARCHIVE');
  const decode=new TextDecoder('utf-8',{fatal:true});
  let name;
  try{name=decode.decode(bytes.subarray(cdOffset+46,cdOffset+46+nameLength));}
  catch{fail('UNSAFE_ARCHIVE');}
  if(name!==expectedFile||name.includes('/')||name.includes('\\'))fail('UNEXPECTED_ARCHIVE_FILE');
  if(u32(local)!==0x04034b50||u16(local+8)!==method||
      u16(local+6)!==flags)fail('UNSAFE_ARCHIVE');
  const dataStart=local+30+u16(local+26)+u16(local+28);
  if(dataStart+packed>cdOffset)fail('UNSAFE_ARCHIVE');
  let actual;
  try{
    actual=method===0?bytes.subarray(dataStart,dataStart+packed):
      new Uint8Array(inflateRawSync(bytes.subarray(dataStart,dataStart+packed),
        {maxOutputLength:MAX_JSON}));
  }catch{fail('INVALID_COMPRESSED_REPORT');}
  if(actual.length!==unpacked||actual.length===0)fail('INVALID_ARCHIVE_LENGTH');
  // ZIP's CRC-32 is not a signature, but detects entry corruption before JSON.
  let checksum=0xffffffff;
  for(const b of actual){checksum^=b;for(let i=0;i<8;i++)
    checksum=checksum&1?(checksum>>>1)^0xedb88320:checksum>>>1;}
  if(((checksum^0xffffffff)>>>0)!==crc)fail('INVALID_ARCHIVE_CRC');
  return actual;
}

function authorizedDownloadHost(url) {
  let u;
  try{u=new URL(url);}catch{fail('UNTRUSTED_GITHUB_REDIRECT');}
  const h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||
     !([ 'actions.githubusercontent.com','blob.core.windows.net'].some(s=>h===s||h.endsWith('.'+s))))
    fail('UNTRUSTED_GITHUB_REDIRECT');
  return u.toString();
}
async function limited(response,max) {
  if(!response.ok)fail('PRIVATE_ARTIFACT_FETCH_FAILED');
  const declared=Number(response.headers.get('content-length')||0);
  if(!Number.isFinite(declared)||declared>max)fail('OVERSIZE_PRIVATE_ARTIFACT');
  if(!response.body?.getReader)fail('UNREADABLE_PRIVATE_ARTIFACT');
  const reader=response.body.getReader(),chunks=[];
  let size=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      size+=value.length;
      if(size>max)fail('OVERSIZE_PRIVATE_ARTIFACT');
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const result=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
  return result;
}

/**
 * The returned trustedLookup derives SHA-256 from independently downloaded
 * GitHub bytes, never from a caller-provided checksum. It is kept in memory.
 */
export async function readAuthorizedArtifact({source,runId,artifactId,token,
  fetchImpl=fetch,now=Date.now()}={}) {
  const spec=SPECS[source];
  if(!spec||!Number.isSafeInteger(runId)||runId<=0||
     !Number.isSafeInteger(artifactId)||artifactId<=0||
     typeof token!=='string'||token.length<10||typeof fetchImpl!=='function')
    fail('ARTIFACT_READER_NOT_AUTHORIZED');
  const base='https://api.github.com/repos/'+REPOSITORY;
  const headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28'};
  const fetchSafe=async(url,opts)=>{try{return await fetchImpl(url,{...opts,signal:AbortSignal.timeout(12000)});}
    catch{fail('GITHUB_ARTIFACT_API_UNAVAILABLE');}};
  async function json(path) {
    const response=await fetchSafe(base+path,{headers,redirect:'error'});
    if(!response.ok)fail('GITHUB_ARTIFACT_API_UNAVAILABLE');
    let value;
    try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true})
      .decode(await limited(response,64*1024)));}
    catch{fail('INVALID_GITHUB_METADATA');}
    return value;
  }
  const run=await json('/actions/runs/'+runId);
  const a=await json('/actions/artifacts/'+artifactId);
  if(run.id!==runId||run.repository?.full_name!==REPOSITORY||
     run.repository?.id!==a.workflow_run?.repository_id||
     run.name!==spec.name||run.path!==spec.path||
     run.head_branch!=='main'||!(/^[a-f0-9]{40}$/).test(run.head_sha||'')||
     !['schedule','workflow_dispatch'].includes(run.event)||
     run.status!=='completed'||run.conclusion!=='success'||
     a.id!==artifactId||a.name!==spec.artifact||a.expired!==false||
     a.workflow_run?.id!==runId||a.workflow_run?.head_sha!==run.head_sha||
     a.workflow_run?.head_branch!=='main'||a.workflow_run?.head_repository_id!==run.repository.id||
     typeof a.digest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(a.digest)||
     !(Date.parse(a.expires_at)>now))
    fail('UNVERIFIED_GITHUB_METADATA');
  const response=await fetchSafe(base+'/actions/artifacts/'+artifactId+'/zip',
    {headers,redirect:'manual'});
  if(response.status!==302)fail('INVALID_ARTIFACT_DOWNLOAD_REDIRECT');
  const url=authorizedDownloadHost(response.headers.get('location'));
  // Deliberately omit ALL auth headers on the signed redirect to prevent leak.
  const zipResponse=await fetchSafe(url,{headers:{Accept:'application/zip'},redirect:'error'});
  const zip=await limited(zipResponse,MAX_ZIP);
  if('sha256:'+(await sha(zip))!==a.digest)fail('GITHUB_ARCHIVE_DIGEST_MISMATCH');
  const artifactBytes=extractSingleReport(zip,spec.file);
  const digest=await sha(artifactBytes);
  const evidence={run:{id:run.id,repository:run.repository.full_name,workflow:run.name,
    workflowPath:run.path,headBranch:run.head_branch,headSha:run.head_sha,
    event:run.event,status:run.status,conclusion:run.conclusion,
    completedAt:run.updated_at},
    artifact:{id:a.id,name:a.name,runId:a.workflow_run.id,expired:a.expired},
    verifiedContentSha256:digest};
  return {artifactBytes,evidence};
}
export async function prepareFromAuthorizedGitHub(input) {
  const {artifactBytes,evidence}=await readAuthorizedArtifact(input);
  return preparePrivateExport({source:input.source,runId:input.runId,
    artifactId:input.artifactId,artifactBytes,now:input.now??Date.now(),
    trustedLookup:async()=>evidence});
}
