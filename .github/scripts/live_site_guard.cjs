// Public website health checks with Playwright, no private credentials.
const {chromium}=require('playwright');
const pages=['/','/news.html','/search.html','/hall-of-fame.html','/tmimata.html','/contact.html'];
(async()=>{
 const browser=await chromium.launch({headless:true});
 const failures=[];
 for(const mode of [{name:'desktop',width:1365,height:850},{name:'mobile',width:390,height:844}]){
  const ctx=await browser.newContext({viewport:mode,ignoreHTTPSErrors:false});
  for(const path of pages){
   const page=await ctx.newPage();
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e.message).slice(0,180)));
   try {
    const response=await page.goto('https://archelaos.club'+path,{waitUntil:'domcontentloaded',timeout:25000});
    await page.waitForTimeout(1200);
    if(!response||response.status()>=400)failures.push(mode.name+' '+path+' HTTP '+response?.status());
    if(await page.locator('.arch-footer').count()!==1)failures.push(mode.name+' '+path+' missing footer');
    if(await page.locator('.arch-header,header.arch-site-header').count()<1)failures.push(mode.name+' '+path+' missing header');
    if(errors.length)failures.push(mode.name+' '+path+' JS '+errors.join('; '));
   }catch(e){failures.push(mode.name+' '+path+' navigation error: '+String(e.message).slice(0,140));}
   await page.close();
  }
  await ctx.close();
 }
 await browser.close();
 if(failures.length){console.error('Live site checks failed:\n'+failures.join('\n'));process.exitCode=1}
 else console.log('Live site checks passed for '+pages.length+' pages on desktop and mobile');
})().catch(e=>{console.error(e.message);process.exitCode=1});
