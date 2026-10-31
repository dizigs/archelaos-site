/* Isolated browser checks. Never deploys or mutates production pages. */
const { chromium } = require('playwright');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
const ROOT='http://127.0.0.1:8765';
const output=path.join(__dirname,'..','test-artifacts');
mkdirSync(output,{recursive:true});
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
   for(const [url,name] of [['index.html','home'],['hall-of-fame.html','hall'],['70-stigmes.html','moments'],['stories.html','stories'],['history.html','museum'],['board.html','board'],['contact.html','contact'],['sponsors.html','sponsors'],['tmimata.html','departments']]){
    await page.goto(ROOT+'/rebuild/'+url,{waitUntil:'domcontentloaded'});
    await page.locator('.arch-header').waitFor();
    await page.locator('.arch-footer').waitFor();
    if(name==='hall')await page.waitForFunction(()=>document.querySelector('#hall-count')?.textContent.includes('682'),{timeout:20000});
    if(name==='moments')await page.locator('.rm-moment').first().waitFor({timeout:20000});
    if(name==='stories')await page.locator('.rs-card').first().waitFor({timeout:20000});
    if(name==='museum')await page.locator('.mu-sport-item').first().waitFor({timeout:20000});
    if(name==='board')await page.locator('.bd-member').first().waitFor({timeout:20000});
    if(name==='contact')await page.locator('[data-open-contact]').first().waitFor();
    if(name==='sponsors')await page.locator('.sp-values article').first().waitFor();
    if(name==='departments')await page.locator('.dp-card').first().waitFor();
    if(name==='home'){
     await page.locator('#new-slide-next').click();
     await page.waitForFunction(()=>document.querySelector('#new-slide-title')?.textContent.includes('Στίβος'));
    }
    const first={hall:'.h-new-person',moments:'.rm-card',stories:'.rs-card',museum:'.mu-sport-item',board:'.bd-era',departments:'.dp-card'}[name];
    if(name==='contact'){
     await page.locator('[data-open-contact]').first().click();
     await page.locator('dialog.arch-dialog[open] #ct-topic').waitFor();
     await page.locator('dialog.arch-dialog .arch-close').click();
    }
    if(first){
     await page.locator(first).first().click();
     await page.locator('dialog.arch-dialog[open]').waitFor({timeout:8000});
     await page.locator('dialog.arch-dialog .arch-close').click();
     if(await page.locator('dialog.arch-dialog[open]').count())throw Error(name+': dialog did not close');
    }
    if(size.width<500){
     await page.locator('.arch-menu-open').click();
     await page.locator('.arch-menu-dialog[open]').waitFor();
     await page.locator('.arch-menu-dialog .arch-close').click();
    }
    await page.screenshot({path:path.join(output,name+'-'+size.width+'.png'),fullPage:true,animations:'disabled'});
   }
   if(errors.length)throw Error('JavaScript: '+errors.join(' | '));
   await page.close();
  }
 }finally{await browser.close()}
}
run().then(()=>console.log('Chromium smoke tests passed')).catch(e=>{console.error(e);process.exit(1)});
