// Static test fixture: no executable source is assembled from inputs.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { run } from './cli.mjs';

const input = JSON.parse(process.argv[3]);
const original = fs.openSync;
let swapped = false;
fs.openSync = (path, ...args) => {
  const fd = original(path, ...args);
  if (!swapped && String(path).endsWith('/.private')) {
    swapped = true;
    fs.renameSync(join(process.argv[2], '.private'), join(process.argv[2], 'held-private'));
    fs.symlinkSync(join(process.argv[2], 'outside'), join(process.argv[2], '.private'), 'dir');
  }
  return fd;
};
syncBuiltinESMExports();
console.log(JSON.stringify(run(input.args)));
