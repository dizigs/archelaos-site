// Read-only, opt-in browser-rendering and exact-SHA GitHub CI verification.
const SITE = 'https://www.archelaos.club/';
const REPO = 'dizigs/archelaos-site';
const REQUIRED = Object.freeze([
  { name: 'JavaScript syntax (all site scripts)' },
  { name: 'ESLint JavaScript quality' },
  { name: 'Validate production build' },
  { name: 'CodeQL', app: 'github-advanced-security' },
  { name: 'SonarCloud Code Analysis', app: 'sonarqubecloud' }
]);

export function evaluateChecks(checks, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha || '') || !Array.isArray(checks)) {
    throw new Error('INVALID_CHECK_INPUT');
  }
  const matrix = REQUIRED.map(({ name, app }) => {
    const matching = checks.filter(c => c?.name === name && c?.head_sha === sha &&
      (!app || c?.app?.slug === app)).sort((a,b) => b.id - a.id);
    const check = matching[0];
    const ok = Boolean(check && check.status === 'completed' && check.conclusion === 'success');
    return { name, ok, evidence: check ? check.status + '/' + check.conclusion : 'MISSING_EXACT_SHA' };
  });
  return { ok: matrix.every(x => x.ok), matrix };
}

export function evaluateSnapshot(response, width) {
  const html = response?.result?.content || '';
  const screenshot = response?.result?.screenshot || '';
  const url = response?.meta?.finalUrl || '';
  let validOrigin = false;
  try {
    const parsed = new URL(url);
    validOrigin = parsed.protocol === 'https:' &&
      ['archelaos.club','www.archelaos.club'].includes(parsed.hostname);
  } catch { /* Fail closed. */ }
  const missing = ['header', 'nav', 'main', 'footer'].filter(tag =>
    !(new RegExp('<' + tag + '\\b', 'i')).test(html));
  const langEl = /<html\b[^>]*\blang\s*=\s*["']el(?:-GR)?["']/i.test(html);
  const ok = response?.success === true &&
    response?.meta?.status === 200 && validOrigin && langEl &&
    missing.length === 0 && screenshot.length > 100 &&
    response?.result?.accessibilityTree?.role === 'RootWebArea';
  return { width, ok, status: response?.meta?.status || null,
    missing, screenshotCaptured: screenshot.length > 100,
    accessibilityCaptured: response?.result?.accessibilityTree?.role === 'RootWebArea',
    greekLang: langEl, validOrigin };
}

async function readJson(url, options, label) {
  const response = await fetch(url, { redirect: 'error', ...options });
  if (!response.ok) throw new Error(label + '_HTTP_' + response.status);
  return response.json();
}

async function run() {
  const sha = process.env.TARGET_SHA || '';
  const token = process.env.CLOUDFLARE_BROWSER_RENDERING_TOKEN || '';
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const githubToken = process.env.GITHUB_TOKEN || '';
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('INVALID_TARGET_SHA');
  if (process.env.GITHUB_REPOSITORY !== REPO) throw new Error('WRONG_REPOSITORY');
  if (!githubToken) throw new Error('GITHUB_TOKEN_NOT_CONFIGURED');

  // Do not spend browser quota when the exact-SHA GitHub checks are blocked.
  const checkData = await readJson(
    'https://api.github.com/repos/' + REPO + '/commits/' + sha + '/check-runs?per_page=100',
    { headers: { Authorization: 'Bearer ' + githubToken,
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } },
    'GITHUB_CHECKS');
  if (!Number.isSafeInteger(checkData.total_count) || checkData.total_count > 100 ||
      !Array.isArray(checkData.check_runs)) throw new Error('INCOMPLETE_GITHUB_CHECKS');
  const checks = evaluateChecks(checkData.check_runs, sha);
  process.stdout.write('GitHub exact-SHA checks: ' + JSON.stringify(checks) + '\n');
  if (!checks.ok) throw new Error('EXACT_SHA_CHECKS_BLOCKED');
  if (!/^[a-f0-9]{32}$/.test(account) || !token) {
    throw new Error('CLOUDFLARE_BROWSER_TOKEN_OR_ACCOUNT_NOT_CONFIGURED');
  }

  const matrix = [];
  for (const viewport of [
    { width: 390, height: 844, isMobile: true, hasTouch: true },
    { width: 1440, height: 900, isMobile: false }
  ]) {
    const data = await readJson(
      'https://api.cloudflare.com/client/v4/accounts/' + account +
        '/browser-rendering/snapshot?cacheTTL=0',
      { method: 'POST', headers: { Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json' },
        body: JSON.stringify({ url: SITE, viewport,
          formats: ['content', 'screenshot', 'accessibilityTree'],
          gotoOptions: { waitUntil: 'domcontentloaded', timeout: 30000 } }) },
      'CLOUDFLARE_BROWSER');
    const result = evaluateSnapshot(data, viewport.width);
    matrix.push(result);
    process.stdout.write('Browser Run check: ' + JSON.stringify(result) + '\n');
    if (!result.ok) throw new Error('BROWSER_SMOKE_BLOCKED_' + viewport.width);
  }
  process.stdout.write('BROWSER_AND_GITHUB_CHECKS_PASS: ' + sha + '\n');
}

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch(error => {
    console.error('BROWSER_GITHUB_CHECKS_BLOCKED: ' + error.message);
    process.exitCode = 1;
  });
}
