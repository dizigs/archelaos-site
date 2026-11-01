/* Preview a source-backed inline answer inside the search page. Never calls real AI. */
const {chromium}=require('playwright');
const ROOT='http://127.0.0.1:8766';
async function main(){
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,1365]){
   const page=await browser.newPage({viewport:{width,height:850}});
   let questions=[],fail=false;
   await page.route('**/search.html',async route=>{
    const original=await route.fetch();
    const markup=(await original.text()).replace(
      'id="sr-ai" class="sr-ai" data-enabled="false"',
      'id="sr-ai" class="sr-ai" data-enabled="true"');
    await route.fulfill({response:original,body:markup});
   });
   await page.route('**/api/ask',async route=>{
    questions.push(route.request().postDataJSON()?.question);
    await route.fulfill({status:fail?429:200,contentType:'application/json',
      body:JSON.stringify(fail?{error:'limit'}:{
       answer:'Απάντηση βασισμένη στο δημοσιευμένο αρχείο. [1]',
       sources:[{id:1,title:'Τεκμήριο τοξοβολίας',url:'/hall-of-fame.html?person=arch-abc123456789'},
                {id:2,title:'Μη έγκυρη πηγή',url:'https://evil.example/tracker'}]})});
   });
   await page.goto(ROOT+'/search.html');
   const field=page.locator('#sr-query');
   const panel=page.locator('#sr-ai');
   if(await panel.isVisible())throw Error('AI panel must wait until a query');
   await field.fill('τοξοβολία');
   await panel.waitFor({state:'visible',timeout:8000});
   await page.locator('#sr-ai-run').click();
   await page.waitForFunction(()=>document.querySelector('#sr-ai-output')?.textContent.includes('Απάντηση'));
   if(questions.length!==1)throw Error('Expected only one explicit model request');
   if(await page.locator('#sr-ai-output a').count()!==1)
    throw Error('Unsafe external AI source link was not rejected');
   if(await page.locator('#sr-results .sr-card').count()===0)
    throw Error('AI response replaced ordinary search results');
   const geom=await panel.boundingBox();
   if(geom.x<0||geom.x+geom.width>width+2)throw Error('AI inline panel overflow on '+width);
   fail=true;
   await field.fill('χάντμπολ');
   await page.waitForFunction(()=>document.querySelector('#sr-ai-output')?.textContent==='');
   await page.locator('#sr-ai-run').click();
   await page.waitForFunction(()=>document.querySelector('#sr-ai-output')?.textContent.includes('ημερήσια'));
   if(await page.locator('#sr-results .sr-card').count()===0)
    throw Error('429 failed to preserve ordinary search');
   await page.close();
  }
  console.log('INLINE AI SEARCH UI OK: mobile/desktop, cited results, no automatic calls, safe fallback');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
