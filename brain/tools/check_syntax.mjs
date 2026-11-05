import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
let count = 0;
for (const root of ['src', 'test', 'tools']) {
  for (const file of await readdir(root, { recursive: true })) {
    if (!file.endsWith('.mjs')) continue;
    const checked = spawnSync(process.execPath, ['--check', root + '/' + file], { stdio: 'inherit' });
    if (checked.status !== 0) process.exit(1);
    count++;
  }
}
if (count < 1) throw new Error('Refusing an empty syntax check');
console.log('Brain module syntax checks passed: ' + count);
