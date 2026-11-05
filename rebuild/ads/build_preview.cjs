'use strict';
const {readFileSync, mkdirSync, writeFileSync} = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, '..', 'test-artifacts', 'ad-grants');
mkdirSync(output, {recursive:true});
writeFileSync(path.join(output, 'google-ads-audit.js'),
  ['ad_grants_core.js', 'google_ads_audit.js'].map(name => readFileSync(path.join(__dirname, name), 'utf8')).join('\n'));
console.log('Built dry-run preview bundle in ignored test-artifacts; no upload or activation.');
