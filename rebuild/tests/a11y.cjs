/* Static release accessibility QA: automated audit + keyboard/landmark checks.
 * axe cannot replace human screen-reader and assistive-technology verification. */
const {chromium}=require('playwright');
const {mkdirSync,writeFileSync,readdirSync,readFileSync}=require('node:fs');
const path=require('node:path');
const BASE='http://127.0.0.1:8766';
const OUTPUT=path.join(__dirname,'..','test-artifacts','accessibility');
const allProfiles=readdirSync(path.join(__dirname,'..','..','dist','people')).filter(x=>x.startsWith('arch-')&&x.endsWith('.html'));
const hall=JSON.parse(readFileSync(path.join(__dirname,'..','..','hall-of-fame-people.json'),'utf8'));
const personIds=hall.people.map(p=>p.id);
const unique=new Set(personIds);
if(hall.count!==personIds.length || unique.size!==personIds.length ||
   allProfiles.length!==personIds.length ||
   allProfiles.some(filename=>!unique.has(filename.slice(0,-5))))
  throw Error('Published profiles must match every canonical Hall of Fame ID, count and file');
const routes=['index.html','history.html','hall-of-fame.html','70-stigmes.html',
 'stories.html','board.html','contact.html','sponsors.html','tmimata.html',
 'retro-matches.html','search.html','favorites.html','contribute.html',
 'interviews.html','404.html','people/'+allProfiles[0]];
// Full route coverage at representative mobile + desktop widths; geometric QA
// independently tests six responsive widths.
const viewports=[{width:390,height:844},{width:1280,height:800}];
const report={guideline:'WCAG 2.2 A/AA',scope:'built local release',checks:[],violations:[],errors:[]};
function fail(where,msg){report.errors.push({where,message:msg})}
async function test(){
 mkdirSync(OUTPUT,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const size of viewports){
   const context=await browser.newContext({viewport:size,reducedMotion:size.width===320?'reduce':'no-preference'});
   const page=await context.newPage();
   page.on('pageerror',e=>fail('runtime@'+size.width,e.message));
   for(const route of routes){
    const where=route+'@'+size.width;
    try{
     const response=await page.goto(BASE+'/'+route,{waitUntil:'domcontentloaded',timeout:20000});
     if(!response?.ok()){fail(where,'HTTP '+response?.status());continue}
     await page.locator('.arch-header').waitFor();
     await page.locator('.arch-footer').waitFor();
     await page.locator('.arch-a11y-launch').waitFor();
     if(await page.locator('.arch-footer').count()!==1)fail(where,'Expected exactly one footer');
     if(await page.locator('.arch-a11y-launch').count()!==1)fail(where,'Accessibility launch missing or duplicated');
     if(await page.locator('.arch-back-to-top').count()!==1)fail(where,'Back-to-top control missing or duplicated');
     const trigger=page.locator('.arch-a11y-launch');
     await trigger.click();
     await page.locator('#arch-a11y-panel[open]').waitFor();
     await page.keyboard.press('Escape');
     await page.locator('#arch-a11y-panel').waitFor({state:'hidden'});
     // A native dialog fires its close event asynchronously after it becomes
     // hidden; wait for intentional focus restoration before testing Enter on
     // the next toolbar control, or the late close handler can steal focus.
     await page.waitForFunction(()=>document.activeElement===document.querySelector('.arch-a11y-launch'),null,{timeout:3000});
     if(await trigger.getAttribute('aria-expanded')!=='false')fail(where,'Accessibility dialog ARIA state did not reset');
     if(await page.locator('main').count()!==1)fail(where,'Main landmark not unique');
     if(await page.locator('h1').count()!==1)fail(where,'Primary heading not unique');
     if(await page.locator('[data-i18n-slot]:visible').count())fail(where,'Draft language control exposed');
     const socials=await page.locator('.arch-footer-social a').count();
     if(socials!==3)fail(where,'Expected three named footer social links');
     if(await page.locator('.arch-footer-social a:not([aria-label])').count())
       fail(where,'Unlabelled footer icon link');
     if(route==='contribute.html'){
       if(await page.locator('.ac-guide-field :is(input,select,textarea):not([id])').count())
         fail(where,'Unlabelled archive contribution input');
       await page.locator('#ac-type').selectOption({label:'Αγώνας ή αποτέλεσμα'});
       await page.locator('#ac-date').fill('1994');
       const email=decodeURIComponent(await page.locator('#ac-guide-email').getAttribute('href'));
       if(!email.includes('1994')||!email.includes('Αγώνας ή αποτέλεσμα'))
         fail(where,'Email draft did not update');
     }
     if(size.width<1250){
       const menu=page.locator('.arch-menu-open');
       await menu.focus();
       await page.keyboard.press('Enter');
       await page.locator('.arch-menu-dialog[open]').waitFor({timeout:5000});
       await page.keyboard.press('Escape');
       await page.waitForFunction(()=>!document.querySelector('.arch-menu-dialog')?.open);
       if(await menu.getAttribute('aria-expanded')!=='false')fail(where,'Menu aria-expanded not reset');
       if(!await menu.evaluate(el=>el===document.activeElement))fail(where,'Keyboard focus not returned to menu');
     }
     await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
     const axe=await page.evaluate(async()=>window.axe.run(document,{
       runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}
     }));
     report.checks.push({where,passes:axe.passes.length,incomplete:axe.incomplete.length});
     for(const v of axe.violations){
       report.violations.push({where,id:v.id,impact:v.impact,description:v.description,
         nodes:v.nodes.slice(0,4).map(n=>({target:n.target,summary:n.failureSummary?.slice(0,400)}))});
     }
    }catch(e){fail(where,String(e.message).slice(0,600))}
   }
   await context.close();
  }
 }finally{await browser.close()}
 writeFileSync(path.join(OUTPUT,'report.json'),JSON.stringify(report,null,2));
 console.log('Accessibility audit:',report.checks.length,'page/viewports;',
   report.violations.length,'axe findings;',report.errors.length,'interaction errors');
 const serious=report.violations.filter(v=>v.impact==='serious'||v.impact==='critical');
 for(const v of serious.slice(0,20))console.warn('A11Y',v.where,v.impact,v.id,JSON.stringify(v.nodes.map(n=>n.target)));
 for(const e of report.errors)console.error('INTERACTION',e.where,e.message);
 // New shared navigation must work even if older archived content needs remediation.
 if(report.errors.length||report.violations.some(v=>['critical','serious'].includes(v.impact)))process.exitCode=1;
}
test().catch(e=>{console.error(e);process.exit(1)});
