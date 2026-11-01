/* Offline Cloudflare Workers AI adapter tests. No network, no secrets, no charge. */
const {readFileSync}=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ROOT=path.join(__dirname,'..');
const assets={
 'people.json':{people:[{id:'arch-abc123456789',name:'Μαρία Τοξοβολίας',role:'Τοξοβολία',bio:'Αθλήτρια του συλλόγου στην τοξοβολία.'}]},
 'moments.json':{moments:[]},
 'stories.json':{stories:[]},
 'museum.json':{articles:[],press:[]},
 'home.json':{sports:[]},
 'interviews.json':{items:[]},
 'match-schedule.json':{matches:[]}
};
async function main(){
 const raw=readFileSync(path.join(ROOT,'ai','worker.js'),'utf8');
 const {default:worker}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(raw));
 const oldFetch=global.fetch;
 let dataCalls=0;
 let azureCalls=0;
 global.fetch=async (url,options)=>{
  if(String(url).endsWith('/openai/v1/chat/completions')){
   azureCalls++;
   assert.equal(url,'https://school-archive.openai.azure.com/openai/v1/chat/completions');
   assert.equal(options.method,'POST');
   assert.equal(options.headers['api-key'],'test-secret-not-real');
   const request=JSON.parse(options.body);
   assert.equal(request.model,'archive-safe');
   assert.equal(request.max_completion_tokens,400);
   return {ok:true,json:async()=>({choices:[{message:{content:'Azure σύντομη τεκμηρίωση. [1]'}}]})};
  }
  dataCalls++;
  const name=String(url).split('/').pop();
  assert.ok(name in assets,'unexpected source '+url);
  return {ok:true,json:async()=>assets[name]};
 };
 try{
  const question='Ποια στοιχεία υπάρχουν για τη Μαρία στην τοξοβολία;';
  const req=(q=question,origin='https://archelaos.club')=>new Request('https://archelaos.club/api/ask',{
    method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.8'},
    body:JSON.stringify({question:q})
  });
  let invocations=0,consumed=0;
  const env={
    AI_ENABLED:'true',AI_MODEL:'test-model',DAILY_AI_REQUEST_CAP:'2',
    AI:{run:async(model,{messages,max_tokens})=>{
      invocations++;assert.equal(model,'test-model');assert.equal(max_tokens,400);
      assert.ok(messages[0].content.includes('Μαρία Τοξοβολίας'));
      return {response:'Το δημοσιευμένο αρχείο αναφέρει την τοξοβολία. [1]'}
    }},
    AI_LIMITER:{limit:async()=>({success:true})},
    AI_QUOTA_DB:{prepare:sql=>{
      assert.ok(sql.includes('ON CONFLICT')&&sql.includes('RETURNING requests'));
      return {bind:(day,cap)=>({first:async()=>{assert.match(day,/^\d{4}-\d{2}-\d{2}$/);
        return consumed<cap?{requests:++consumed}:null}})};
    }}
  };
  const disabled=await worker.fetch(req(),{...env,AI_ENABLED:'false'});
  assert.equal(disabled.status,503);
  const noQuota=await worker.fetch(req(),{...env,AI_QUOTA_DB:null});
  assert.equal(noQuota.status,503);
  assert.equal(dataCalls,0,'no archive or model requests while disabled/unconfigured');
  assert.equal((await worker.fetch(req(question,'https://malicious.example'),env)).status,403);
  assert.equal((await worker.fetch(req('abc'),env)).status,400);
  const first=await worker.fetch(req(),env);
  assert.equal(first.status,200);
  const result=await first.json();
  assert.match(result.answer,/τοξοβολία/);
  assert.equal(result.sources[0].url,'/hall-of-fame.html?person=arch-abc123456789');
  assert.equal(invocations,1);
  assert.equal((await worker.fetch(req(),env)).status,200);
  assert.equal((await worker.fetch(req(),env)).status,429);
  assert.equal(invocations,2,'global cap must block further model requests');
  const throttled=await worker.fetch(req(),{...env,AI_LIMITER:{limit:async()=>({success:false})}});
  assert.equal(throttled.status,429);
  assert.equal(invocations,2);
  // Alternate Azure adapter uses same D1+IP quota and never reaches a public browser.
  consumed=0;
  const azureEnv={...env,AI_PROVIDER:'azure',AI:null,AI_MODEL:null,
    AZURE_OPENAI_ENDPOINT:'https://school-archive.openai.azure.com',
    AZURE_MODEL_DEPLOYMENT:'archive-safe',
    AZURE_OPENAI_API_KEY:'test-secret-not-real'};
  const azureResponse=await worker.fetch(req(),azureEnv);
  assert.equal(azureResponse.status,200);
  const azureBody=await azureResponse.json();
  assert.match(azureBody.answer,/Azure/);
  assert.equal(azureBody.sources[0].url,result.sources[0].url);
  assert.equal(azureCalls,1);
  consumed=0;
  const unsafe=await worker.fetch(req(),{...azureEnv,AZURE_OPENAI_ENDPOINT:'https://attacker.example'});
  assert.equal(unsafe.status,503);
  assert.equal(azureCalls,1,'invalid Azure endpoints cannot receive prompts or credentials');
  console.log('AI SEARCH WORKER OK: disabled, Origin, quota, Cloudflare/Azure, and cited sources');
 }finally{global.fetch=oldFetch}
}
main().catch(e=>{console.error(e);process.exitCode=1});
