/* Sponsorship footer regressions: static source, inclusion, and DOM behavior. */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/support-footer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css/support-footer.css'), 'utf8');

test('every production rebuild page includes the same support assets once', () => {
  const pages = fs.readdirSync(root).filter(name => name.endsWith('.html') && name !== 'preview.html');
  assert.equal(pages.length, 15);
  for (const page of pages) {
    const content = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(content, /\/rebuild\/js\/shell\.js/);
    assert.equal(content.split('/rebuild/js/support-footer.js').length - 1, 1, page);
    assert.equal(content.split('/rebuild/css/support-footer.css').length - 1, 1, page);
  }
  // News is copied verbatim from the repository root, not from rebuild/*.html.
  const news = fs.readFileSync(path.resolve(root, '..', 'news.html'), 'utf8');
  assert.match(news, /\/assets\/site\/js\/shell\.js/);
  assert.equal(news.split('/assets/site/js/support-footer.js').length - 1, 1);
  assert.equal(news.split('/assets/site/css/support-footer.css').length - 1, 1);
});

test('uses first-party UptimeRobot logo and no forbidden Google logo', () => {
  assert.match(source, /https:\/\/uptimerobot\.com\/assets\/images\/uptimerobot-logo-dark\.svg/);
  assert.match(source, /sponsored noopener noreferrer/);
  assert.match(source, /συμμετέχει στο πρόγραμμα/);
  assert.match(source, /https:\/\/www\.google\.com\/nonprofits\//);
  assert.doesNotMatch(source, /google-logo|google\.svg|logo-google/);
  assert.match(styles, /text-decoration:\s*none\s*!important/);
});

test('waits for shared shell, mounts once, and has proper link semantics', () => {
  const nodesById = new Map();
  const bottom = {tagName: 'DIV', className: 'arch-footer-bottom'};
  const inner = {
    nodes: [bottom],
    querySelector: selector => selector === '.arch-footer-bottom' ? bottom : null,
    insertBefore(node, ref) {
      assert.equal(ref, bottom);
      this.nodes.splice(this.nodes.indexOf(ref), 0, node);
      nodesById.set(node.id, node);
    }
  };
  const footer = {querySelector: selector => selector === '.arch-footer-inner' ? inner : null};
  const listeners = [];
  function makeNode(tag) {
    return {
      tagName: tag.toUpperCase(), children: [], attributes: {},
      setAttribute(key, value) {this.attributes[key] = value;},
      append(...values) {this.children.push(...values);}
    };
  }
  const document = {
    readyState: 'interactive',
    getElementById: id => nodesById.get(id) || null,
    querySelector: selector => selector === 'footer.arch-footer' ? footer : null,
    createElement: makeNode,
    createTextNode: text => ({text}),
    addEventListener(event, callback, options) {
      assert.equal(event, 'DOMContentLoaded');
      assert.equal(options.once, true);
      listeners.push(callback);
    }
  };
  vm.runInNewContext(source, {document}, {timeout: 500});
  assert.equal(inner.nodes.length, 1);
  assert.equal(listeners.length, 1);
  listeners[0]();
  listeners[0]();
  assert.equal(inner.nodes.length, 2);
  const section = inner.nodes[0];
  assert.equal(section.id, 'arch-program-support');
  assert.ok(section.attributes['aria-label'].includes('Προγράμματα'));
  const uptimeLink = section.children[0].children[1];
  assert.equal(uptimeLink.href, 'https://uptimerobot.com/');
  assert.equal(uptimeLink.rel, 'sponsored noopener noreferrer');
  assert.equal(uptimeLink.children[0].alt, 'UptimeRobot');
  assert.equal(section.children[1].children[1].textContent, 'Google for Nonprofits');
});
