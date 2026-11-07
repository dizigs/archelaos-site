// Static isolated regression fixture. All input is fixed test data.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './cli.mjs';

const home = dirname(fileURLToPath(import.meta.url));
const args = ['record', 'github', 'checks', 'PASS', '--evidence',
  'https://github.com/dizigs/archelaos-site/actions/runs/42284982522'];
const original = fs.openSync;
let swapped = false;
fs.openSync = (path, ...options) => {
  const fd = original(path, ...options);
  if (!swapped && String(path).endsWith('/.private')) {
    swapped = true;
    fs.renameSync(join(home, '.private'), join(home, 'held-private'));
    fs.symlinkSync(join(home, 'outside'), join(home, '.private'), 'dir');
  }
  return fd;
};
syncBuiltinESMExports();
console.log(JSON.stringify(run(args)));
