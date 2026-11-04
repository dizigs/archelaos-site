import assert from 'node:assert/strict';
import {test} from 'node:test';
import {webcrypto} from 'node:crypto';
import {handleUptimeMonitor} from './monitor-bridge.mjs';

globalThis.crypto ||= webcrypto;
const token='A'.repeat(64);
const env={UPTIMEROBOT_MAIN_API_KEY:'test-only-key',UPTIMEROBOT_OPERATOR_TOKEN:token};
const targetUrls=[
 'https://archelaos.club/',
 'https://archelaos.club/news.html',
 'https://archelaos.club/search.html',
 'https://archelaos.club/hall-of-fame.html',
 'https://archelaos.club/tmimata.html',
 'https://archelaos.club/news.json',
 'https://archelaos.club/hall-of-fame-people.json',
 'https://archelaos.club/history.html',
 'https://archelaos.club/70-stigmes.html',
 'https://archelaos.club/events/index.html',
 'https://archelaos.club/contact.html'
];
function req(path,method='GET',body,authorization='Bearer '+token){
 return new Request('https://worker.example/api/uptimerobot/'+path,{
  method,headers:{authorization},...(body?{body:JSON.stringify(body)}:{})
 });
}

test('all targets are allowlisted, live and exclude frozen archery',async()=>{
 let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({nextLink:null,data:[]})};
 const r=await handleUptimeMonitor(req('status'),env);
 assert.equal(r.status,200);
 const result=await r.json();
 assert.deepEqual(result.targets.map(t=>t.url),targetUrls);
 assert.equal(result.targets.some(t=>t.url.includes('archery')),false);
 assert.equal(calls,1);
});
test('auth and missing operator key fail closed before UptimeRobot',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('UNEXPECTED_REMOTE')};
 const wrong=req('status','GET',null,'Bearer '+'B'.repeat(64));
 assert.equal((await handleUptimeMonitor(wrong,env)).status,401);
 assert.equal((await handleUptimeMonitor(req('status'),{UPTIMEROBOT_MAIN_API_KEY:'x'})).status,503);
 assert.equal((await handleUptimeMonitor(req('status','POST'),env)).status,405);
 assert.equal((await handleUptimeMonitor(req('status?danger=1'),env)).status,400);
 assert.equal(calls,0);
});
test('ensure creates only missing fixed targets with GET/2xx and configured email',async()=>{
 const existing={id:42,url:targetUrls[0],status:'UP',apiKey:'sensitive-never-return'};
 let creates=0;
 globalThis.fetch=async(url,options)=>{
  if(url.includes('/monitors?'))return Response.json({nextLink:null,data:[existing]});
  if(url.endsWith('/user/alert-contacts'))return Response.json({data:[{id:5,type:'email',status:'active'}]});
  if(url.endsWith('/monitors')&&options.method==='POST'){
   const payload=JSON.parse(options.body);
   assert.ok(targetUrls.includes(payload.url));
   assert.notEqual(payload.url,targetUrls[0]);
   assert.equal(payload.httpMethodType,'GET');
   assert.deepEqual(payload.successHttpResponseCodes,['2xx']);
   assert.equal(payload.interval,300);
   assert.equal(payload.assignedAlertContacts[0].alertContactId,5);
   creates++;
   return Response.json({id:100+creates},{status:201});
  }
  throw Error('UNEXPECTED_REMOTE');
 };
 const status=await handleUptimeMonitor(req('status'),env);
 assert.equal(status.status,200);
 const text=await status.text();
 assert.ok(!text.includes('sensitive-never-return'));
 assert.deepEqual(JSON.parse(text).targets[0].ids,[42]);
 const r=await handleUptimeMonitor(req('ensure','POST',{scope:'core-v1'}),env);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.created.length,10);
 assert.equal(data.existing.length,1);
 assert.equal(creates,10);
});
test('wrong scope, no verified email, or exhausted capacity never create',async()=>{
 let calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url,method:options?.method});
  if(url.includes('/monitors?'))return Response.json({nextLink:null,data:[]});
  if(url.endsWith('/user/alert-contacts'))return Response.json({data:[]});
  throw Error('NO_CREATE_ALLOWED');
 };
 assert.equal((await handleUptimeMonitor(req('ensure','POST',{scope:'other'}),env)).status,400);
 assert.equal((await handleUptimeMonitor(req('ensure','POST',{scope:'core-v1'}),env)).status,409);
 assert.equal(calls.some(c=>c.method==='POST'),false);
 calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url,method:options?.method});
  if(url.includes('/monitors?'))return Response.json({nextLink:null,data:Array.from({length:49},(_,i)=>({id:i+1,url:'https://external.example/'+i}))});
  throw Error('SHOULD_NOT_ACCESS_ALERT_CONTACTS');
 };
 assert.equal((await handleUptimeMonitor(req('ensure','POST',{scope:'core-v1'}),env)).status,409);
 assert.equal(calls.length,1);
});
test('pagination, malformed provider response, and duplicate entries fail safely',async()=>{
 let writes=0;
 globalThis.fetch=async()=>Response.json({nextLink:'https://api.uptimerobot.com/v3/monitors?cursor=5',data:[]});
 assert.equal((await handleUptimeMonitor(req('ensure','POST',{scope:'core-v1'}),env)).status,502);
 globalThis.fetch=async()=>Response.json({unexpected:[]});
 assert.equal((await handleUptimeMonitor(req('status'),env)).status,502);
 globalThis.fetch=async(url,options)=>{
  if(options?.method==='POST')writes++;
  return Response.json({nextLink:null,data:[{id:1,url:targetUrls[0]},{id:2,url:targetUrls[0]}]});
 };
 assert.equal((await handleUptimeMonitor(req('ensure','POST',{scope:'core-v1'}),env)).status,409);
 assert.equal(writes,0);
});
test('unrelated Worker route is untouched',async()=>{
 globalThis.fetch=async()=>{throw Error('SHOULD_NOT_CALL')};
 assert.equal(await handleUptimeMonitor(new Request('https://worker.example/health'),env),null);
});
