/**
 * One read-only, authenticated GitHub check that source PRs are still at the
 * exact immutable commits we exercised. A moved/closed PR blocks acceptance.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pin = JSON.parse(readFileSync(new URL('./sources.json', import.meta.url), 'utf8'));
const token = process.env.GITHUB_TOKEN;
if (!token || token.length < 10) throw Error('Read-only GitHub token missing');
for (const [name, source] of Object.entries(pin.sources)) {
  const url = 'https://api.github.com/repos/dizigs/archelaos-site/pulls/' + source.pr;
  const res = await fetch(url, { method: 'GET',
    headers: { Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw Error('Could not verify source PR #' + source.pr + ': HTTP ' + res.status);
  const pr = await res.json();
  assert.equal(pr.state, 'open', 'Source PR closed: #' + source.pr);
  assert.equal(pr.draft, true, 'Source PR no longer draft: #' + source.pr);
  assert.equal(pr.head?.repo?.full_name, pin.repository, 'Unexpected source head repo');
  assert.equal(pr.base?.ref, 'main', 'Unexpected source base branch');
  assert.equal(pr.head?.sha, source.sha,
    'Source PR #' + source.pr + ' moved; re-audit and repin before acceptance');
  console.log('latest source verified: ' + name + ' PR #' + source.pr + ' ' + source.sha);
}
console.log('PASS: all five live PR head SHAs equal the local immutable checkouts');
