import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../assets/analytics-consent.js', import.meta.url), 'utf8');
const KEY = 'archelaos-analytics-consent-v1';

function run(choice, hostname = 'archelaos.club') {
  const items = [];
  const store = new Map(choice ? [[KEY, choice]] : []);
  let reloads = 0;
  function element(tagName) {
    const listeners = {};
    const item = {
      tagName, listeners, children: [], hidden: false, style: {},
      dataset: {}, className: '', textContent: '',
      append(...children) { this.children.push(...children); },
      setAttribute(name, value) { this[name] = value; },
      addEventListener(name, fn) { listeners[name] = fn; },
      focus() { this.focused = true; }
    };
    items.push(item);
    return item;
  }
  const head = element('head'), body = element('body'), footer = element('footer');
  const location = {hostname, reload() { reloads++; }};
  const window = {location};
  const document = {
    head, body, readyState: 'complete',
    createElement: element,
    createTextNode: value => ({textContent: value}),
    querySelector: selector => selector === 'footer' ? footer : null
  };
  const context = {window, document, location, localStorage: {
    getItem: key => store.get(key) ?? null, setItem: (key,value) => store.set(key,value)
  }, encodeURIComponent, Date};
  runInNewContext(source, context, {filename: 'analytics-consent.js'});
  return {
    items, store, window, head, body, context,
    get panel() { return items.find(x => x.id === 'arch-analytics-consent-panel'); },
    get buttons() { return items.filter(x => x.tagName === 'button'); },
    get tags() { return head.children.filter(x => x.tagName === 'script'); },
    get reloads() { return reloads; }
  };
}

test('unknown consent shows an accessible choice and loads no trackers', () => {
  const app = run();
  assert.equal(app.panel.hidden, false);
  assert.equal(app.panel.role, 'region');
  assert.equal(app.tags.length, 0);
  assert.equal(app.store.has(KEY), false);
});

test('explicit acceptance alone loads exact GA4 stream plus Clarity once', () => {
  const app = run();
  const accept = app.buttons.find(x => x.textContent === 'Αποδοχή');
  accept.listeners.click();
  assert.equal(app.store.get(KEY), 'accepted');
  assert.equal(app.panel.hidden, true);
  assert.equal(app.tags.length, 2);
  assert(app.tags.some(x => x.src === 'https://www.googletagmanager.com/gtag/js?id=G-VV7C3N770T'));
  assert(app.tags.some(x => x.src === 'https://www.clarity.ms/tag/z79wwgm3p8'));
  runInNewContext(source, app.context, {filename:'analytics-consent.js'});
  assert.equal(app.tags.length, 2);
});

test('rejection stores choice and loads no trackers', () => {
  const app = run();
  app.buttons.find(x => x.textContent === 'Απόρριψη').listeners.click();
  assert.equal(app.store.get(KEY), 'rejected');
  assert.equal(app.tags.length, 0);
  assert.equal(app.panel.hidden, true);
});

test('stored rejection keeps trackers disabled; consent settings reopen', () => {
  const app = run('rejected');
  assert.equal(app.panel.hidden, true);
  assert.equal(app.tags.length, 0);
  const settings = app.buttons.find(x => x.id === 'arch-analytics-settings-main');
  settings.listeners.click();
  assert.equal(app.panel.hidden, false);
  assert.equal(app.buttons.find(x => x.textContent === 'Απόρριψη').focused, true);
});

test('stored acceptance reloads GA4; withdrawal unloads trackers', () => {
  const app = run('accepted');
  assert.equal(app.panel.hidden, true);
  assert.equal(app.tags.length, 2);
  app.buttons.find(x => x.id === 'arch-analytics-settings-main').listeners.click();
  app.buttons.find(x => x.textContent === 'Απόρριψη').listeners.click();
  assert.equal(app.store.get(KEY), 'rejected');
  assert.equal(app.reloads, 1);
});

test('preview hosts do not load trackers or show consent banner', () => {
  const app = run(null, 'example.pages.dev');
  assert.equal(app.tags.length, 0);
  assert.equal(app.panel, undefined);
});

test('classic site loads canonical consent through shared entrypoints', () => {
  const nav = readFileSync(new URL('../assets/navigation.js', import.meta.url), 'utf8');
  const fav = readFileSync(new URL('../assets/favorites.js', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../rebuild/js/shell.js', import.meta.url), 'utf8');
  const privacy = readFileSync(new URL('../rebuild/privacy.html', import.meta.url), 'utf8');
  for (const code of [nav, fav, shell]) {
    assert.match(code, /assets\\/analytics-consent\\.js/);
    assert.match(code, /data-archelaos-analytics-loader/);
  }
  for (const code of [source, nav, fav, shell, privacy]) assert.doesNotMatch(code, /G-WV7C3N770T/);
  assert.match(privacy, /G-VV7C3N770T/);
});
