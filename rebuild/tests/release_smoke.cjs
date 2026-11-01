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
 ['tmimata.html','departments'],['retro-matches.html','retro'],['search.html','search'],['favorites.html','favorites'],['contribute.html','contribute'],['interviews.html','interviews']
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
    await page.locator('.arch-a11y-launch').waitFor();
    if(await page.locator('.arch-footer').count()!==1)throw Error(name+': duplicate footer');
    if(await page.locator('.arch-a11y-launch').count()!==1)throw Error(name+': accessibility missing or duplicated');
    if(await page.locator('.arch-back-to-top').count()!==1)throw Error(name+': back-to-top missing');
    const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
    if(!canonical?.startsWith('https://archelaos.club/'))throw Error(name+': missing canonical');
    const robots=await page.locator('meta[name=robots]').getAttribute('content');
    if(robots.includes('noindex') && !['search.html','favorites.html'].includes(name))throw Error(name+': release is noindex');
    if(['search.html','favorites.html'].includes(name)&&!robots.includes('noindex'))throw Error('Private collection or search should be noindex');
    const stageRefs=await page.locator('script[src^="/rebuild/"],link[href^="/rebuild/"]').count();
    if(stageRefs)throw Error(name+': staging asset leaked');
    if(tag==='hall')await page.waitForFunction(()=>document.querySelector('#hall-count')?.textContent.includes('682'));
    if(tag==='moments')await page.locator('.rm-moment').first().waitFor();
    if(tag==='museum'){
     await page.locator('.mu-sports-link').first().waitFor();
     const modal=page.locator('dialog.arch-dialog');
     await page.locator('.mu-exhibit[data-year="1956"]').click();
     await modal.locator('.arch-dialog-body').waitFor();
     const founding=await modal.locator('.arch-dialog-body').innerText();
     if(!founding.includes('29 Απριλίου 1956')||founding.includes('27 Ιουνίου 1968'))
      throw Error('1956 Museum popup must show only the founding paragraph');
     await modal.locator('.arch-close').click();
     await page.locator('.mu-exhibit[data-year="1968"]').click();
     const colours=await modal.locator('.arch-dialog-body').innerText();
     if(!colours.includes('27 Ιουνίου 1968')||!colours.includes('Καθορίζονται οριστικώς')||colours.includes('29 Απριλίου 1956'))
      throw Error('1968 Museum popup must show only the club colours and historical quotation');
     await modal.locator('.arch-close').click();
    }
    if(tag==='stories')await page.locator('.rs-card').first().waitFor();
    if(tag==='board')await page.locator('.bd-member').first().waitFor();
    if(tag==='board'){
     await page.locator('.bd-era').first().click();
     const dialog=page.locator('dialog.arch-dialog[open]');
     await dialog.waitFor();
     if(/Έχετε συμπληρωματικά στοιχεία|Επικοινωνήστε μαζί μας|Have additional information|Contact us/i.test(await dialog.innerText()))
      throw Error('Redundant contact CTA leaked into historical Board popup');
     await dialog.locator('.arch-close').click();
     await dialog.waitFor({state:'hidden'});
    }
    if(tag==='departments'){
     await page.locator('.dp-card').first().waitFor();
     if(await page.locator('.dp-card').count()!==10)throw Error('Expected exactly 9 sports and 1 historical card');
     const sports=await page.evaluate(()=>{
      return [...document.querySelectorAll('.dp-card[data-dp-open]:not([data-dp-open="inactive-depts"])')].map(card=>({
       sport:card.dataset.dpOpen,
       background:getComputedStyle(card,'::before').backgroundImage,
       blur:getComputedStyle(card,'::before').filter,
       icon:getComputedStyle(card.querySelector('.dp-silhouette')).display,
       clickable:card.tagName==='BUTTON',
       label:card.textContent||''
      }));
     });
     if(sports.length!==9||sports.some(x=>!x.background.includes('url(')||!x.blur.includes('blur(')||x.icon!=='none'||!x.clickable||x.label.includes('Δείτε την ιστορία')))
      throw Error('Nine sport history cards must be clickable with blurred photos and no repeated CTA');
     const historical=page.locator('.dp-card[data-dp-open="inactive-depts"]');
     if(await historical.locator('.dp-title').count()!==1||
        await historical.locator('.dp-watermark').count()!==0||
        await historical.locator('.dp-silhouette').count()!==0)
      throw Error('Historical departments must keep the approved title-only design');
    }
    if(tag==='retro')await page.locator('.rt-scoreboard').first().waitFor();
    if(tag==='home'){
     // Real reviewed data: upcoming ONLY, both departments, no away games.
     const schedule=JSON.parse(require('node:fs').readFileSync(path.join(__dirname,'..','data','match-schedule.json'),'utf8'));
     const athensToday=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const upcoming=schedule.matches.filter(x=>x.start_at?Date.parse(x.start_at)>Date.now():x.date>=athensToday).length;
     await page.waitForFunction(()=>{const s=document.querySelector('#fx-status')?.textContent||'';return s.includes('προγραμματισμένοι')||s.includes('Δεν έχουν ανακοινωθεί')},null,{timeout:12000});
     if(await page.locator('.fx-card').count()!==Math.min(6,upcoming))throw Error('Incorrect upcoming match count');
     if(schedule.matches.length!==24||!schedule.matches.some(x=>x.away_team==='ΓΑΣ Αρχέλαος Κατερίνης'))throw Error('Reviewed away fixtures missing');
     if((await page.locator('#fx-download').isHidden())===Boolean(upcoming))throw Error('Wrong calendar download visibility');
     await page.locator('[data-fixture-sport="volleyball"]').click();
     if(await page.locator('[data-fixture-sport="volleyball"]').getAttribute('aria-pressed')!=='true')
       throw Error('Matchday sport filter not responding');
     await page.locator('#new-slide-next').click();
     await page.waitForFunction(()=>document.querySelector('#new-slide-title')?.textContent.includes('Στίβος'));
    }
    if(tag==='interviews'){
      await page.waitForFunction(()=>document.querySelectorAll('#cards .card').length===25,null,{timeout:12000});
      await page.locator('#cards .card').first().click();
      await page.locator('#dialog[open]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#dialog').waitFor({state:'hidden'});
    }
    if(tag==='search'){
     const catalog=await page.evaluate(async()=>{
       const archive=await window.ArchelaosCatalog.load();
       return {counts:archive.counts,person:archive.get('person','arch-5a04cbbb57e4')?.title,
        event:archive.get('exhibit','diia')?.url};
     });
     if(catalog.counts.person!==682||catalog.counts.moment!==70||catalog.counts.exhibit<24)
       throw Error('Common archive catalog incomplete');
     if(!catalog.person||catalog.event!=='/history.html#archive-diia')
       throw Error('Shared archive links mismatch');
     const field=page.locator('#sr-query');await field.fill('Κουκοδήμος');
     await page.waitForFunction(()=>document.querySelector('#sr-status')?.textContent.includes('αποτελέσματα') &&
       document.querySelector('#sr-results .sr-card')?.textContent.includes('Κουκοδήμος'),null,{timeout:9000});
     if(await page.locator('#sr-results .sr-card').count()===0)throw Error('Archive search returns no results');
     await page.locator('[data-sr-filter="exhibit"]').click();
     await field.fill('Δίια');
     await page.waitForFunction(()=>document.querySelector('#sr-results .sr-card')?.textContent.includes('Δίια'),null,{timeout:9000});
     const result=await page.locator('.sr-card[href*="/history.html#archive-"]').first().getAttribute('href');
     if(!result)throw Error('Museum search cannot deep-link to original exhibit');
     await page.goto(ROOT+result,{waitUntil:'domcontentloaded'});
     await page.locator('dialog.arch-dialog[open]').waitFor();
     await page.locator('dialog.arch-dialog .arch-favorite-toggle').click();
     await page.locator('dialog.arch-dialog .arch-close').click();
     await page.goto(ROOT+'/search.html',{waitUntil:'domcontentloaded'});
     await page.locator('#sr-query').fill('Κουκοδήμος');
     await page.locator('[data-sr-filter="moment"]').click();
     await page.locator('[data-sr-filter="person"]').click();
     if(await page.locator('#sr-results .sr-card').count()===0)throw Error('Person search filter returns no results');
    }
    if(tag==='favorites'){
     // The search scenario bookmarked a museum exhibit earlier in this same browser.
     // Reset only test-owned favorites before verifying a new empty collection.
     await page.evaluate(()=>window.ArchelaosFavorites.clear());
     await page.locator('.av-empty').waitFor();
     await page.evaluate(()=>window.ArchelaosFavorites.toggle('moment','1'));
     await page.locator('.av-card').first().waitFor();
     const contribute=await page.locator('.av-card .av-contribute').first().getAttribute('href');
     if(!contribute?.includes('/contribute.html?kind=moment')||
        !contribute.includes('title='))throw Error('Favorite has no contextual archive contribution link');
     await page.reload({waitUntil:'domcontentloaded'});
     await page.locator('.av-card').first().waitFor();
     if(!await page.locator('.av-card').first().textContent())throw Error('Favorites not restored after reload');
     await page.locator('.av-card-hit').first().click();
     const favoriteDialog=page.locator('dialog.arch-dialog[open]');
     await favoriteDialog.waitFor();
     if(!await favoriteDialog.locator('#arch-dialog-title').textContent())throw Error('Favorite moment popup has no title');
     await favoriteDialog.locator('.arch-close').click();
     await favoriteDialog.waitFor({state:'hidden'});

     await page.evaluate(()=>window.ArchelaosFavorites.toggle('photo','sport-archery'));
     await page.locator('[data-av-filter="photo"]').click();
     await page.locator('.av-card .av-photo').first().waitFor({state:'attached'});
     await page.locator('.av-card-hit').first().click();
     const photoDialog=page.locator('dialog.arch-dialog[open]');
     await photoDialog.waitFor();
     if(!await photoDialog.locator('.av-dialog-photo img').count())throw Error('Favorite photo popup does not contain the saved image');
     await photoDialog.locator('.arch-close').click();
     await photoDialog.waitFor({state:'hidden'});

     await page.locator('.av-card .arch-favorite-toggle').first().click();
          await page.locator('[data-av-filter="moment"]').click();
     if(await page.locator('.av-card').count()!==1)throw Error('Favorites filter failed');
     await page.locator('.av-card .arch-favorite-toggle').first().click();
     await page.locator('.av-empty').waitFor();
     // Cards also open popups for biographies, stories and museum exhibits.
     await page.locator('[data-av-filter="all"]').click();
     for(const [type,id] of [['person','arch-5a04cbbb57e4'],['story','1'],['exhibit','intro']]){
      await page.evaluate(([t,k])=>window.ArchelaosFavorites.toggle(t,k),[type,id]);
      await page.locator('.av-card-hit').first().click();
      const dlg=page.locator('dialog.arch-dialog[open]');
      await dlg.waitFor();
      if(!await dlg.locator('#arch-dialog-title').textContent())throw Error('Missing '+type+' popup title in favorites');
      await dlg.locator('.arch-close').click();
      await dlg.waitFor({state:'hidden'});
      await page.locator('.av-card .arch-favorite-toggle').first().click();
      await page.locator('.av-empty').waitFor();
     }
    }
    if(tag==='contribute'){
     await page.locator('.av-verify-card').first().waitFor({timeout:10000});
     if(await page.locator('.av-verify-card').count()!==9)
       throw Error('Verification requests not present for all nine departments');
     await page.locator('#av-verify-filter').selectOption('archery');
     if(await page.locator('.av-verify-card').count()!==1)
       throw Error('Documentation request sport filtering failed');
     const evidenceLink=await page.locator('.av-verify-card a').getAttribute('href');
     if(!evidenceLink.includes('verification=request-archery-historical-records'))
       throw Error('Evidence card has no stable request ID');
     await page.goto(ROOT+evidenceLink,{waitUntil:'domcontentloaded'});
     await page.waitForFunction(()=>document.querySelector('#ac-guide-context')?.textContent.includes('Αίτημα προς τεκμηρίωση:'),{timeout:10000});

     if((await page.locator('#ac-guide-context').textContent()).includes('request-'))throw Error('Internal evidence request ID is publicly shown');
     // Private identification is recorded in the prepared email, even if credit is declined.
     if(await page.locator('#ac-credit-consent').isChecked())throw Error('Public name credit should be opt-in');
     if(await page.locator('#ac-credit-name-wrap').isVisible())throw Error('Public display name should be hidden by default');
     await page.locator('#ac-sender-name').fill('Μαρία Δοκιμή');
     const anonymousDraft=decodeURIComponent(await page.locator('#ac-guide-email').getAttribute('href'));
     if(!anonymousDraft.includes('Μαρία Δοκιμή')||!anonymousDraft.includes('ΟΧΙ — χωρίς δημόσια ονομαστική αναφορά'))
       throw Error('Contributor identity or private-only consent is not included in draft');
     await page.locator('#ac-credit-consent').check();
     if(!await page.locator('#ac-credit-name-wrap').isVisible())throw Error('Credit name field not displayed after opt-in');
     await page.locator('#ac-credit-name').fill('Μ. Δοκιμή');
     const namedDraft=decodeURIComponent(await page.locator('#ac-guide-email').getAttribute('href'));
     if(!namedDraft.includes('Μ. Δοκιμή')||!namedDraft.includes('ΝΑΙ — επιτρέπω την αναφορά'))
       throw Error('Explicitly approved display-name credit missing from email draft');
     await page.locator('#ac-credit-consent').uncheck();
     if(await page.locator('#ac-credit-name-wrap').isVisible())throw Error('Credit name field leaked after opt-out');
     const finalDraft=decodeURIComponent(await page.locator('#ac-guide-email').getAttribute('href'));
     if(finalDraft.includes('Μ. Δοκιμή'))throw Error('Opted-out public credit leaked into prepared email');
     const contextualMail=decodeURIComponent(await page.locator('#ac-guide-email').getAttribute('href'));
     if(!contextualMail.includes('request-archery-historical-records'))
       throw Error('Evidence request ID missing from real email draft');
     if(await page.locator('#ac-attachments[type="file"][multiple]').count()!==1||
        await page.locator('#ac-archive-link[type="url"]').count()!==1)
        throw Error('Contribution guide must offer attachments and Drive URL');
     // Intercept the endpoint: test secure multipart delivery without actually emailing anyone.
     let postedContribution='';
     await page.route('**/api/contact',async route=>{
      const request=route.request();
      if(request.method()==='GET'){
       await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ready:true,attachments:true})});
      }else if(request.method()==='POST'){
       postedContribution=request.postData()||'';
       await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      }else await route.fulfill({status:405});
     });
     await page.locator('#ac-sender-email').fill('archive-tester@example.org');
     await page.locator('#ac-archive-link').fill('https://drive.google.com/drive/folders/test');
     await page.locator('#ac-details').fill('Ιστορική φωτογραφία με πλήρη στοιχεία τεκμηρίωσης');
     await page.locator('#ac-attachments').setInputFiles({
      name:'historical-source.txt',mimeType:'text/plain',
      buffer:Buffer.from('Archive evidence for automated browser test')
     });
     await page.locator('#ac-guide-send').click();
     if(!/συγκατάθεσή/.test(await page.locator('#ac-guide-status').textContent()))
      throw Error('Secure contribution must require independent private-contact consent');
     await page.locator('#ac-private-consent').check();
     await page.locator('#ac-guide-send').click();
     await page.waitForFunction(()=>document.querySelector('#ac-guide-status')?.textContent.includes('στάλθηκε επιτυχώς'),null,{timeout:12000});
     if(!postedContribution.includes('name="topic"')||!postedContribution.includes('archive')||
        !postedContribution.includes('historical-source.txt')||
        !postedContribution.includes('drive.google.com/drive/folders/test')||
        !postedContribution.includes('archive-tester@example.org')||
        !postedContribution.includes('name="consent"'))
      throw Error('Secure archive submission dropped metadata, attachment, Drive URL or consent');
     await page.unroute('**/api/contact');
     const email=await page.locator('.ac-email').getAttribute('href');
     if(!email?.startsWith('mailto:info@archelaos.club?subject='))throw Error('Contribution contact email missing');
     await page.locator('#ac-type').selectOption({label:'Αγώνας ή αποτέλεσμα'});
     await page.locator('#ac-date').fill('1994');
     await page.locator('#ac-details').fill('Κύπελλο Ελλάδας');
     const prepared=await page.locator('#ac-guide-email').getAttribute('href');
     if(!decodeURIComponent(prepared).includes('Κύπελλο Ελλάδας')||
        !decodeURIComponent(prepared).includes('1994')||
        !decodeURIComponent(prepared).includes('Αγώνας ή αποτέλεσμα'))
        throw Error('Archive contribution email draft does not reflect fields');
     if(await page.locator('[data-i18n-slot]:visible').count())
        throw Error('Unfinished language switch appeared on site');
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
    const popup={hall:'.h-new-person',moments:'.rm-card',stories:'.rs-card',museum:'.mu-exhibit',board:'.bd-era',departments:'.dp-card',retro:'.rt-detail-open'}[tag];
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
    if(tag==='home'){
      const trigger=page.locator('.arch-a11y-launch');
      await trigger.click();
      await page.locator('#arch-a11y-panel[open]').waitFor();
      await page.locator('#arch-a11y-size').selectOption('125');
      if(await page.locator('body[data-arch-a11y-size="125"]').count()!==1)
        throw Error('Text-size accessibility setting does not apply');
      await page.locator('[data-arch-a11y-toggle="links"]').click();
      if(await page.locator('[data-arch-a11y-toggle="links"]').getAttribute('aria-pressed')!=='true')
        throw Error('Underline links control not enabled');
      await page.keyboard.press('Escape');
      await page.locator('#arch-a11y-panel').waitFor({state:'hidden'});
      if(await trigger.getAttribute('aria-expanded')!=='false')
        throw Error('Accessibility dialog aria-expanded not reset');
      await trigger.click();
      await page.locator('.arch-a11y-reset').click();
      await page.locator('.arch-a11y-close').click();
      if(await page.locator('body[data-arch-a11y-size="100"]').count()!==1)
        throw Error('Accessibility preferences did not reset');
      await page.evaluate(()=>window.scrollTo({top:700,behavior:'auto'}));
      await page.locator('.arch-back-to-top:visible').waitFor({timeout:5000});
      await page.locator('.arch-back-to-top').click();
      await page.waitForFunction(()=>window.scrollY<8,null,{timeout:9000});
    }
    if(['home','hall','moments','contact','favorites','contribute'].includes(tag))
      await page.screenshot({path:path.join(DEST,tag+'-'+view.width+'.png'),animations:'disabled',fullPage:false});
   }
   if(pageErrors.length)throw Error('Browser errors: '+pageErrors.join(' | '));
   await page.close();
  }
  // Fake public schedule delivered ONLY inside the test browser, never committed as real games.
  const fakeSchedule={schema_version:1,approval_policy:'owner_approved_only',display_policy:'home_and_away',timezone:'Europe/Athens',
    matches:[
      {id:'fixture-ui-test-001',sport:'handball',home_team:'ΓΑΣ Αρχέλαος',away_team:'Δοκιμαστική Α',
       start_at:'2099-05-11T18:30:00+03:00',end_at:'2099-05-11T20:30:00+03:00',end_at_verified:true,
       status:'scheduled',competition:'Δοκιμαστική διοργάνωση',
       venue:'Δοκιμαστικό γήπεδο',approval:{status:'owner_approved',reviewed_on:'2099-05-01T12:00:00+03:00'}},
      {id:'fixture-ui-test-002',sport:'volleyball',home_team:'ΓΑΣ Αρχέλαος',away_team:'Δοκιμαστική Β',
       date:'2099-05-12',kickoff_status:'time_to_be_announced',status:'scheduled',
       competition:'Δοκιμαστική διοργάνωση',
       approval:{status:'owner_approved',reviewed_on:'2099-05-01T12:00:00+03:00'}}
    ]};
  const matchPage=await browser.newPage();
  await matchPage.route('**/assets/site/data/match-schedule.json',route=>
     route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fakeSchedule)}));
  await matchPage.goto(ROOT+'/',{waitUntil:'domcontentloaded'});
  await matchPage.locator('.fx-card').first().waitFor({timeout:12000});
  if(await matchPage.locator('.fx-card').count()!==2)
    throw Error('Matchday did not render two approved test fixtures');
  const firstMatch=matchPage.locator('.fx-card').first();
  await firstMatch.locator('details summary').click();
  const ownIcs=await firstMatch.locator('a[download]').getAttribute('href');
  if(ownIcs!=='/calendar/events/fixture-ui-test-001.ics')
    throw Error('Single-match calendar link missing or incorrect');
  const google=await firstMatch.locator('a[href*="calendar.google.com"]').getAttribute('href');
  const outlook=await firstMatch.locator('a[href*="outlook.live.com"]').getAttribute('href');
  if(!google.includes('20990511T153000Z')||!google.includes('20990511T173000Z')||!outlook.includes('2099-05-11'))
    throw Error('Provider calendar event times inaccurate');
  const second=matchPage.locator('.fx-card').nth(1);
  await second.locator('details summary').click();
  if(await second.locator('a[href*="calendar.google.com"]').count())
    throw Error('A calendar end time was invented for a match without a verified end');
  if(!(await second.locator('.fx-calendar-note').textContent()).includes('ολοήμερη υπενθύμιση'))
    throw Error('A date-only fixture must never pretend to have a kickoff hour');
  if(!(await second.locator('.fx-clock').textContent()).includes('Ώρα προς ανακοίνωση'))
    throw Error('Unknown kickoff hour displayed incorrectly');
  await matchPage.locator('[data-fixture-sport="handball"]').click();
  if(await matchPage.locator('.fx-card').count()!==1)
    throw Error('Approved Matchday filter failed');
  await matchPage.close();

  // Check the reciprocal UI with a controlled approved graph fixture only.
  // This test does NOT publish or approve the historical records.
  const demo={
   schema_version:1,publication_scope:'approved_only',
   events:[{id:'arc-test-verified-1983',title:'Δοκιμαστικό εγκεκριμένο γεγονός',
    sport:'handball',sports:['handball'],
    temporal:{precision:'year',year:1983},
    summary:'Δοκιμή εμφάνισης εγκεκριμένων στοιχείων και αμφίδρομων συνδέσεων.',
    moment_ids:[],sources:[{provider:'Δοκιμή',title:'Ελεγχόμενη πηγή',url:'https://example.org/'}],
    people:[{id:'arch-803dd3926e77',name:'Δημήτρης Σκούφας',role:'Προπονητής'}]}],
   by_person:{'arch-803dd3926e77':['arc-test-verified-1983']},
   by_event:{'arc-test-verified-1983':['arch-803dd3926e77']}
  };
  const relatedPage=await browser.newPage();
  await relatedPage.route('**/assets/site/data/approved-event-graph.json',route=>
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(demo)}));
  await relatedPage.goto(ROOT+'/hall-of-fame.html?person=arch-803dd3926e77',{waitUntil:'domcontentloaded'});
  await relatedPage.locator('dialog.arch-dialog[open] .arch-related-card').waitFor({timeout:10000});
  await relatedPage.locator('dialog.arch-dialog[open] .arch-related-card').first().click();
  await relatedPage.locator('dialog.arch-dialog[open] .arch-related-contribute').waitFor();
  if(!(await relatedPage.locator('dialog.arch-dialog[open] .arch-dialog-body').textContent()).includes('Συνδεδεμένα πρόσωπα'))
   throw Error('Approved event does not show reciprocal people');
  await relatedPage.locator('dialog.arch-dialog[open] .arch-related-card').first().click();
  await relatedPage.locator('dialog.arch-dialog[open] .arch-related-card').waitFor();
  await relatedPage.close();
  // The error route must use the same footer/accessibility/top components.
  const notFound=await browser.newPage();
  await notFound.goto(ROOT+'/404.html',{waitUntil:'domcontentloaded'});
  await notFound.locator('.arch-footer').waitFor();
  await notFound.locator('.arch-a11y-launch').waitFor();
  if(await notFound.locator('.arch-footer').count()!==1||
     await notFound.locator('.arch-back-to-top').count()!==1)
    throw Error('404 page missing shared footer/back-to-top');
  await notFound.close();
  const profile=readdirSync(path.join(__dirname,'..','..','dist','people')).find(x=>x.endsWith('.html'));
  const p=await browser.newPage();
  const r=await p.goto(ROOT+'/people/'+profile,{waitUntil:'domcontentloaded'});
  if(!r?.ok()||await p.locator('link[rel=canonical]').count()!==1)throw Error('Legacy profile route broken');
  await p.locator('.arch-header').waitFor();
  await p.locator('.arch-footer').waitFor();
  await p.locator('.arch-a11y-launch').waitFor();
  if(await p.locator('body > header, body > footer').count()!==2||
     await p.locator('.arch-back-to-top').count()!==1)
    throw Error('Legacy profile has duplicate shell or missing shared utilities');
  const profileHeart=p.locator('.profile-actions .arch-favorite-toggle');
  await profileHeart.waitFor();
  await profileHeart.click();
  if(await profileHeart.getAttribute('aria-pressed')!=='true')throw Error('Direct profile favorite missing');
  await p.reload({waitUntil:'domcontentloaded'});
  await p.locator('.profile-actions .arch-favorite-toggle[aria-pressed="true"]').waitFor();
  const oldLinks=await p.locator('a[href="/history-events.html"]').count();
  if(oldLinks)throw Error('Removed history-events link survived on profile');
  await p.close();
 } finally {await browser.close()}
 console.log('Release Chromium smoke checks passed on desktop/mobile and profile route.');
}
verify().catch(e=>{console.error(e);process.exit(1)});
