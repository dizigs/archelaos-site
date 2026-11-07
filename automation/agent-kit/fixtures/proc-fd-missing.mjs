// Static isolated regression fixture. Test mode comes from a fixed local file.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './cli.mjs';

const home = dirname(fileURLToPath(import.meta.url));
const mode = readFileSync(join(home, 'descriptor-mode.txt'), 'utf8');
if (!['before-private', 'after-private', 'at-log-open'].includes(mode)) {
  throw new Error('INVALID_FIXTURE_MODE');
}
const original = fs.openSync;
let unavailable = mode === 'before-private';
fs.openSync = (path, ...options) => {
  if (mode === 'at-log-open' && String(path).endsWith('/activity.jsonl')) unavailable = true;
  if (unavailable && String(path).startsWith('/proc/self/fd/')) {
    const error = new Error('SIMULATED_DESCRIPTOR_PATH_MISSING');
    error.code = 'ENOENT';
    throw error;
  }
  const fd = original(path, ...options);
  if (mode === 'after-private' && String(path).endsWith('/.private')) unavailable = true;
  return fd;
};
syncBuiltinESMExports();
try {
  console.log(JSON.stringify(run(['verify'])));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
