'use strict';
const fs = require('node:fs');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  try {
    for (const path of ['/', '/news.html', '/hall-of-fame.html']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await page.goto('http://127.0.0.1:8765' + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        reports.push({ path, violations: result.violations, passes: result.passes.length, incomplete: result.incomplete.length });
        console.log(path + ': ' + result.violations.length + ' axe violations; report-only');
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    fs.writeFileSync('axe-report.json', JSON.stringify(reports, null, 2) + '\n');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
