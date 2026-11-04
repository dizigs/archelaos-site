/* Isolated browser checks. Never deploys or mutates production pages. */
const { chromium } = require('playwright');
const {mkdirSync,readFileSync}=require('node:fs');
const path=require('node:path');
const ROOT='http://127.0.0.1:8765';
const output=path.join(__dirname,'..','test-artifacts');
mkdirSync(output,{recursive:true});
const hallMaster=JSON.parse(readFileSync(path.join(__dirname,'..','..','hall-of-fame-people.json'),'utf8'));
const expectedHallCount=hallMaster.people.length;
if(hallMaster.count!==expectedHallCount)throw Error('Canonical Hall metadata count mismatch');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 let lastError;
 for(let n=0;n<30;n++){try{const r=await fetch(ROOT+'/rebuild/index.html');if(r.ok)break}catch(e){lastError=e}await wait(150)}
 const browser=await chromium.launch({headless:true});
 try{
  for(const size of [{width:1365,height:850},{width:390,height:844}]){
   const page=await browser.newPage({viewport:size});
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   for(const [url,name] of [['index.html','home'],['hall-of-fame.html','hall'],['70-stigmes.html','moments'],['stories.html','stories'],['history.html','museum'],['board.html','board'],['contact.html','contact'],['sponsors.html','sponsors'],['tmimata.html','departments'],['retro-matches.html','retro'],['search.html','search'],['favorites.html','favorites'],['contribute.html','contribute'],['interviews.html','interviews']]){
    await page.goto(ROOT+'/rebuild/'+url,{waitUntil:'domcontentloaded'});
    await page.locator('.arch-header').waitFor();
    await page.locator('.arch-footer').waitFor();
    const sponsorLabel=await page.locator('.arch-nav a[href*="sponsors.html"]').first().textContent();
    if(sponsorLabel.trim()!=='Χορηγίες')throw Error('Global menu label changed unexpectedly: '+sponsorLabel);
    const logoTarget=await page.locator('.arch-brand').getAttribute('href');
    if(logoTarget!='/rebuild/index.html')throw Error('Brand link not stage-safe: '+logoTarget);
    if(name==='favorites'){
      await page.locator('.av-empty').waitFor();
      await page.evaluate(()=>window.ArchelaosFavorites.toggle('story','1'));
      await page.locator('.av-card').first().waitFor();
      if(!await page.locator('.av-card').first().textContent())throw Error('Favorite did not show');
      await page.locator('.av-card .arch-favorite-toggle').click();
      await page.locator('.av-empty').waitFor();
      // A favorite saved before two verified identity mergers must still resolve.
      const migrated=await page.evaluate(()=>{
       const f=window.ArchelaosFavorites;
       f.toggle('person','arch-bdac478e7ea3');
       f.toggle('person','arch-22eae49bbbc0');
       const ids=f.get().filter(x=>x.type==='person').map(x=>x.id).sort((a,b)=>a.localeCompare(b));
       f.toggle('person','arch-bdac478e7ea3');
       f.toggle('person','arch-22eae49bbbc0');
       return ids;
      });
      if(migrated.join(',')!==['arch-7f975b16bebf','arch-82df0f64b81d'].sort((a,b)=>a.localeCompare(b)).join(','))
       throw Error('Historic person favorites did not migrate: '+JSON.stringify(migrated));
    }
    if(name==='contribute'){
      if(await page.locator('#ac-attachments[type="file"][multiple]').count()!==1||await page.locator('#ac-archive-link[type="url"]').count()!==1)
       throw Error('Archive contribution must support attachments and Google Drive URLs');
      const email=await page.locator('#ac-guide-email').getAttribute('href');
      if(!email?.startsWith('mailto:'))throw Error('Missing archive contact');
    }
    if(name==='museum'){
      const firstCollection=page.locator('#mu-collection-cards a').first();
      await firstCollection.waitFor({timeout:20000});
      const href=await firstCollection.getAttribute('href');
      if(!href.startsWith('/rebuild/'))throw Error('Dynamic museum card leaves rebuild: '+href);
    }
    if(name==='hall'){
     try{
      await page.waitForFunction(expected=>
       document.querySelector('#hall-total')?.textContent===String(expected) &&
       document.querySelector('#hall-count')?.textContent.startsWith(expected+' από '+expected+' πρόσωπα'),
       expectedHallCount,{timeout:20000});
     }catch(error){
      const detail=await page.evaluate(()=>({
       total:document.querySelector('#hall-total')?.textContent,
       count:document.querySelector('#hall-count')?.textContent,
       language:document.documentElement.lang,
       biographyModule:typeof window.ArchelaosBio
      }));
      throw Error('Hall preview expectation failed: '+JSON.stringify(detail)+
       '; errors='+errors.join(' | ')+'; '+error.message);
     }
    }
    if(name==='moments')await page.locator('.rm-moment').first().waitFor({timeout:20000});
    if(name==='stories')await page.locator('.rs-card').first().waitFor({timeout:20000});
    if(name==='museum')await page.locator('.mu-sports-link').first().waitFor({timeout:20000});
    if(name==='board')await page.locator('.bd-member').first().waitFor({timeout:20000});
    if(name==='contact')await page.locator('[data-open-contact]').first().waitFor();
    if(name==='sponsors')await page.locator('.sp-values article').first().waitFor();
    if(name==='departments')await page.locator('.dp-card').first().waitFor();
    if(name==='retro')await page.locator('.rt-scoreboard').first().waitFor();
    if(name==='home'){
     await page.waitForFunction(expected=>document.querySelector('#new-people-total')?.textContent===expected.toLocaleString('el-GR'),expectedHallCount,{timeout:20000});
     if(await page.locator('#upcoming-matches,.fx-card,.fx-calendar-actions,[data-fixture-sport]').count()) throw Error('Removed homepage calendar returned');
     if(await page.locator('a[href$=".ics"],a[href^="webcal:"]').count()) throw Error('Calendar links returned');
     // Preview-safe links: static links are rewritten on load; dynamic links on focus/click.
     const routed=await page.evaluate(()=>{
       const a=document.createElement('a');a.href='/hall-of-fame.html?person=arch-test#biography';
       a.id='dynamic-preview-route-test';a.textContent='Dynamic preview route';document.body.append(a);a.focus();
       const actual=a.getAttribute('href');a.remove();
       const external=document.createElement('a');external.href='https://example.org/';
       document.body.append(external);external.focus();const untouched=external.href;external.remove();
       return {actual,untouched};
     });
     if(routed.actual!=='/rebuild/hall-of-fame.html?person=arch-test#biography')
       throw Error('Dynamically created link escapes rebuild: '+routed.actual);
     if(routed.untouched!=='https://example.org/')
       throw Error('Preview rewrote an external URL');
     // Switching between related archive popups must reuse one modal and keep scroll locked.
     const modal=await page.evaluate(()=>{
       const trigger=document.createElement('button');
       trigger.id='dialog-focus-regression';trigger.textContent='Dialog opener';
       document.body.append(trigger);trigger.focus();
       window.ArchelaosUI.openDialog({title:'Αρχικό βιογραφικό',body:'Πρώτο κείμενο'});
       const first=document.querySelector('dialog.arch-dialog');
       window.ArchelaosUI.openDialog({title:'Συνδεδεμένο γεγονός',body:'Δεύτερο κείμενο'});
       return {opened:first.open,title:first.querySelector('h2')?.textContent,
               dialogs:document.querySelectorAll('dialog.arch-dialog[open]').length,
               locked:document.body.classList.contains('arch-dialog-open')};
     });
     if(!modal.opened||modal.title!=='Συνδεδεμένο γεγονός'||modal.dialogs!==1||!modal.locked)
       throw Error('Related popup navigation replaced the native modal incorrectly: '+JSON.stringify(modal));
     await page.locator('dialog.arch-dialog .arch-close').click();
     await page.waitForFunction(()=>
       !document.querySelector('dialog.arch-dialog')?.open &&
       !document.body.classList.contains('arch-dialog-open') &&
       document.activeElement?.id==='dialog-focus-regression');
     const restored=await page.evaluate(()=>{
       const focus=document.activeElement?.id;
       const locked=document.body.classList.contains('arch-dialog-open');
       document.querySelector('#dialog-focus-regression')?.remove();
       return {focus,locked};
     });
     if(restored.focus!=='dialog-focus-regression'||restored.locked)
       throw Error('Popup close did not restore focus and page scroll: '+JSON.stringify(restored));
     await page.locator('#new-slide-next').click();
     await page.waitForFunction(()=>document.querySelector('#new-slide-title')?.textContent.includes('Στίβος'));
    }
    const first={hall:'.h-new-person',moments:'.rm-card',stories:'.rs-card',museum:'.mu-exhibit',board:'.bd-era',departments:'.dp-card',retro:'.rt-detail-open'}[name];
    if(name==='contact'){
     await page.locator('[data-open-contact]').first().click();
     await page.locator('dialog.arch-dialog[open] #ct-topic').waitFor();
     await page.locator('dialog.arch-dialog .arch-close').click();
     await page.goto(ROOT+'/rebuild/contact.html?topic=athlete&sport=archery',{waitUntil:'domcontentloaded'});
     await page.locator('dialog.arch-dialog[open] #ct-topic').waitFor();
     if(await page.locator('#ct-topic').inputValue()!=='sport')throw Error('Contact topic not prefilled');
     if(await page.locator('#ct-sport').inputValue()!=='archery')throw Error('Archery sport not prefilled');
     await page.locator('dialog.arch-dialog .arch-close').click();
    }
    if(first){
     await page.locator(first).first().click();
     await page.locator('dialog.arch-dialog[open]').waitFor({timeout:8000});
     await page.locator('dialog.arch-dialog .arch-close').click();
     if(await page.locator('dialog.arch-dialog[open]').count())throw Error(name+': dialog did not close');
    }
    if(name==='hall'){
     await page.goto(ROOT+'/rebuild/hall-of-fame.html?person=arch-bdac478e7ea3',{waitUntil:'domcontentloaded'});
     await page.locator('dialog.arch-dialog[open]').waitFor({timeout:8000});
     const mergedBio=await page.locator('dialog.arch-dialog[open]').textContent();
     if(!mergedBio?.includes('Αντωνάτος'))throw Error('Old Hall deep link failed to resolve to canonical profile');
     await page.locator('dialog.arch-dialog .arch-close').click();
    }
    if(size.width<500){
     await page.locator('.arch-menu-open').click();
     await page.locator('.arch-menu-dialog[open]').waitFor();
     await page.locator('.arch-menu-dialog .arch-close').click();
    }
    await page.screenshot({path:path.join(output,name+'-'+size.width+'.png'),fullPage:true,animations:'disabled'});
   }
   if(errors.length)throw Error('Browser console errors: '+errors.join(' | '));
   await page.close();
  }
 }finally{await browser.close()}
}
run().then(()=>console.log('Chromium smoke tests passed')).catch(e=>{console.error(e);process.exit(1)});
