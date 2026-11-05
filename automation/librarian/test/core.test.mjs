import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArchiveSources,buildNewsSource,safePublicUrl,createNotebookSource,
  fetchDrivePdf,getOAuthAccessToken,MAX_TEXT_BYTES } from '../src/core.mjs';

const env={
  NOTEBOOK_NAME:'notebooks/550e8400-e29b-41d4-a716-446655440000',
  NOTEBOOK_PROJECT_ID:'archelaos-project',NOTEBOOK_CLIENT_ID:'client-id-123',
  NOTEBOOK_CLIENT_SECRET:'client-secret-123',NOTEBOOK_REFRESH_TOKEN:'refresh-token-123'
};
test('public news accepted; private Drive and token-bearing URLs rejected',()=>{
  const src=buildNewsSource({id:'archery-result-2024',title:'Αγώνας',sourceUrl:'https://archery.org.gr/a'});
  assert.equal(src.web_content.url,'https://archery.org.gr/a');
  for(const url of ['https://drive.google.com/file/d/secret/view','http://example.com/a',
    'https://example.com/?token=secret','https://localhost/a','https://example.com/#fragment'])
    assert.throws(()=>safePublicUrl(url));
});
test('preserve page headers; chunk to safe UTF-8 size',()=>{
  const src=buildArchiveSources({id:'1234567890abcdef',name:'Εφημερίδες 1994.pdf',version:'3'},[
    {page:1,text:'Αρχέλαος '.repeat(60000)},{page:2,text:'Τμήμα βόλεϊ'}]);
  assert(src.length>=2);
  assert(src.some(x=>x.text_content.content.includes('Σελίδα 2')));
  for(const s of src)assert(new TextEncoder().encode(s.text_content.content).length<=MAX_TEXT_BYTES);
  for(const s of src)assert(!s.text_content.content.includes('1234567890abcdef'));
});
test('reject unusable page OCR and malformed page order',()=>{
  assert.throws(()=>buildArchiveSources({id:'1234567890abcdef',name:'x.pdf',version:'1'},[{page:1,text:' '}]),/NO_EXTRACTED_TEXT/);
  assert.throws(()=>buildArchiveSources({id:'1234567890abcdef',name:'x.pdf',version:'1'},[{page:2,text:'Hi'}]),/INVALID_PAGE_ORDER/);
});
test('OAuth refresh missing: fail closed without network',async()=>{
  await assert.rejects(()=>getOAuthAccessToken({},'notebook',()=>{throw Error('must not call')}),/NOTEBOOK_OAUTH_NOT_CONFIGURED/);
});
test('Notebook create must perform GET and not claim ACTIVE while processing',async()=>{
  const calls=[];
  const fetchStub=async(url,opt)=>{
    calls.push(opt.method);
    if(url.includes('oauth2.googleapis.com'))return new Response(JSON.stringify({access_token:'mock-access'}),{status:200});
    if(opt.method==='POST')return new Response(JSON.stringify({name:env.NOTEBOOK_NAME+'/sources/12345678-1234'}),{status:200});
    return new Response(JSON.stringify({state:'PROCESSING'}),{status:200});
  };
  const r=await createNotebookSource(env,{display_name:'archive',text_content:{content:'Test'}},fetchStub);
  assert.equal(r.verified,false);
  assert.equal(r.state,'PROCESSING');
  assert.deepEqual(calls,['POST','POST','GET']);
});
test('Notebook 400 rejected, never mistaken for success',async()=>{
  const fetchStub=async url=>url.includes('oauth2')?
    new Response(JSON.stringify({access_token:'mock-access'}),{status:200}):
    new Response('{}',{status:400});
  await assert.rejects(()=>createNotebookSource(env,{display_name:'x',web_content:{url:'https://drive.google.com/file/d/secret/view'}},fetchStub),/NOTEBOOK_CREATE_HTTP_400/);
});
test('Drive metadata must belong to intended Shared Drive',async()=>{
  const config={...env,DRIVE_CLIENT_ID:'drive-client-123',DRIVE_CLIENT_SECRET:'drive-secret-123',
    DRIVE_REFRESH_TOKEN:'drive-refresh-123',ARCHIVE_DRIVE_ID:'expected-drive'};
  const fetchStub=async url=>url.includes('oauth2')?
    new Response(JSON.stringify({access_token:'mock-access'}),{status:200}):
    new Response(JSON.stringify({id:'1234567890abcdef',name:'x.pdf',mimeType:'application/pdf',
      size:'100',version:'1',driveId:'different-drive'}),{status:200});
  await assert.rejects(()=>fetchDrivePdf(config,'1234567890abcdef',fetchStub),/DRIVE_FILE_NOT_APPROVED/);
});
