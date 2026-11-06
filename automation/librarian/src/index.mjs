/** ARCHELAOS private Librarian. No public HTTP routes or scheduled processing. */
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { assertFileId, buildArchiveSources, buildNewsSource, createNotebookSource,
  fetchDrivePdf, fetchDriveMetadata, getOAuthAccessToken, sha256, NOTEBOOK_API,
  approvedPdf, verifyCaller } from './core.mjs';

export class LibrarianLedger extends DurableObject {
  async fetch(request) {
    if(!this.env.LEDGER_INTERNAL_KEY || request.headers.get('X-Ledger-Key')!==this.env.LEDGER_INTERNAL_KEY)
      return new Response('Not found',{status:404});
    const path=new URL(request.url).pathname;
    const data=await request.json().catch(()=>null);
    if(!data||typeof data.key!=='string'||!/^[a-f0-9]{64}$/.test(data.key))
      return Response.json({error:'INVALID_LEDGER_KEY'},{status:400});
    if(path==='/reserve') {
      const status=await this.ctx.storage.transaction(async tx=>{
        const prior=await tx.get(data.key);
        if(prior)return {created:false,status:prior.status};
        await tx.put(data.key,{status:'RESERVED',sourceName:null,kind:data.kind||'unknown'});
        return {created:true,status:'RESERVED'};
      });
      return Response.json(status);
    }
    if(path==='/record'){
      if(!['SUBMITTED','ACTIVE','UNKNOWN'].includes(data.status) ||
          (data.sourceName!==undefined && (typeof data.sourceName!=='string' ||
            !/^notebooks\/[0-9a-fA-F-]{16,80}\/sources\/[A-Za-z0-9-]{8,128}$/.test(data.sourceName))))
        return Response.json({error:'INVALID_LEDGER_RECORD'},{status:400});
      const status=await this.ctx.storage.transaction(async tx=>{
        const prior=await tx.get(data.key);
        if(!prior || (prior.sourceName && data.sourceName && prior.sourceName!==data.sourceName) ||
           (prior.status==='ACTIVE' && data.status!=='ACTIVE') ||
           (data.status==='ACTIVE' && !(data.sourceName||prior.sourceName)))return {ok:false};
        await tx.put(data.key,{...prior,status:data.status,sourceName:data.sourceName||prior.sourceName});
        return {ok:true};
      });
      return Response.json(status);
    }
    if(path==='/get')return Response.json({entry:await this.ctx.storage.get(data.key)||null});
    return new Response('Not found',{status:404});
  }
}

export default class Librarian extends WorkerEntrypoint {
  async fetch(){return new Response('Not found',{status:404});}

  async #ledger(path,data){
    if(!this.env.LEDGER||!this.env.LEDGER_INTERNAL_KEY)throw Error('LEDGER_NOT_CONFIGURED');
    const stub=this.env.LEDGER.get(this.env.LEDGER.idFromName('private-librarian-ledger-v1'));
    const r=await stub.fetch(new Request('https://private-ledger.local'+path,{
      method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Key':this.env.LEDGER_INTERNAL_KEY},
      body:JSON.stringify(data)}));
    if(!r.ok)throw Error('LEDGER_OPERATION_FAILED');
    return r.json();
  }

  async #submit(key,source,kind){
    const prior=await this.#ledger('/reserve',{key,kind});
    if(!prior.created)return {status:'SKIPPED_DUPLICATE_OR_PENDING',record:prior.status};
    // Reserve durably before any external write; an ambiguous delivery is UNKNOWN.
    let result;
    try { result=await createNotebookSource(this.env,source); }
    catch {
      await this.#ledger('/record',{key,status:'UNKNOWN'});
      throw Error('NOTEBOOK_DELIVERY_UNKNOWN');
    }
    const updated=await this.#ledger('/record',{key,sourceName:result.sourceName,
      status:result.verified?'ACTIVE':'SUBMITTED'});
    if(!updated.ok)throw Error('LEDGER_RECORD_FAILED');
    return {status:result.verified?'ACTIVE':'SUBMITTED',verified:result.verified};
  }

  // Existing news collector / central brain signals a canonical published ID.
  // This Worker reads only the PUBLIC news.json, never a caller-provided URL.
  async importPublishedNews({newsId,authorization}){
    if(this.env.NEWS_IMPORT_ENABLED!=='true')throw Error('NEWS_IMPORT_DISABLED');
    if(typeof newsId!=='string'||!/^[\w.-]{3,150}$/.test(newsId))throw Error('INVALID_NEWS_ID');
    await verifyCaller(this.env,authorization,'news',newsId);
    const allowed=(this.env.NEWS_SOURCE_ALLOWED_HOSTS||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);
    if(!allowed.length)throw Error('NEWS_HOST_ALLOWLIST_MISSING');
    const response=await fetch('https://archelaos.club/news.json',{redirect:'manual',headers:{Accept:'application/json'}});
    if(!response.ok || response.status>=300&&response.status<400)throw Error('CANONICAL_NEWS_UNAVAILABLE');
    const data=await response.json();
    const article=(data.items||[]).find(x=>x.id===newsId);
    if(!article)throw Error('NEWS_NOT_PUBLISHED');
    const source=buildNewsSource(article,allowed);
    const key=await sha256('news|'+article.id+'|'+source.web_content.url);
    return this.#submit(key,source,'news');
  }

  // Explicitly requested one-time test. Google documentation says Drive URLs
  // are unsupported by Notebook CreateSource; record the real status if tried.
  async probeApprovedDriveLink({fileId,authorization}){
    assertFileId(fileId);
    if(this.env.DRIVE_LINK_PROBE_ENABLED!=='true')throw Error('DRIVE_LINK_PROBE_DISABLED');
    const allow=(this.env.APPROVED_PDF_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!allow.includes(fileId))throw Error('PDF_APPROVAL_REQUIRED');
    await verifyCaller(this.env,authorization,'drive',fileId);
    const approval=approvedPdf(this.env,fileId);
    const {meta}=await fetchDriveMetadata(this.env,fileId);
    if(meta.version!==approval.version)throw Error('PDF_REVISION_MISMATCH');
    const key=await sha256('private-drive-link-test|'+fileId);
    return this.#submit(key,{display_name:'ARCHELAOS PRIVATE DRIVE LINK TEST',
      web_content:{url:'https://drive.google.com/file/d/'+fileId+'/view'}},'drive-link-probe');
  }

  // Requires an APPROVED, separately implemented PRIVATE OCR service.
  // A Worker cannot run a local Tesseract binary; the service binding
  // must return {pages:[{page:1,text:'...'},...]} with no public egress.
  async importApprovedPdf({fileId,authorization}){
    assertFileId(fileId);
    if(this.env.ARCHIVE_IMPORT_ENABLED!=='true')throw Error('ARCHIVE_IMPORT_DISABLED');
    const allow=(this.env.APPROVED_PDF_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!allow.includes(fileId))throw Error('PDF_APPROVAL_REQUIRED');
    await verifyCaller(this.env,authorization,'drive',fileId);
    const approval=approvedPdf(this.env,fileId);
    if(!this.env.PDF_EXTRACTOR)throw Error('PDF_EXTRACTOR_NOT_CONFIGURED');
    const {meta,body}=await fetchDrivePdf(this.env,fileId,fetch,approval);
    const response=await this.env.PDF_EXTRACTOR.fetch(new Request('https://pdf-extractor.internal/extract',{
      method:'POST',body,headers:{'Content-Type':'application/pdf','X-PDF-Mode':'text-then-greek-ocr'},duplex:'half'}));
    if(!response.ok)throw Error('PRIVATE_PDF_EXTRACTION_FAILED');
    const outputBytes=Number(response.headers.get('content-length'));
    if(outputBytes>8000000)throw Error('PRIVATE_OCR_OUTPUT_TOO_LARGE');
    const raw=await response.text();
    if(new TextEncoder().encode(raw).length>8000000)throw Error('PRIVATE_OCR_OUTPUT_TOO_LARGE');
    let result;
    try {result=JSON.parse(raw);}catch{throw Error('INVALID_PRIVATE_OCR_OUTPUT');}
    if(!Array.isArray(result.pages)||result.pages.length>5000 ||
        result.sha256!==meta.sha256 || result.revision!==meta.version ||
        typeof result.engine!=='string' || !result.engine ||
        result.pages.some(p=>typeof p?.text!=='string' || p.text.length>1000000))
      throw Error('INVALID_PRIVATE_OCR_OUTPUT');
    const sources=buildArchiveSources(meta,result.pages);
    const receipts=[];
    for(let i=0;i<sources.length;i++){
      const source=sources[i];
      const key=await sha256('drive|'+meta.id+'|'+meta.version+'|'+i+'|'+await sha256(source.text_content.content));
      receipts.push(await this.#submit(key,source,'archive'));
    }
    return {status:'ARCHIVE_SUBMISSIONS_CHECKED',totalChunks:sources.length,receipts};
  }

  async checkSource({sourceName,authorization}){
    if(typeof sourceName!=='string'||!/^notebooks\/[0-9a-fA-F-]{16,80}\/sources\/[A-Za-z0-9-]{8,128}$/.test(sourceName))
      throw Error('INVALID_NOTEBOOK_SOURCE');
    await verifyCaller(this.env,authorization,'review',sourceName);
    if(!sourceName.startsWith(this.env.NOTEBOOK_NAME+'/sources/'))
      throw Error('NOTEBOOK_SOURCE_OUT_OF_SCOPE');
    const token=await getOAuthAccessToken(this.env,'notebook');
    const response=await fetch(NOTEBOOK_API+'/'+sourceName,{redirect:'manual',
      headers:{Authorization:'Bearer '+token,'x-goog-user-project':this.env.NOTEBOOK_PROJECT_ID}});
    if(!response.ok)throw Error('NOTEBOOK_GET_HTTP_'+response.status);
    const data=await response.json();
    return {state:data.state||'UNKNOWN',active:data.state==='ACTIVE'};
  }
}
