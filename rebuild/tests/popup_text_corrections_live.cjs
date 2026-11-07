/* Remote preview UI QA; synthetic text only and no production writes. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE='https://feat-popup-text-corrections.archelaos-site.pages.dev';
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function main(){
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [1280,390]){
   const context=await browser.newContext({viewport:{width,height:850},locale:'el-GR'});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const res=await page.goto(BASE+'/hall-of-fame.html',{waitUntil:'domcontentloaded',timeout:30000});
   assert.equal(res.status(),200,'Hall page must load');
   const cfg=await page.request.get(BASE+'/api/text-corrections',{timeout:15000});
   assert.equal(cfg.status(),200);
   const status=await cfg.json();
   assert.equal(status.enabled,true,'Preview gated backend must report ready');
   assert.match(status.siteKey,/^0x4A/,'Real widget key needed in preview');
   await page.waitForTimeout(1400);
   const debug=await page.evaluate(()=>({url:location.href,hasFavorites:!!window.ArchelaosFavorites,hasBio:!!window.ArchelaosBio,globals:Object.keys(window).filter(k=>k.startsWith('Archelaos')).slice(0,20),scripts:[...document.scripts].map(x=>x.src).filter(Boolean).slice(-25),head:document.title}));
   console.log('PREVIEW_DIAGNOSTIC',JSON.stringify(debug),'pageErrors',JSON.stringify(errors));
   await page.waitForFunction(()=>Boolean(window.ArchelaosFavorites?.button&&window.ArchelaosBio?.open&&window.ArchelaosCorrections?.version===1),null,{timeout:7000});
   const opened=await page.evaluate(async()=>{
    const r=await fetch('/hall-of-fame-people.json');if(!r.ok)throw Error('canonical people missing');
    const doc=await r.json();const first=doc.people.find(x=>x.id&&x.name);if(!first)throw Error('no people');
    return await window.ArchelaosBio.open(first.id);
   });
   assert.equal(opened,true,'Canonical biography must open');
   const modal=page.locator('#arch-bio-global[open]');
   await modal.waitFor({state:'visible',timeout:8000});
   const pencil=modal.locator('.arch-correction-action');
   await pencil.waitFor({state:'visible',timeout:8000});
   assert.equal(await modal.locator('.arch-bio-inline-favorite').count(),1,'Favorite heart beside pencil');
   assert.equal(await pencil.count(),1,'Only one pencil');
   await pencil.click();
   const panel=modal.locator('.arch-correction-panel:not([hidden])');
   await panel.waitFor({state:'visible',timeout:8000});
   await panel.locator('textarea').fill('ΣΥΝΘΕΤΙΚΗ QA ΔΟΚΙΜΗ: καταχώριση αποδοχής, όχι πραγματική ιστορική μαρτυρία.');
   const send=panel.locator('button.arch-correction-send');
   assert.equal(await panel.locator('input[type="url"]').count(),1,'Public source link input');
   let solved=false;
   for(let n=0;n<27;n++){if(await send.isEnabled()){solved=true;break;}await sleep(800);}
   let result='not_submitted';
   if(solved&&width===1280){
    await send.click();
    await page.waitForFunction(()=>/καταγράφηκε|υπάρχει ήδη|απέτυχε|σφάλμα/i.test(document.querySelector('.arch-correction-status')?.textContent||''),null,{timeout:15000});
    const message=(await panel.locator('.arch-correction-status').textContent()||'').trim();
    result=/καταγράφηκε|υπάρχει ήδη/i.test(message)?'accepted':'failed';
    console.log('Backend answer:',result,'message:',message);
   }
   await panel.locator('.arch-correction-dismiss').click();
   assert.equal(await panel.isHidden(),true,'Panel closes correctly');
   assert.equal(errors.length,0,'Uncaught page errors: '+errors.join(' | '));
   console.log(JSON.stringify({width,opened,onePencil:true,formVisible:true,turnstileCompleted:solved,submission:result,pageErrors:errors.length}));
   await context.close();
  }
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
