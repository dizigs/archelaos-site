/* Real release output smoke test. Serves dist/ on :8766, never deploys. */
const { chromium }=require('playwright');
const {mkdirSync,readdirSync}=require('node:fs');
const path=require('node:path');
const ROOT='http://127.0.0.1:8766';
const DEST=path.join(__dirname,'..','test-artifacts','release');
const files=[
 ['index.html','home'],['history.html','museum'],['hall-of-fame.html','hall'],
 ['70-stigmes.html','moments'],['stories.html','stories'],['board.html','board'],
 ['contact.html','contact'],['sponsors.html','sponsors'],
 ['tmimata.html','departments'],['retro-matches.html','retro']
];
async function verify(){
 mkdirSync(DEST,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const view of [{width:1365,height:850},{width:390,height:844}]){
   const page=await browser.newPage({viewport:view});
   const pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(e.message));
   for(const [name,tag] of files){
    const url=ROOT+'/'+name;
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000});
    if(!response?.ok())throw Error(name+': status '+response?.status());
    await page.locator('.arch-header').waitFor();
    await page.locator('.arch-footer').waitFor();
    const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
    if(!canonical?.startsWith('https://archelaos.club/'))throw Error(name+': missing canonical');
    const robots=await page.locator('meta[name=robots]').getAttribute('content');
    if(robots.includes('noindex'))throw Error(name+': release is noindex');
    const stageRefs=await page.locator('script[src^="/rebuild/"],link[href^="/rebuild/"]').count();
    if(stageRefs)throw Error(name+': staging asset leaked');
    if(tag==='hall')await page.waitForFunction(()=>document.querySelector('#hall-count')?.textContent.includes('682'));
    if(tag==='moments')await page.locator('.rm-moment').first().waitFor();
    if(tag==='museum')await page.locator('.mu-sport-item').first().waitFor();
    if(tag==='stories')await page.locator('.rs-card').first().waitFor();
    if(tag==='board')await page.locator('.bd-member').first().waitFor();
    if(tag==='departments')await page.locator('.dp-card').first().waitFor();
    if(tag==='retro')await page.locator('.rt-scoreboard').first().waitFor();
    if(tag==='home'){
     await page.locator('#new-slide-next').click();
     await page.waitForFunction(()=>document.querySelector('#new-slide-title')?.textContent.includes('Στίβος'));
    }
    if(tag==='contact'){
     const link=page.locator('[data-open-contact]').first();
     await link.click();await page.locator('dialog.arch-dialog[open] #ct-topic').waitFor();
     await page.locator('dialog.arch-dialog .arch-close').click();
     await page.goto(ROOT+'/contact.html?topic=athlete&sport=archery',{waitUntil:'domcontentloaded'});
     await page.locator('dialog.arch-dialog[open] #ct-topic').waitFor();
     if(await page.locator('#ct-topic').inputValue()!=='sport'||await page.locator('#ct-sport').inputValue()!=='archery')throw Error('Contact prefill incorrect');
     await page.locator('dialog.arch-dialog .arch-close').click();
    }
    const popup={hall:'.h-new-person',moments:'.rm-card',stories:'.rs-card',museum:'.mu-sport-item',board:'.bd-era',departments:'.dp-card',retro:'.rt-detail-open'}[tag];
    if(popup){
     await page.locator(popup).first().click();
     await page.locator('dialog.arch-dialog[open]').waitFor({timeout:7000});
     await page.locator('dialog.arch-dialog .arch-close').click();
    }
    if(view.width<500){
     await page.locator('.arch-menu-open').click();
     await page.locator('.arch-menu-dialog[open]').waitFor();
     await page.locator('.arch-menu-dialog .arch-close').click();
    }
    if(['home','hall','moments','contact'].includes(tag))
      await page.screenshot({path:path.join(DEST,tag+'-'+view.width+'.png'),animations:'disabled',fullPage:false});
   }
   if(pageErrors.length)throw Error('Browser errors: '+pageErrors.join(' | '));
   await page.close();
  }
  const profile=readdirSync(path.join(__dirname,'..','..','dist','people')).find(x=>x.endsWith('.html'));
  const p=await browser.newPage();
  const r=await p.goto(ROOT+'/people/'+profile,{waitUntil:'domcontentloaded'});
  if(!r?.ok()||await p.locator('link[rel=canonical]').count()!==1)throw Error('Legacy profile route broken');
  await p.close();
 } finally {await browser.close()}
 console.log('Release Chromium smoke checks passed on desktop/mobile and profile route.');
}
verify().catch(e=>{console.error(e);process.exit(1)});
