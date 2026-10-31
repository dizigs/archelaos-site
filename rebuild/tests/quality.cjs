/* Read-only browser audit for every rebuilt release route.
   Detects horizontal overflow, inaccessible dialog controls, dead internal links
   and broken local image assets. Results are saved; no production changes. */
const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const BASE='http://127.0.0.1:8766';
const routes=[
 'index.html','history.html','hall-of-fame.html','70-stigmes.html',
 'stories.html','board.html','contact.html','sponsors.html',
 'tmimata.html','retro-matches.html'
];
const output=path.join(__dirname,'..','test-artifacts','quality');
mkdirSync(output,{recursive:true});
const views=[{width:320,height:720},{width:390,height:844},{width:768,height:960},{width:1365,height:850}];
const report={scope:'isolated local release only',tested:[],warnings:[],errors:[],links:[]};
function issue(level,where,message){report[level].push({where,message})}
async function audit(){
 const browser=await chromium.launch({headless:true});
 try{
  const seen=new Set();
  for(const view of views){
   const context=await browser.newContext({viewport:view,reducedMotion:view.width===320?'reduce':'no-preference'});
   const page=await context.newPage();
   page.on('pageerror',e=>issue('errors','JavaScript '+view.width,String(e.message)));
   for(const route of routes){
    const response=await page.goto(BASE+'/'+route,{waitUntil:'domcontentloaded',timeout:30000});
    if(!response?.ok()){issue('errors',route,'HTTP '+response?.status());continue}
    await page.locator('.arch-header').waitFor({timeout:10000});
    await page.locator('.arch-footer').waitFor({timeout:10000});
    await page.waitForTimeout(220);
    const metrics=await page.evaluate(()=>{
      const doc=document.documentElement,head=document.querySelector('.arch-header');
      const main=document.querySelector('main'),mainStyle=main?getComputedStyle(main):null;
      const links=[...document.querySelectorAll('a[href]')].map(a=>a.href);
      const imgs=[...document.images].filter(img=>img.complete&&!img.naturalWidth)
        .map(img=>img.getAttribute('src')).filter(Boolean).slice(0,10);
      return {overflow:Math.max(0,doc.scrollWidth-innerWidth),
        mainPresent:!!main,mainVisible:mainStyle?.display!=='none'&&mainStyle?.visibility!=='hidden',
        headerVisible:!!head&&getComputedStyle(head).visibility==='visible',
        missingImages:imgs,links,
        hasMotion:!!document.querySelector('link[href*="/motion.css"]'),
        reduced:matchMedia('(prefers-reduced-motion:reduce)').matches
      };
    });
    report.tested.push({route,width:view.width,overflow:metrics.overflow,
      motion:metrics.hasMotion,reducedMotion:metrics.reduced});
    if(!metrics.mainPresent||!metrics.mainVisible||!metrics.headerVisible||!metrics.hasMotion)
      issue('errors',route+'@'+view.width,'Main/header/motion unavailable');
    if(metrics.overflow>10)issue(metrics.overflow>50?'errors':'warnings',
      route+'@'+view.width,'Horizontal overflow '+metrics.overflow+'px');
    if(metrics.missingImages.length)issue('warnings',route+'@'+view.width,
      'Images failed to load: '+metrics.missingImages.join(', '));
    if(view.width===1365)for(const l of metrics.links)try{
      const url=new URL(l);if(url.origin===BASE&&url.pathname!=='/'&&url.pathname!=='')
        seen.add(url.pathname);
    }catch{}
    if(view.width<1170){
      const b=page.locator('.arch-menu-open');await b.click({timeout:6000});
      await page.locator('.arch-menu-dialog[open]').waitFor({timeout:6000});
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('.arch-menu-dialog')?.open,null,{timeout:6000});
      const stillLocked=await page.evaluate(()=>document.body.classList.contains('arch-dialog-open'));
      if(stillLocked)issue('errors',route+'@'+view.width,'Body stayed scroll-locked after menu Escape');
    }
    if(['history.html','hall-of-fame.html','stories.html','70-stigmes.html','board.html'].includes(route)){
      const opening={
        'history.html':'.mu-sport-item',
        'hall-of-fame.html':'.h-new-person',
        'stories.html':'.rs-card',
        '70-stigmes.html':'.rm-card',
        'board.html':'.bd-era'
      }[route];
      try{
       await page.locator(opening).first().click({timeout:9000});
       const dialog=page.locator('dialog.arch-dialog[open]');
       await dialog.waitFor({timeout:9000});
       const c=await dialog.locator('.arch-close').boundingBox();
       if(!c||c.width<28||c.height<28||c.x<0||c.x+c.width>view.width)
         issue('errors',route+'@'+view.width,'Modal close control inaccessible');
       await page.keyboard.press('Escape');
       await page.waitForFunction(()=>!document.querySelector('dialog.arch-dialog')?.open,null,{timeout:6000});
       if(await page.evaluate(()=>document.body.classList.contains('arch-dialog-open')))
         issue('errors',route+'@'+view.width,'Modal left body scroll locked');
      }catch(e){issue('errors',route+'@'+view.width,'Dialog interaction failed: '+String(e.message).slice(0,350))}
    }
   }
   await context.close();
  }
  // Verify unique internal destinations observed after the client has rendered.
  const urls=[...seen].filter(p=>!p.startsWith('/assets/'));
  for(const url of urls){
    try{
      const resp=await fetch(BASE+url,{method:'HEAD'});
      if(!resp.ok)issue('errors','internal link '+url,'HTTP '+resp.status);
      report.links.push({url,status:resp.status});
    }catch(e){issue('errors','internal link '+url,String(e.message))}
  }
 }finally{await browser.close()}
 writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log('Quality audit:',report.tested.length,'page/viewports,',
  report.links.length,'internal destinations,',report.warnings.length,'warnings,',
  report.errors.length,'errors');
 for(const finding of report.errors)console.error('QUALITY ERROR',finding.where,finding.message);
 for(const finding of report.warnings.slice(0,25))console.warn('QUALITY WARNING',finding.where,finding.message);
 if(report.errors.length)process.exitCode=1;
}
audit().catch(e=>{console.error(e);process.exit(1)});
