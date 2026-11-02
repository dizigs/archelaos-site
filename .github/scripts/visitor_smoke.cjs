'use strict';
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({headless: true});
  const results = [];
  let failed = false;
  try {
    for (const width of [390, 1366]) {
      const page = await browser.newPage({viewport: {width, height: 850}});
      for (const path of ['/', '/news.html', '/search.html', '/hall-of-fame.html', '/tmimata.html']) {
        const errors = [];
        try {
          const res = await page.goto('http://127.0.0.1:8765' + path, {waitUntil:'domcontentloaded',timeout:30000});
          if (!res || res.status() !== 200) throw new Error('HTTP '+(res?.status() ?? 'none'));
          await page.locator('body').waitFor({state:'visible'});
          const h1 = await page.locator('h1').count();
          if (!h1) errors.push('missing H1');
          const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 12);
          if (horizontalOverflow) errors.push('horizontal overflow at '+width+'px');
          if (path === '/search.html' && !(await page.locator('#sr-query').count())) errors.push('search field missing');
          if (path === '/hall-of-fame.html' && !(await page.locator('#hall-search').count())) errors.push('Hall search missing');
        } catch (e) {errors.push(String(e.message||e));}
        results.push({path,width,errors});
        console.log(width+'px '+path+': '+(errors.length?errors.join('; '):'PASS'));
        if (errors.length) failed = true;
      }
      await page.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync('browser-smoke-report.json',JSON.stringify(results,null,2)+'\n');
  }
  // Baseline collection first: report any failures; turn into blocking gates after review.
  if (failed) console.log('::warning::Browser smoke findings present; inspect report artifact.');
})().catch(e=>{console.error(e);process.exitCode=1});
