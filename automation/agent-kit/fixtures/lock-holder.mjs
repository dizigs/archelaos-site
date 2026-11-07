// Static isolated regression fixture. Lock location is derived from this module.
import { openSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const lock = join(dirname(fileURLToPath(import.meta.url)), '.private', 'activity.lock');
const fd = openSync(lock, 'r+');
const result = spawnSync('/usr/bin/flock', ['-n', '3'], {
  stdio: ['ignore', 'ignore', 'pipe', fd],
});
if (result.status !== 0) process.exit(1);
console.log('LOCK_READY');
setInterval(() => {}, 1000);
