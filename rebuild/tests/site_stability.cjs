/* Functional regressions against the real dist release. No production writes. */
'use strict';
const assert = require('node:assert/strict');
const {mkdirSync, writeFileSync, readFileSync} = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const BASE = process.env.SITE_STABILITY_BASE_URL || 'http://127.0.0.1:8766';
const OUTPUT = path.join(__dirname, '..', 'test-artifacts', 'site-stability');
const routes = ['index.html', 'news.html', 'history.html', 'hall-of-fame.html',
  '70-stigmes.html', 'stories.html', 'board.html', 'contact.html', 'sponsors.html',
  'tmimata.html', 'retro-matches.html', 'interviews.html', 'search.html',
  'favorites.html', 'contribute.html', 'privacy.html', '404.html',
  'people/arch-77461943b4f2.html'];
const views = [{width:320,height:568}, {width:390,height:844},
  {width:768,height:1024}, {width:1365,height:850}];
const cardSelector = '.arch-card,.h-new-person,.rs-card,.rs-featured-card,' +
  '.dp-card,.mu-exhibit,.rm-card,.bd-era,.rt-detail-open,.new-board-card,' +
  '.arch-related-card,.an-card-hit';
const report = {scope:'local dist only; external resources blocked for deterministic tests',
  cases:[], routes:[], cards:0};

async function settled(locator) {
  await locator.evaluate(async node => {
    await Promise.all(node.getAnimations({subtree:true})
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
}
async function visit(page, route) {
  const response = await page.goto(BASE + '/' + route, {waitUntil:'domcontentloaded'});
  assert.equal(response.status(), 200, route);
  await page.locator('.arch-header').waitFor();
  await page.locator('.arch-footer').waitFor();
}
async function closed(page, selector) {
  await page.waitForFunction(sel => !document.querySelector(sel)?.open, selector);
  await settled(page.locator(selector));
  await page.waitForFunction(() => !document.body.classList.contains('arch-dialog-open'));
  if (selector === '.arch-menu-dialog') await page.waitForFunction(() =>
    document.querySelector('.arch-menu-open').getAttribute('aria-expanded') === 'false');
}
async function run(browser, name, viewport, test) {
  if (process.env.SITE_STABILITY_CASE && process.env.SITE_STABILITY_CASE !== name) return;
  const context = await browser.newContext({viewport, reducedMotion:'reduce',
    isMobile:viewport.width < 1024, hasTouch:viewport.width < 1024});
  // Test local UI behavior, not third-party fonts, photos or social services.
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin
    ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await test(page);
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    report.cases.push({name, width:viewport.width, passed:true});
    console.log('PASS', viewport.width, name);
  } catch (error) {
    report.cases.push({name, width:viewport.width, passed:false, error:error.message});
    console.error('FAIL', viewport.width, name, error.message);
    if (process.env.GITHUB_ACTIONS === 'true') {
      // JSON escapes line breaks; escape % as well so page/fixture text cannot
      // inject workflow commands. Expose the actual case without log archives.
      const detail = JSON.stringify({width:viewport.width, case:name,
        browser:report.browserVersion, error:String(error.message).slice(0,1200)}).replace(/%/g, '%25');
      console.error('::error file=rebuild/tests/site_stability.cjs,title=Site stability regression::' + detail);
    }
    await page.screenshot({path:path.join(OUTPUT, viewport.width + '-' + name + '.png')}).catch(() => {});
  } finally { await context.close(); }
}

async function navigation(page, view) {
  for (const route of routes) {
    await visit(page, route);
    assert.equal(await page.locator('.arch-header').count(), 1, route + ': duplicate header');
    assert.equal(await page.locator('.arch-footer').count(), 1, route + ': duplicate footer');
    const layout = await page.evaluate(() => ({
      overflow:document.documentElement.scrollWidth - innerWidth,
      clipped:[...document.querySelectorAll('main h1,main h2,main h3')]
        .filter(node => {
          if (!node.clientWidth || !node.clientHeight) return false;
          const range = document.createRange(); range.selectNodeContents(node);
          const text = range.getBoundingClientRect();
          // Font ink may exceed line-height while overflow is visible. Only flag
          // text actually crossing an ancestor's clipping boundary.
          for (let parent = node; parent && parent !== document.body; parent = parent.parentElement) {
            const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
            if (['hidden','clip'].includes(style.overflowX) &&
                (text.left < box.left - 2 || text.right > box.right + 2)) return true;
            if (['hidden','clip'].includes(style.overflowY) &&
                (text.top < box.top - 2 || text.bottom > box.bottom + 2)) return true;
          }
          return false;
        })
        .map(node => node.textContent.trim()),
      headerTop:document.querySelector('.arch-header').getBoundingClientRect().top
    }));
    assert.ok(layout.overflow <= 2, route + ': horizontal overflow ' + layout.overflow);
    assert.deepEqual(layout.clipped, [], route + ': clipped heading');
    assert.equal(layout.headerTop, 0, route + ': navigation moved away from viewport top');
    const button = page.locator('.arch-menu-open');
    if (await button.isVisible()) {
      await button.click();
      const drawer = page.locator('.arch-menu-dialog');
      await drawer.waitFor(); await settled(drawer);
      const box = await drawer.boundingBox();
      assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= view.width + 1 &&
        box.y + box.height <= view.height + 1, route + ': drawer outside viewport');
      assert.equal(await button.getAttribute('aria-expanded'), 'true');
      await drawer.locator('.arch-close').click();
      await closed(page, '.arch-menu-dialog');
      assert.equal(await button.getAttribute('aria-expanded'), 'false');
      await button.click(); await page.keyboard.press('Escape');
      await closed(page, '.arch-menu-dialog');
      assert.equal(await button.evaluate(node => document.activeElement === node), true);
    } else {
      const disclosures = page.locator('.arch-nav summary');
      for (let i = 0; i < await disclosures.count(); i++) {
        const summary = disclosures.nth(i);
        assert.equal(await summary.evaluate(node => getComputedStyle(node).listStyleType), 'none',
          route + ': native disclosure marker can duplicate the custom indicator');
        await summary.click();
        assert.equal(await summary.evaluate(node => node.parentElement.open), true);
        await summary.click();
      }
    }
    // Only navigational/card links: preserve intentional text/privacy underlines.
    const anchors = page.locator('.arch-header a:visible,main a.arch-card:visible,main a.arch-related-card:visible');
    for (let i = 0; i < await anchors.count(); i++) {
      await anchors.nth(i).hover();
      assert.ok(!(await anchors.nth(i).evaluate(node => getComputedStyle(node).textDecorationLine))
        .includes('underline'), route + ': unexpected hover underline');
    }
    const cards = await page.locator('main').evaluate((main, selector) =>
      [...main.querySelectorAll(selector)].filter(node => node.getBoundingClientRect().width > 0)
        .map(node => ({tag:node.tagName, href:node.getAttribute('href'), disabled:node.disabled,
          label:node.getAttribute('aria-label') || node.textContent.trim(),
          pointer:getComputedStyle(node).pointerEvents})), cardSelector);
    for (const card of cards) {
      assert.ok(['A','BUTTON'].includes(card.tag), route + ': noninteractive card');
      assert.ok(card.label && !card.disabled && card.pointer !== 'none', route + ': unavailable card');
      if (card.tag === 'A') assert.ok(card.href && card.href !== '#', route + ': dead card link');
    }
    report.cards += cards.length;
    report.routes.push({route,width:view.width,overflow:layout.overflow,cards:cards.length});
  }
}

async function main() {
  mkdirSync(OUTPUT, {recursive:true});
  const browser = await chromium.launch({headless:true});
  report.browserVersion = browser.version();
  report.playwrightVersion = require('playwright/package.json').version;
  try {
    for (const view of views) {
      await run(browser, 'navigation-layout-cards', view, page => navigation(page, view));
      if (view.width < 1250) await run(browser, 'same-document-menu-link', view, async page => {
        await visit(page, 'index.html');
        await page.locator('.arch-menu-open').click();
        await page.locator('.arch-mobile-link[href="/index.html#about"]').click();
        assert.equal(new URL(page.url()).hash, '#about');
        await page.waitForFunction(() => !document.querySelector('.arch-menu-dialog').open, null, {timeout:2000});
        await closed(page, '.arch-menu-dialog');
        assert.ok(await page.locator('#about').evaluate(node => node.getBoundingClientRect().top < innerHeight));
      });
      await run(browser, 'story-scroll-reset', view, async page => {
        await visit(page, 'stories.html');
        await page.locator('.rs-card').first().click();
        const body = page.locator('dialog.arch-dialog .arch-dialog-body');
        await body.evaluate(node => node.scrollTop = node.scrollHeight);
        assert.ok(await body.evaluate(node => node.scrollTop > 100), 'Fixture story must scroll');
        await page.locator('dialog.arch-dialog .arch-close').click();
        await closed(page, 'dialog.arch-dialog');
        await page.locator('.rs-card').nth(1).click();
        await page.locator('dialog.arch-dialog[open]').waitFor();
        assert.equal(await body.evaluate(node => node.scrollTop), 0, 'New story retained the previous scroll offset');
      });
      await run(browser, 'news-scroll-reset', view, async page => {
        // Recent short announcements must not make this regression disappear.
        const articles = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'dist', 'news.json'), 'utf8'))
          .items.filter(item => !item.unverified && Array.isArray(item.body))
          .sort((a,b) => b.body.join('').length - a.body.join('').length).slice(0,2);
        assert.equal(articles.length, 2, 'Expected two real article fixtures');
        await visit(page, 'news.html');
        await page.locator('#an-search').fill(articles[0].title);
        await page.locator('#an-grid .an-card-hit[href="/news.html?article=' + encodeURIComponent(articles[0].id) + '"]').click();
        const panel = page.locator('#an-dialog .an-dialog-inner');
        await panel.evaluate(node => node.scrollTop = node.scrollHeight);
        assert.ok(await panel.evaluate(node => node.scrollTop > 100), 'Fixture article must scroll');
        await page.locator('#an-close').click();
        await closed(page, '#an-dialog');
        await page.locator('#an-search').fill(articles[1].title);
        await page.locator('#an-grid .an-card-hit[href="/news.html?article=' + encodeURIComponent(articles[1].id) + '"]').click();
        await page.locator('#an-dialog[open]').waitFor();
        assert.equal(await panel.evaluate(node => node.scrollTop), 0, 'New article retained the previous reading position');
        assert.equal(await page.evaluate(() => document.body.classList.contains('arch-dialog-open')), true);
        await page.keyboard.press('Escape');
        await closed(page, '#an-dialog');
      });
      await run(browser, 'hall-and-story-card-actions', view, async page => {
        for (const [route, selector] of [['hall-of-fame.html','.h-new-person'], ['stories.html','.rs-featured-card,.rs-card']]) {
          await visit(page, route);
          await page.locator(selector).first().waitFor();
          const cards = page.locator(selector);
          const count = await cards.count();
          assert.ok(count >= 18, route + ': expected full first card set');
          for (let i = 0; i < count; i++) {
            const card = cards.nth(i);
            await card.click();
            const dialog = page.locator('dialog.arch-dialog[open]');
            await dialog.waitFor(); await settled(dialog);
            assert.ok((await dialog.locator('h2').innerText()).trim(), 'Missing popup title');
            assert.equal(await dialog.evaluate(node => node.matches(':modal')), true, 'Dialog not in native top layer');
            assert.equal(await page.evaluate(() => document.body.classList.contains('arch-dialog-open')), true);
            // Alternate real close controls and Escape, on every rendered card.
            if (i % 2) await page.keyboard.press('Escape');
            else await dialog.locator('.arch-close').click();
            await closed(page, 'dialog.arch-dialog');
            assert.equal(await card.evaluate(node => document.activeElement === node), true, 'Card focus was not restored');
          }
        }
      });
      await run(browser, 'interview-focus-restoration', view, async page => {
        await visit(page, 'interviews.html');
        for (const id of ['q1', 'q2']) {
          const card = page.locator('#cards .card[data-id="' + id + '"]');
          await card.click();
          await page.locator('#dialog[open]').waitFor();
          await page.locator('#close').click();
          await closed(page, '#dialog');
          await page.waitForFunction(record => document.activeElement?.matches(
            '#cards .card[data-id="' + record + '"]'), id, {timeout:2000});
        }
      });
      for (const action of ['dismiss', 'replace']) await run(browser, action + '-pending-biography', view, async page => {
        // Hold the actual public catalog until the visitor dismisses its parent.
        // A controlled gate reproduces a slow connection without timing guesses.
        const catalog = readFileSync(path.join(__dirname, '..', '..', 'dist', 'hall-of-fame-people.json'), 'utf8');
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        await page.route('**/hall-of-fame-people.json', async route => {
          await gate;
          await route.fulfill({status:200, contentType:'application/json', body:catalog});
        });
        try {
          await visit(page, 'interviews.html');
          const card = page.locator('#cards .card[data-id="q1"]');
          await card.click();
          const interview = page.locator('#dialog[open]');
          await interview.waitFor();
          const requested = page.waitForRequest('**/hall-of-fame-people.json', {timeout:5000});
          await interview.locator('a[href*="hall-of-fame.html?person="]').first().click();
          await requested;
          if (view.width === 320 || view.width === 768) await interview.locator('#close').click();
          else await page.keyboard.press('Escape');
          await closed(page, '#dialog');
          const nextCard = page.locator('#cards .card[data-id="q2"]');
          if (action === 'replace') {
            await nextCard.click();
            await interview.waitFor();
          }
          release();
          await page.evaluate(async () => { await window.ArchelaosBio.load(); });
          assert.equal(await page.locator('dialog.arch-bio-global[open]').count(), 0,
            'Delayed biography reopened after its parent was ' + (action === 'replace' ? 'replaced' : 'dismissed'));
          assert.equal(await page.evaluate(() => document.body.classList.contains('arch-dialog-open')), action === 'replace',
            'Cancelled biography changed the current page/dialog scroll lock');
          if (action === 'replace') {
            assert.equal(new URL(page.url()).searchParams.get('record'), 'q2');
            assert.equal(await interview.locator('#close').evaluate(node => document.activeElement === node), true,
              'Stale biography stole focus from the new interview');
            await interview.locator('#close').click();
            await closed(page, '#dialog');
          }
          assert.equal(await (action === 'replace' ? nextCard : card)
            .evaluate(node => document.activeElement === node), true, 'Cancelled biography stole restored card focus');
          // Loading is still usable: an intentional second opening must work.
          await card.click();
          await interview.locator('a[href*="hall-of-fame.html?person="]').first().click();
          await page.locator('dialog.arch-bio-global[open]').waitFor();
          await page.locator('.arch-bio-close').click();
          await interview.locator('#close').click();
          await closed(page, '#dialog');
        } finally { release(); }
      });
      await run(browser, 'nested-biography-scroll-lock', view, async page => {
        await visit(page, 'interviews.html');
        await page.locator('#cards .card[data-id="q1"]').click();
        const interview = page.locator('#dialog[open]');
        await interview.waitFor();
        await interview.locator('a[href*="hall-of-fame.html?person="]').first().click();
        const biography = page.locator('dialog.arch-bio-global');
        await biography.waitFor(); await settled(biography);
        assert.equal(await page.evaluate(() => document.body.classList.contains('arch-dialog-open')), true,
          'Biography left background scrolling enabled');
        const before = await page.evaluate(() => scrollY);
        await page.mouse.move(1, view.height / 2);
        await page.mouse.wheel(0, before > 100 ? -100 : 100);
        await page.waitForTimeout(120);
        assert.equal(await page.evaluate(() => scrollY), before, 'Background moved behind the biography');
        await biography.locator('.arch-bio-close').click();
        await page.waitForFunction(() => !document.querySelector('.arch-bio-global').open);
        await settled(biography);
        assert.equal(await interview.count(), 1, 'Biography closed its parent interview');
        assert.equal(await page.evaluate(() => document.body.classList.contains('arch-dialog-open')), true,
          'Closing nested biography unlocked the still-open parent');
        await interview.locator('#close').click();
        await closed(page, '#dialog');
      });
      await run(browser, 'long-biography-title', view, async page => {
        await visit(page, 'hall-of-fame.html?person=arch-7a113e11ae86');
        const dialog = page.locator('dialog.arch-dialog[open]');
        await dialog.waitFor(); await settled(dialog);
        const title = await dialog.locator('h2').evaluate(node => ({text:node.textContent,
          clipped:node.scrollHeight > node.clientHeight + 2 || node.scrollWidth > node.clientWidth + 2,
          box:node.getBoundingClientRect().toJSON()}));
        assert.ok(title.text.includes('Ευκαρπίδης'));
        assert.equal(title.clipped, false);
        assert.ok(title.box.x >= 0 && title.box.right <= view.width && title.box.bottom < view.height);
        const close = await dialog.locator('.arch-close').boundingBox();
        assert.ok(close.width >= 40 && close.height >= 40 && close.y >= 0 && close.y + close.height <= view.height);
        await page.screenshot({path:path.join(OUTPUT, view.width + '-biography.png')});
      });
    }
    await run(browser, 'desktop-disclosure-escape', views[3], async page => {
      await visit(page, 'index.html');
      const disclosure = page.locator('.arch-nav details').first();
      await disclosure.locator('summary').click();
      await disclosure.locator('a').first().focus();
      await page.keyboard.press('Escape');
      assert.equal(await disclosure.evaluate(node => node.open), false, 'Escape left desktop menu expanded');
      assert.equal(await disclosure.locator('summary').evaluate(node => document.activeElement === node), true);
    });
    await run(browser, 'drawer-at-laptop-breakpoint', {width:1249,height:850}, async page => {
      await visit(page, 'index.html');
      await page.locator('.arch-menu-open').click();
      await page.locator('.arch-menu-dialog[open]').waitFor();
      await page.keyboard.press('Escape');
      await closed(page, '.arch-menu-dialog');
    });
  } finally {
    await browser.close();
    writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  const failures = report.cases.filter(test => !test.passed);
  assert.ok(report.cases.length, 'No stability cases selected');
  console.log('Stability:', report.cases.length, 'cases,', report.routes.length,
    'page/viewports,', report.cards, 'card surfaces,', failures.length, 'failures');
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
