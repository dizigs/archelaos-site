/** Credential-free helpers for the private Librarian Worker. */
export const NOTEBOOK_API = 'https://notebook.googleapis.com/v1';
export const MAX_TEXT_BYTES = 850000;
const enc = new TextEncoder();
export function assertFileId(x) {
  if (typeof x !== 'string' || !/^[A-Za-z0-9_-]{8,180}$/.test(x)) throw Error('INVALID_FILE_ID');
  return x;
}
export function safeTitle(x, tag='ARCHELAOS') {
  if (typeof x !== 'string' || !x.trim()) throw Error('EMPTY_TITLE');
  return (tag + ' ' + x.replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,500);
}
export function safePublicUrl(x) {
  if (typeof x !== 'string' || x.length > 1600) throw Error('INVALID_NEWS_URL');
  let u;
  try { u = new URL(x); } catch { throw Error('INVALID_NEWS_URL'); }
  if (u.protocol!=='https:' || u.username || u.password || u.port || u.hash ||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/i.test(u.hostname) ||
      /(^|\.)(drive\.google\.com|docs\.google\.com)$/.test(u.hostname) ||
      /(token|access_token|key|signature|password|secret)/i.test(u.search)) throw Error('NON_PUBLIC_NEWS_URL');
  return u.toString();
}
export function buildNewsSource(article) {
  if (!article || typeof article.id !== 'string' || !/^[\w.-]{3,150}$/.test(article.id)) throw Error('INVALID_NEWS_ID');
  if (typeof article.title !== 'string' || !article.title.trim()) throw Error('EMPTY_NEWS_TITLE');
  return {display_name:safeTitle(article.id+' — '+article.title,'ARCHELAOS NEWS'),web_content:{url:safePublicUrl(article.sourceUrl)}};
}
export function buildArchiveSources(file,pages) {
  assertFileId(file?.id);
  if (typeof file.name!=='string' || typeof file.version!=='string') throw Error('INVALID_FILE_METADATA');
  if (!Array.isArray(pages) || !pages.length || pages.length>5000) throw Error('INVALID_PAGES');
  const header='ΓΑΣ Αρχέλαος — PDF: '+file.name+'\nRevision: '+file.version+'\n';
  const out=[];
  let text=header, start=null, end=null;
  const emit=()=>{
    if(start===null) return;
    out.push({display_name:safeTitle(file.name+' — σελίδες '+start+'-'+end,'ARCHELAOS ARCHIVE'),
      mime_type:'text/markdown',text_content:{content:text}});
    text=header;start=null;end=null;
  };
  for (let i=0;i<pages.length;i++) {
    const p=pages[i];
    if (!p || p.page!==i+1 || typeof p.text!=='string') throw Error('INVALID_PAGE_ORDER');
    const content=p.text.trim();
    if (!content) continue;
    let rest=Array.from(content);
    while(rest.length) {
      const lead='\n\n## Σελίδα '+p.page+'\n';
      let available=MAX_TEXT_BYTES-enc.encode(text+lead).length;
      if(available<1200){emit();available=MAX_TEXT_BYTES-enc.encode(text+lead).length;}
      let count=Math.min(rest.length,available);
      let seg=rest.slice(0,count).join('');
      while(enc.encode(seg).length>available){count=Math.floor(count*.9);seg=rest.slice(0,count).join('');}
      if(!count) throw Error('PAGE_TOO_LARGE');
      text+=lead+seg; start??=p.page;end=p.page;
      rest=rest.slice(count);if(rest.length)emit();
    }
  }
  emit();
  if(!out.length) throw Error('NO_EXTRACTED_TEXT');
  return out;
}
export async function sha256(text){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function getOAuthAccessToken(env,kind,fetchImpl=fetch){
  const p=kind==='drive'?'DRIVE':'NOTEBOOK';
  const id=env[p+'_CLIENT_ID'],secret=env[p+'_CLIENT_SECRET'],refresh=env[p+'_REFRESH_TOKEN'];
  if (![id,secret,refresh].every(x=>typeof x==='string'&&x.length>8)) throw Error(p+'_OAUTH_NOT_CONFIGURED');
  const body=new URLSearchParams({client_id:id,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'});
  const r=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'manual'});
  if(!r.ok || r.status>=300&&r.status<400) throw Error(p+'_OAUTH_REFRESH_FAILED_'+r.status);
  const d=await r.json();
  if(typeof d.access_token!=='string'||!d.access_token)throw Error(p+'_OAUTH_TOKEN_MISSING');
  return d.access_token;
}
export async function createNotebookSource(env,source,fetchImpl=fetch){
  const notebook=env.NOTEBOOK_NAME,project=env.NOTEBOOK_PROJECT_ID;
  if(typeof notebook!=='string'||!/^notebooks\/[0-9a-fA-F-]{16,80}$/.test(notebook))throw Error('INVALID_NOTEBOOK');
  if(typeof project!=='string'||!/^[a-z][a-z0-9-]{4,60}$/.test(project))throw Error('INVALID_PROJECT');
  const body=JSON.stringify(source);
  if(enc.encode(body).length>1000000) throw Error('SOURCE_TOO_LARGE');
  const token=await getOAuthAccessToken(env,'notebook',fetchImpl);
  const headers={Authorization:'Bearer '+token,'x-goog-user-project':project,'Content-Type':'application/json'};
  const r=await fetchImpl(NOTEBOOK_API+'/'+notebook+'/sources',{method:'POST',headers,body,redirect:'manual'});
  if(!r.ok || r.status>=300&&r.status<400)throw Error('NOTEBOOK_CREATE_HTTP_'+r.status);
  const d=await r.json();
  if(typeof d.name!=='string'||!d.name.startsWith(notebook+'/sources/'))throw Error('NOTEBOOK_INVALID_RESPONSE');
  const check=await fetchImpl(NOTEBOOK_API+'/'+d.name,{method:'GET',headers,redirect:'manual'});
  if(!check.ok || check.status>=300&&check.status<400)throw Error('NOTEBOOK_READBACK_HTTP_'+check.status);
  const state=await check.json();
  return {sourceName:d.name,state:state.state||'PROCESSING',verified:state.state==='ACTIVE'};
}
export async function fetchDriveMetadata(env,fileId,fetchImpl=fetch){
  assertFileId(fileId);
  if(typeof env.ARCHIVE_DRIVE_ID!=='string'||!env.ARCHIVE_DRIVE_ID)throw Error('ARCHIVE_DRIVE_UNCONFIGURED');
  const token=await getOAuthAccessToken(env,'drive',fetchImpl);
  const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId);
  const headers={Authorization:'Bearer '+token};
  const r=await fetchImpl(url+'?fields=id,name,mimeType,size,version,driveId&supportsAllDrives=true',{headers,redirect:'manual'});
  if(!r.ok || r.status>=300&&r.status<400)throw Error('DRIVE_METADATA_HTTP_'+r.status);
  const m=await r.json();
  if(m.id!==fileId||m.driveId!==env.ARCHIVE_DRIVE_ID||m.mimeType!=='application/pdf')throw Error('DRIVE_FILE_NOT_APPROVED');
  if(/(ιατρ|τιμολ|μισθωτ|οικονομ|φορολογ|προσωπ|medical|invoice|bank)/i.test(m.name||''))throw Error('SENSITIVE_PDF_REVIEW_REQUIRED');
  const size=Number(m.size);
  if(!Number.isFinite(size)||size<=0||size>60000000)throw Error('DRIVE_FILE_SIZE_UNSUPPORTED');
  return {meta:{id:fileId,name:m.name,version:String(m.version)},url,headers};
}
export async function fetchDrivePdf(env,fileId,fetchImpl=fetch){
  const {meta,url,headers}=await fetchDriveMetadata(env,fileId,fetchImpl);
  const r=await fetchImpl(url+'?alt=media&supportsAllDrives=true',{headers,redirect:'manual'});
  if(!r.ok||!r.body||r.status>=300&&r.status<400)throw Error('DRIVE_DOWNLOAD_HTTP_'+r.status);
  return {meta,body:r.body};
}
