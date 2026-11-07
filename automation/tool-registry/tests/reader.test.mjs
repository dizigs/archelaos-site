import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, webcrypto, createVerify } from 'node:crypto';
import { parseWorkerFeed, textFromDocsResponse, makeSignedAssertion, createRegistryReader, RegistryFault } from '../reader.mjs';

const item = { id:'github',name:'GitHub',family:'chatgpt',state:'verified',access:'admin_verified',use_when:'Changes via reviewed PR only' };
const data = { schema_version:1,updated_at:'2026-11-04',tools:[item] };
const docText = `private history\nARCHELAOS_WORKER_REGISTRY_V1_BEGIN\n${JSON.stringify(data)}\nARCHELAOS_WORKER_REGISTRY_V1_END\nprivate notes`;
const envelope = value => `ARCHELAOS_WORKER_REGISTRY_V1_BEGIN\n${JSON.stringify(value)}\nARCHELAOS_WORKER_REGISTRY_V1_END`;
const invalid = (fn, code) => assert.throws(fn, e => e instanceof RegistryFault && e.message === code);

test('reads only typed sanitized feed; never returns private history', () => {
 const parsed = parseWorkerFeed(docText);
 assert.equal(parsed.authorization,'metadata_only');
 assert.equal(parsed.tools.length,1);
 assert.equal(parsed.tools[0].name,'GitHub');
 assert.equal(JSON.stringify(parsed).includes('private history'),false);
});
test('missing, duplicate and malformed marker fail closed', () => {
 invalid(()=>parseWorkerFeed('private notes'),'REGISTRY_FEED_MARKERS_INVALID');
 invalid(()=>parseWorkerFeed(docText+docText),'REGISTRY_FEED_MARKERS_INVALID');
 invalid(()=>parseWorkerFeed('ARCHELAOS_WORKER_REGISTRY_V1_BEGIN\n{bad}\nARCHELAOS_WORKER_REGISTRY_V1_END'),'REGISTRY_FEED_JSON_INVALID');
});
test('schema rejects unexpected keys, duplicate IDs, status spoofing and secret-like content', () => {
 invalid(()=>parseWorkerFeed(envelope({...data,unexpected:'x'})),'REGISTRY_SCHEMA_INVALID');
 invalid(()=>parseWorkerFeed(envelope({...data,tools:[item,item]})),'REGISTRY_ENTRY_INVALID');
 invalid(()=>parseWorkerFeed(envelope({...data,tools:[{...item,state:'deleted'}]})),'REGISTRY_ENTRY_INVALID');
 invalid(()=>parseWorkerFeed(envelope({...data,tools:[{...item,name:'password:abc'}]})),'REGISTRY_ENTRY_INVALID');
 invalid(()=>parseWorkerFeed(envelope({...data,tools:[{...item,state:'disabled',access:'admin_verified'}]})),'REGISTRY_ENTRY_INVALID');
});
test('Google Docs tabs and split text runs preserve order', () => {
 const mid = Math.floor(docText.length/2);
 assert.equal(textFromDocsResponse({tabs:[{documentTab:{body:{content:[{paragraph:{elements:[{textRun:{content:docText.slice(0,mid)}},{textRun:{content:docText.slice(mid)}}]}}]}}}]}),docText);
});
test('service account assertion signed correctly with Docs readonly scope', async () => {
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const credentials={client_email:'registry-agent@my-project.iam.gserviceaccount.com',private_key:privateKey.export({format:'pem',type:'pkcs8'}).toString()};
 const jwt=await makeSignedAssertion(credentials,Date.UTC(2026,10,4),webcrypto.subtle);
 const [head,claim,signature]=jwt.split('.');
 const claims=JSON.parse(Buffer.from(claim,'base64url').toString());
 assert.equal(claims.iss,credentials.client_email);
 assert.equal(claims.scope,'https://www.googleapis.com/auth/documents.readonly');
 assert.equal(claims.aud,'https://oauth2.googleapis.com/token');
 const verifier=createVerify('RSA-SHA256');verifier.update(`${head}.${claim}`);verifier.end();
 assert.equal(verifier.verify(publicKey,Buffer.from(signature,'base64url')),true);
});
test('credentialless fail closed without contacting provider', async () => {
 let called=0;
 const read=createRegistryReader({request:async()=>{called++;throw Error('should not run');}});
 await assert.rejects(()=>read({REGISTRY_DOCUMENT_ID:'1b0yXDHUmS2kt5_18ppcILX-lcWSvmV4FwwqpCn9LEeU'}),e=>e.message==='REGISTRY_SERVICE_ACCOUNT_MISSING');
 assert.equal(called,0);
});
test('provider request never returns credentials, secrets, or full document',async()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const requests=[];
 const reader=createRegistryReader({now:()=>Date.UTC(2026,10,4),request:async(url,opts)=>{
  requests.push({url,method:opts.method});
  if(url.includes('oauth2'))return {ok:true,json:async()=>({access_token:'test-access-token-12345',expires_in:3600})};
  return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({body:{content:[{paragraph:{elements:[{textRun:{content:docText}}]}}]}})};
 }});
 const env={REGISTRY_DOCUMENT_ID:'1b0yXDHUmS2kt5_18ppcILX-lcWSvmV4FwwqpCn9LEeU',REGISTRY_GOOGLE_SERVICE_ACCOUNT:JSON.stringify({client_email:'registry-agent@my-project.iam.gserviceaccount.com',private_key:privateKey.export({format:'pem',type:'pkcs8'}).toString()})};
 const out=await reader(env);
 assert.equal(out.tools.length,1);
 assert.equal(JSON.stringify(out).includes('test-access-token'),false);
 assert.equal(requests.length,2);
 assert.equal(requests[0].url,'https://oauth2.googleapis.com/token');
 assert.match(requests[1].url,/^https:\/\/docs.googleapis.com\/v1\/documents\/1b0y/);
 // A second call reuses token but fetches the latest document, including revocations.
 await reader(env);assert.equal(requests.length,3);
});
