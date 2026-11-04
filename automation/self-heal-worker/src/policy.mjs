// Strict, read-only intake. No external text, scripts, log bodies or credentials stored.
export const REPOSITORY = 'dizigs/archelaos-site';
export const SITE_PATHS = new Set(['/', '/news.html', '/search.html', '/hall-of-fame.html',
  '/tmimata.html', '/history.html', '/70-stigmes.html', '/events/index.html']);
export const FINDING_CODES = Object.freeze({
  HTML_ESCAPED_TEXT: { recipe: 'ARCH-HTML-ESCAPES-001', policy: 'DRAFT_REVIEW_ONLY' },
  LIVE_HEALTH_FAILURE: { recipe: 'ARCH-LIVE-HEALTH-UNKNOWN-001', policy: 'DIAGNOSE_ONLY' },
  SONAR_SECURITY_FINDING: { recipe: 'ARCH-SONAR-SECURITY-C-001', policy: 'DIAGNOSE_ONLY' },
  CI_FAILURE: { recipe: null, policy: 'DIAGNOSE_ONLY' },
  DEPLOYMENT_UNVERIFIED: { recipe: null, policy: 'DIAGNOSE_ONLY' }
});
const SOURCES = new Set(['site_watch', 'github_actions', 'cloudflare_pages']);
const HEX40 = /^[a-f0-9]{40}$/;
const ACTIONS_ID = /^actions:[1-9][0-9]{0,19}$/;
const DEPLOY_ID = /^pages:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEYS = ['schemaVersion', 'source', 'repository', 'code', 'resource', 'commit', 'observedAt', 'evidenceId'].sort();

export function parseFinding(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).length !== KEYS.length ||
      Object.keys(value).sort().some((key, i) => key !== KEYS[i]) ||
      JSON.stringify(value).length > 1200) throw new TypeError('INVALID_FINDING_ENVELOPE');
  const { schemaVersion, source, repository, code, resource, commit, observedAt, evidenceId } = value;
  if (schemaVersion !== 1 || repository !== REPOSITORY || !SOURCES.has(source) ||
      !Object.hasOwn(FINDING_CODES, code) || !HEX40.test(commit)) throw new TypeError('INVALID_FINDING_IDENTITY');
  if (typeof observedAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(observedAt)) throw new TypeError('INVALID_FINDING_TIME');
  const at = Date.parse(observedAt);
  if (!Number.isFinite(at) || at > now + 5 * 60000 || at < now - 7 * 86400000) throw new TypeError('STALE_FINDING');
  if ((source === 'cloudflare_pages') !== DEPLOY_ID.test(evidenceId) ||
      (source !== 'cloudflare_pages' && !ACTIONS_ID.test(evidenceId))) throw new TypeError('INVALID_EVIDENCE_ID');
  if (!(SITE_PATHS.has(resource) && ['site_watch','cloudflare_pages'].includes(source)) &&
      !(resource === '/ci' && source === 'github_actions') &&
      !(resource === '/deployment' && source === 'cloudflare_pages')) throw new TypeError('UNAPPROVED_RESOURCE');
  if (code === 'CI_FAILURE' && source !== 'github_actions') throw new TypeError('INVALID_FINDING_SCOPE');
  if (code === 'DEPLOYMENT_UNVERIFIED' && (source !== 'cloudflare_pages' || resource !== '/deployment')) throw new TypeError('INVALID_FINDING_SCOPE');
  if (code === 'HTML_ESCAPED_TEXT' && (source !== 'site_watch' || resource !== '/news.html')) throw new TypeError('INVALID_FINDING_SCOPE');
  if (code === 'SONAR_SECURITY_FINDING' && (source !== 'github_actions' || resource !== '/ci')) throw new TypeError('INVALID_FINDING_SCOPE');
  return Object.freeze({ schemaVersion, source, repository, code, resource, commit, observedAt, evidenceId });
}

export async function idFor(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, n => n.toString(16).padStart(2, '0')).join('');
}

export function classification(code) {
  if (!Object.hasOwn(FINDING_CODES, code)) throw new TypeError('UNKNOWN_FINDING_CODE');
  const item = FINDING_CODES[code];
  return Object.freeze({ recipe: item.recipe, policy: item.policy,
    provenance: 'INPUT_METADATA_UNVERIFIED', autoRepairAllowed: false,
    mergeAllowed: false, deployAllowed: false });
}
