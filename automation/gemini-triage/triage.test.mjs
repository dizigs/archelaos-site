import test from 'node:test';
import assert from 'node:assert/strict';
import { runGeminiPublicNewsTriage, preparePublicNews } from './triage.mjs';
const article={sourceUrl:'https://example.org/public-article',title:'Αρχέλαος – αγώνας χάντμπολ',excerpt:'Στις 31/10/2026 ο Αρχέλαος επικράτησε 33–16 της Καστοριάς.',existingEventHints:[],publicSourceVerified:true,privacyReviewed:true};
const key='TEST_PRIVATE_KEY_NEVER_REAL_12345';
const args={article,key};
test('input requires public source and privacy review',()=>{
  assert.equal(preparePublicNews(article).title,article.title);
  assert.throws(()=>preparePublicNews({...article,privacyReviewed:false}),{code:'PUBLIC_SOURCE_OR_PRIVACY_NOT_VERIFIED'});
  assert.throws(()=>preparePublicNews({...article,sourceUrl:'http://127.0.0.1/'}),{code:'INVALID_PUBLIC_SOURCE_URL'});
  assert.throws(()=>preparePublicNews({...article,arbitraryUrl:'https://evil.example'}),{code:'INVALID_PUBLIC_NEWS_INPUT'});
});
test('default OFF never calls network',async()=>{let calls=0;await assert.rejects(()=>runGeminiPublicNewsTriage({...args,fetchGoogle:()=>{calls++;}}),{code:'GEMINI_LIVE_PROVIDER_DISABLED'});assert.equal(calls,0)});
test('no Brain claim never calls network',async()=>{let calls=0;await assert.rejects(()=>runGeminiPublicNewsTriage({...args,liveEnabled:true,fetchGoogle:()=>{calls++;}}),{code:'BRAIN_BUDGET_AUTHORIZATION_MISSING'});assert.equal(calls,0)});
test('untrusted or invalid Brain budget claim rejected before network',async()=>{
 let calls=0;
 await assert.rejects(()=>runGeminiPublicNewsTriage({...args,liveEnabled:true,authorize:async({requestHash})=>({authorized:true,requestHash,provider:'gemini',source:'user'}),fetchGoogle:()=>{calls++}}),{code:'BRAIN_BUDGET_AUTHORIZATION_DENIED'});
 assert.equal(calls,0);
});
test('injected single provider call returns private review only',async()=>{
 let calls=0;let captured;
 const output=await runGeminiPublicNewsTriage({...args,liveEnabled:true,authorize:async({requestHash})=>({authorized:true,requestHash,provider:'gemini',source:'central-brain'}),fetchGoogle:async(url,init)=>{
  calls++; captured={url,init}; return {status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({department:'handball',eventDate:'2026-10-31',people:[],possibleDuplicate:true,shortReason:'Παρόμοιο αγωνιστικό αποτέλεσμα',confidence:'medium'})}]}}],usageMetadata:{promptTokenCount:45,candidatesTokenCount:24}})};
 }});
 assert.equal(calls,1);assert.equal(output.status,'PRIVATE_REVIEW_REQUIRED');assert.equal(output.publicationPerformed,false);
 assert.equal(output.proposal.possibleDuplicate,true);assert.equal(output.usage.inputTokens,45);
 assert.equal(captured.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
 assert.equal(captured.init.headers['x-goog-api-key'],key);
});
test('provider errors do not trigger retries',async()=>{let calls=0;await assert.rejects(()=>runGeminiPublicNewsTriage({...args,liveEnabled:true,authorize:async({requestHash})=>({authorized:true,requestHash,provider:'gemini',source:'central-brain'}),fetchGoogle:async()=>{calls++;throw Error('timed out')}}),{code:'GEMINI_PROVIDER_OUTCOME_UNCERTAIN'});assert.equal(calls,1)});
test('invalid output and missing usage require reconciliation',async()=>{
 await assert.rejects(()=>runGeminiPublicNewsTriage({...args,liveEnabled:true,authorize:async({requestHash})=>({authorized:true,requestHash,provider:'gemini',source:'central-brain'}),fetchGoogle:async()=>({status:200,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({department:'handball',eventDate:'',people:[],possibleDuplicate:false,shortReason:'Check',confidence:'low'})}]}}]})})}),{code:'GEMINI_USAGE_RECONCILIATION_REQUIRED'});
});
