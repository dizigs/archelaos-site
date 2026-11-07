// Static test fixture: acquire the same kernel flock inode as the CLI.
import { openSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const fd = openSync(process.argv[2], 'r+');
const result = spawnSync('/usr/bin/flock', ['-n', '3'], {
  stdio: ['ignore', 'ignore', 'pipe', fd],
});
if (result.status !== 0) process.exit(1);
console.log('LOCK_READY');
setInterval(() => {}, 1000);
