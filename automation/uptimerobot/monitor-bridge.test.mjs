import assert from 'node:assert/strict';
import {test} from 'node:test';
import {webcrypto} from 'node:crypto';
import {handleUptimeMonitor} from './monitor-bridge.mjs';
globalThis.crypto ||= webcrypto;
const token='A'.repeat(64),env={UPTIMEROBOT_MAIN_API_KEY:'test-only-key',UPTIMEROBOT_OPERATOR_TOKEN:token};
function req(path,method='GET',body,authorization='Bearer '+token){return new Request('https://worker.example/api/uptimerobot/'+path,{method,headers:{authorization},...(body?{body:JSON.stringify(body)}:{})})}
test('protected route rejects wrong bearer without an outbound call',async()=>{
 let count=0;globalThis.fetch=async()=>{count++;throw Error('unexpected')};
 assert.equal((await handleUptimeMonitor(req('status','GET',null,'Bearer '+ 'B'.repeat(64)),env)).status,401);assert.equal(count,0);
});
test('status and ensure are bounded and only create missing targets',async()=>{
 let created=0;globalThis.fetch=async(url,options)=>{
  if(url.includes('/monitors?'))return Response.json({data:{items:[]},nextLink:null});
  if(url.endsWith('/user/alert-contacts'))return Response.json([{id:5,type:'email',status:'active'}]);
  if(url.endsWith('/monitors')&&options.method==='POST'){created++;const p=JSON.parse(options.body);assert.ok(p.url.startsWith('https://archelaos.club/'));assert.equal(p.assignedAlertContacts[0].alertContactId,5);return Response.json({id:created})}
  throw Error('unexpected remote request');
 };
 const status=await handleUptimeMonitor(req('status'),env);assert.equal(status.status,200);assert.equal((await status.json()).targets.length,7);
 const ensure=await handleUptimeMonitor(req('ensure','POST',{scope:'core-v1'}),env);assert.equal(ensure.status,200);assert.equal((await ensure.json()).created.length,7);assert.equal(created,7);
 assert.equal((await handleUptimeMonitor(req('ensure','POST',{scope:'arbitrary'}),env)).status,400);
 assert.equal((await handleUptimeMonitor(req('ensure'),env)).status,405);
 assert.equal(await handleUptimeMonitor(new Request('https://worker.example/health'),env),null);
});
