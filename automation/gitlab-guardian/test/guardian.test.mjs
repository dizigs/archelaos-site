import test from 'node:test';
import assert from 'node:assert/strict';
import guardian, { assess, runAudit } from '../src/index.mjs';
const SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);
const NOW = Date.parse('2026-11-04T08:00:00Z');
const mirror = { url: 'https://github.com/dizigs/archelaos-site.git', enabled: true, mirror_trigger_builds: false, mirror_overwrites_diverged_branches: false, update_status: 'finished', last_error: null, last_successful_update_at: '2026-11-04T07:55:00Z' };
const branch = { commit: { id: SHA } };
const commit = { sha: SHA };
function input(m = mirror, b = branch, c = commit, when = NOW) { return { mirror: m, gitlabBranch: b, githubCommit: c, checkedAt: when }; }

test('matching heads are ok', () => {
  const report = assess(input());
  assert.equal(report.status, 'ok'); assert.equal(report.head_matches, true);
  assert.deepEqual(report.issues, []);
});
test('new GitHub commit is attention before staleness threshold', () => {
  const r = assess(input(mirror, branch, { sha: NEW_SHA }));
  assert.equal(r.status, 'attention'); assert.deepEqual(r.issues, ['HEAD_MISMATCH']);
});
test('two-hour mismatch is alert', () => {
  const r = assess(input(mirror, branch, { sha: NEW_SHA }, NOW + 180 * 60_000));
  assert.equal(r.status, 'alert');
});
test('mirror errors are alert without leaking raw error', () => {
  const r = assess(input({ ...mirror, update_status: 'failed', last_error: 'credentials in provider error' }));
  assert.equal(r.status, 'alert');
  assert.doesNotMatch(JSON.stringify(r), /credentials in provider/);
});
test('unexpected CI or force overwrite is alert', () => {
  assert.equal(assess(input({ ...mirror, mirror_trigger_builds: true })).status, 'alert');
  assert.equal(assess(input({ ...mirror, mirror_overwrites_diverged_branches: true })).status, 'alert');
});
test('rejects invalid SHA schemas', () => assert.throws(() => assess(input(mirror, {commit:{id:'bad'}})), /INVALID_UPSTREAM_SCHEMA/));
test('private /check never opens without key, health is public', async () => {
  const health = await guardian.fetch(new Request('https://guardian.example/health'), {});
  assert.equal(health.status, 200);
  const denied = await guardian.fetch(new Request('https://guardian.example/check'), {});
  assert.equal(denied.status, 404);
  const denied2 = await guardian.fetch(new Request('https://guardian.example/check', {headers: {authorization: 'Bearer incorrect'}}), {GUARDIAN_CHECK_KEY:'x'.repeat(32)});
  assert.equal(denied2.status, 404);
});
test('authorized check fails closed without GitLab token', async () => {
  const key = 'x'.repeat(32);
  const response = await guardian.fetch(new Request('https://guardian.example/check', { headers: { authorization:`Bearer ${key}` }}), { GUARDIAN_CHECK_KEY:key });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {status:'UNKNOWN'});
});
test('GitLab API uses only GET and fixed URLs, no token in results', async () => {
  const seen = [];
  const fake = async (url, opts) => {
    seen.push({url, method:opts.method, headers:opts.headers});
    let value = url.endsWith('/mirror/pull') ? mirror : url.endsWith('/repository/branches/main') ? branch : commit;
    return new Response(JSON.stringify(value), {headers: {'content-type':'application/json'}});
  };
  const report = await runAudit({ GITLAB_READ_TOKEN:'do-not-leak-token' }, fake, NOW);
  assert.equal(report.status, 'ok'); assert.equal(seen.length, 3);
  assert.ok(seen.every(x=>x.method==='GET'));
  assert.ok(seen.every(x=>x.url.startsWith('https://gitlab.com/api/v4/projects/88488684/') || x.url==='https://api.github.com/repos/dizigs/archelaos-site/commits/main'));
  assert.doesNotMatch(JSON.stringify(report), /do-not-leak-token/);
});
test('provider API error fails closed and does not expose body', async () => {
  const fake = async () => new Response('private provider error body', {status:403});
  await assert.rejects(runAudit({GITLAB_READ_TOKEN:'x'},fake,NOW), /UPSTREAM_STATUS/);
});

test('unknown mirror status never passes as OK', () => {
  const r = assess(input({ ...mirror, update_status: 'unexpected' }));
  assert.equal(r.status, 'alert');
  assert.ok(r.issues.includes('MIRROR_UPDATE_UNVERIFIED'));
});
test('missing safety flags and invalid timestamps fail closed', () => {
  assert.throws(() => assess(input({ ...mirror, mirror_overwrites_diverged_branches: undefined })), /INVALID_UPSTREAM_SCHEMA/);
  assert.throws(() => assess(input(mirror, branch, commit, NaN)), /INVALID_UPSTREAM_SCHEMA/);
  const future = assess(input({ ...mirror, last_successful_update_at: '2026-11-05T07:55:00Z' }));
  assert.equal(future.status, 'alert');
  assert.ok(future.issues.includes('MIRROR_FUTURE_TIMESTAMP'));
});
test('large upstream response is stopped by bytes, not JavaScript characters', async () => {
  const huge = '€'.repeat(50_000);
  const fake = async () => new Response(huge);
  await assert.rejects(runAudit({ GITLAB_READ_TOKEN: 'x' }, fake, NOW), /UPSTREAM_SIZE/);
});
test('repeated mirror observations are deterministic and read-only', () => {
  const first = assess(input());
  const second = assess(input());
  assert.deepEqual(first, second);
});

test('configured pull mirror source is pinned to the exact canonical GitHub repository', () => {
  const canonical = assess(input({ ...mirror, url:'https://reader:masked@github.com/dizigs/archelaos-site.git' }));
  assert.equal(canonical.status, 'ok');
  for (const url of ['https://github.com/dizigs/other.git', 'https://github.com.evil.example/dizigs/archelaos-site.git',
    'http://github.com/dizigs/archelaos-site.git', 'https://github.com/dizigs/archelaos-site.git?ref=other']) {
    const r = assess(input({ ...mirror, url }));
    assert.equal(r.status, 'alert');
    assert.ok(r.issues.includes('MIRROR_ORIGIN_MISMATCH'));
    assert.doesNotMatch(JSON.stringify(r), /evil.example|reader:masked/);
  }
  assert.equal(assess(input({ ...mirror, url:'git@github.com:dizigs/archelaos-site.git' })).status, 'ok');
  assert.throws(() => assess(input({ ...mirror, url:undefined })), /INVALID_UPSTREAM_SCHEMA/);
});

test('missing success timestamp is explicitly UNKNOWN even if HEADs match', () => {
  const r = assess(input({ ...mirror, last_successful_update_at:null }));
  assert.equal(r.status, 'UNKNOWN');
  assert.ok(r.issues.includes('NO_SUCCESSFUL_MIRROR_TIMESTAMP'));
});

test('unverified mirror branch filtering can never pass as healthy', () => {
  const filtered = assess(input({ ...mirror, mirror_branch_regex:'release/.*' }));
  assert.equal(filtered.status, 'alert');
  assert.ok(filtered.issues.includes('MIRROR_BRANCH_FILTER_UNVERIFIED'));
  const protectedOnly = assess(input({ ...mirror, only_mirror_protected_branches:true }, { ...branch, protected:false }));
  assert.ok(protectedOnly.issues.includes('MIRROR_MAIN_BRANCH_FILTERED'));
  assert.equal(protectedOnly.status, 'alert');
});

test('upstream failures become UNKNOWN to authorized callers without provider leakage', async () => {
  // The actual network request is mocked: only the classified 503 result is tested.
  const key='k'.repeat(32);
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async () => new Response('private provider body', {status:503});
  try {
    const r=await guardian.fetch(new Request('https://guardian.example/check', {headers:{authorization:'Bearer '+key}}),
      { GUARDIAN_CHECK_KEY:key, GITLAB_READ_TOKEN:'synthetic-test-token' });
    assert.equal(r.status,503);
    assert.deepEqual(await r.json(),{status:'UNKNOWN'});
  } finally {
    globalThis.fetch=previousFetch;
  }
});
