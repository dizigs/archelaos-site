/* Real browser regression for canonical IDs, bilingual biographies and >682 search. */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.SITE_STABILITY_BASE_URL || 'http://127.0.0.1:8766';
const master = JSON.parse(readFileSync(path.join(__dirname, '../../hall-of-fame-people.json'), 'utf8'));
const samples = ['arch-3fe6e9ae9b29', 'arch-f6152b60c43f', 'arch-f56820c52e55',
  'arch-konstantinos-sarris-volleyball'];
const normalized = value => value.replace(/\s+/g, ' ').trim();

async function main() {
  const browser = await chromium.launch({ headless: true });
  let checks = 0;
  try {
    for (const viewport of [{ width: 1365, height: 850 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Keep local checks deterministic and prevent external requests.
      await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin
        ? route.continue() : route.abort());
      for (const id of samples) {
        const person = master.people.find(row => row.id === id);
        assert.ok(person, id);
        const response = await page.goto(base + '/hall-of-fame.html?person=' + encodeURIComponent(id));
        assert.equal(response.status(), 200);
        const dialog = page.locator('dialog.arch-dialog[open]');
        await dialog.waitFor();
        const text = normalized(await dialog.innerText());
        assert.ok(text.includes(normalized(person.name)), id + ': canonical name');
        assert.ok(text.includes(normalized(person.bio)), id + ': entire canonical Greek biography');
        await dialog.locator('.arch-close').click();
        await page.evaluate(async personId => {
          document.documentElement.lang = 'en';
          const data = await window.ArchelaosBio.load();
          // The Hall uses its shared native dialog; the global link interceptor
          // also exposes open(), which intentionally has a different viewer.
          window.ArchelaosBio.show(data.people.find(row => row.id === personId));
        }, id);
        assert.ok(normalized(await dialog.innerText()).includes(normalized(person.bio_en)), id + ': canonical English biography');
        await dialog.locator('.arch-close').click();
        await page.evaluate(personId => window.ArchelaosBio.open(personId), id);
        const globalDialog = page.locator('dialog.arch-bio-global[open]');
        await globalDialog.waitFor();
        assert.ok(normalized(await globalDialog.innerText()).includes(normalized(person.bio_en)), id + ': global English biography');
        await globalDialog.locator('.arch-bio-close').click();
        await page.goto(base + '/people/' + id + '.html');
        await page.locator('.arch-header').waitFor();
        if (id === 'arch-3fe6e9ae9b29') {
          assert.ok((await page.locator('section[data-profile-language="en"]').textContent()).includes('remains unresolved'));
          assert.ok((await page.locator('main').innerText()).includes('προς διασταύρωση'));
        }
        if (id === 'arch-f56820c52e55') {
          const biography = await page.locator('main').innerText();
          assert.ok(biography.includes('Χρήστος Λιμπανοβνός'));
          assert.ok(!/Λυμπανοβν|Lympanovnos/.test(biography));
        }
        checks += 1;
      }
      await page.goto(base + '/search.html');
      const actual = await page.evaluate(async () => {
        const catalog = await window.ArchelaosCatalog.load();
        return catalog.records.filter(row => row.type === 'person').map(row => row.id);
      });
      assert.deepEqual(actual.sort((a, b) => a.localeCompare(b)),
        master.people.map(row => row.id).sort((a, b) => a.localeCompare(b)));
      assert.deepEqual(errors, [], 'Uncaught browser exceptions');
      checks += 1;
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log('HOF RECONCILIATION PASS: ' + checks + ' browser cases; desktop/tablet/mobile; ' + master.people.length + ' canonical search IDs');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
