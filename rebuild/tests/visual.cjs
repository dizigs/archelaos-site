/* Source screenshots alongside rebuild screenshots. Reference is the EXACT backup tree in this branch. */
const {chromium}=require('playwright');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const HOST='http://127.0.0.1:8765';
const dir=path.join(__dirname,'..','test-artifacts','visual-compare');
mkdirSync(dir,{recursive:true});
const pages=[
 ['index.html','home'],['history.html','museum'],['hall-of-fame.html','hall'],
 ['70-stigmes.html','moments'],['stories.html','stories'],['board.html','board'],
 ['sponsors.html','sponsors'],['contact.html','contact'],['tmimata.html','departments']
];
(async()=>{
 const browser=await chromium.launch({headless:true});
 const report=[];
 try{
  for(const viewport of [{width:1365,height:850},{width:390,height:844}]){
   for(const [file,label] of pages){
    const row={file,label,width:viewport.width,reference:null,rebuild:null};
    for(const type of ['reference','rebuild']){
     const page=await browser.newPage({viewport});
     const url=HOST+(type==='reference'?'/':'/rebuild/')+file;
     try{
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
      if(!response?.ok())throw Error('HTTP '+response?.status());
      await page.evaluate(()=>document.fonts?.ready).catch(()=>{});
      await page.waitForTimeout(500);
      const dest=path.join(dir,label+'-'+type+'-'+viewport.width+'.png');
      await page.screenshot({path:dest,fullPage:false,animations:'disabled',timeout:15000});
      row[type]=path.basename(dest);
     }catch(err){
      row[type+'Error']=String(err.message||err);
      console.warn('Screenshot reference issue',label,type,viewport.width,row[type+'Error']);
     }finally{await page.close()}
    }
    report.push(row);
   }
  }
 }finally{await browser.close()}
 writeFileSync(path.join(dir,'comparison-manifest.json'),JSON.stringify({
  source:'backup/pre-v3-restore-2026-10-31',head:'rebuild/clean-foundation',
  note:'Screenshots for human visual comparison; this job does not claim pixel-identical layouts.',
  pages:report
 },null,2));
 console.log('Generated comparison manifest',report.length,'viewports');
})().catch(e=>{console.error(e);process.exit(1)});
