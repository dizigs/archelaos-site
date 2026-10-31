/* Browser QA of the research-only, read-only owner review dashboard. */
const {chromium}=require('playwright');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
const TARGET='http://127.0.0.1:8765/rebuild/research/review-board.html';
const OUT=path.join(__dirname,'..','test-artifacts','editor');
async function main(){
 mkdirSync(OUT,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const viewport of [{width:1365,height:850},{width:390,height:844}]){
   const page=await browser.newPage({viewport});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(TARGET,{waitUntil:'domcontentloaded'});
   if(!response?.ok())throw Error('Review dashboard unavailable');
   await page.locator('.entry').first().waitFor();
   if(await page.locator('.entry').count()!==19)throw Error('Owner board needs all researched events');
   const initialCount=await page.locator('#total').textContent();
   if(initialCount!=='19')throw Error('Historical event counter incorrect');
   await page.locator('#sport').selectOption('archery');
   const sportCount=await page.locator('.entry').count();
   if(sportCount<1||sportCount>=19)throw Error('Department filter did not narrow');
   await page.locator('#sport').selectOption('all');
   await page.locator('#status').selectOption('candidate');
   const candidate=await page.locator('.entry').count();
   if(candidate<1)throw Error('No candidate records in review board');
   await page.locator('.entry-check input:not([disabled])').first().check();
   if(await page.locator('#copy').isDisabled())throw Error('Owner instruction never enabled');
   await page.locator('#status').selectOption('blocked');
   if(await page.locator('.entry').count()<1)throw Error('Conflicts not made visible');
   if(errors.length)throw Error(errors.join(' | '));
   await page.screenshot({path:path.join(OUT,'review-board-'+viewport.width+'.png'),animations:'disabled'});
   await page.close();
  }
 }finally{await browser.close()}
 console.log('EDITOR REVIEW BROWSER QA OK: responsive preview, all events, filters, conflict locks and owner selection.');
}
main().catch(err=>{console.error(err);process.exit(1)});
