import { ScriptFault, sha256 } from './security.mjs';

// Verified GitHub Actions OIDC authorization. This module deliberately grants
// only the separately implemented READ-ONLY probe, never an edit right.
// HTTPS JWKS is fixed at the GitHub issuer; no arbitrary URL or kid lookup.
const jwksUrl = 'https://token.actions.githubusercontent.com/.well-known/jwks';
export const oidcAudience = 'archelaos.club:apps-script:readonly:v1';
const exactWorkflow = 'dizigs/archelaos-site/.github/workflows/apps-script-oidc-probe.yml@refs/heads/codex/automation-bridge-integration';
const exactRef = 'refs/heads/codex/automation-bridge-integration';
const expectedRepoId = '1433399999';

function invalid() { return new ScriptFault('GITHUB_OIDC_AUTH_REQUIRED', 401); }
function jsonB64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,6000}$/.test(value)) throw invalid();
  try {
    const raw = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0))));
  } catch { throw invalid(); }
}
function b64Bytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{100,1800}$/.test(value)) throw invalid();
  try { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
  catch { throw invalid(); }
}
export async function verifyGithubProbeToken(token, options = {}) {
  return verifyGithubActionsIdentity(token, {
    ...options, audience: oidcAudience, ref: exactRef, workflow: exactWorkflow, eventName: 'push'
  });
}
// Policy arguments are supplied by reviewed server code, never HTTP claims.
export async function verifyGithubActionsIdentity(token, { audience, ref, workflow, eventName, approvedWorkflowCommit, now = Date.now, fetchKeys = fetch } = {}) {
  if (!audience || !ref || !workflow || !eventName) throw invalid();
  if (typeof token !== 'string' || token.length > 8192 || token.length < 200) throw invalid();
  const parts = token.split('.');
  if (parts.length !== 3) throw invalid();
  const [rawHeader, rawClaims, rawSignature] = parts;
  const header = jsonB64(rawHeader);
  const claims = jsonB64(rawClaims);
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{2,160}$/.test(header.kid)) throw invalid();
  const secs = Math.floor(now() / 1000);
  if (claims?.iss !== 'https://token.actions.githubusercontent.com' ||
      claims?.aud !== audience ||
      claims?.repository !== 'dizigs/archelaos-site' ||
      String(claims?.repository_id) !== expectedRepoId ||
      claims?.ref !== ref ||
      claims?.event_name !== eventName ||
      claims?.workflow_ref !== workflow ||
      claims?.runner_environment !== 'github-hosted' ||
      typeof claims.sha !== 'string' || !/^[0-9a-f]{40}$/.test(claims.sha) ||
      typeof claims.run_id !== 'string' || !/^\d{1,20}$/.test(claims.run_id) ||
      typeof claims.run_attempt !== 'string' || !/^[1-9]\d{0,3}$/.test(claims.run_attempt) ||
      typeof claims.jti !== 'string' || claims.jti.length < 8 || claims.jti.length > 160 ||
      !Number.isInteger(claims.iat) || !Number.isInteger(claims.nbf) || !Number.isInteger(claims.exp) ||
      claims.iat > secs + 30 || claims.nbf > secs + 30 || claims.exp <= secs ||
      claims.exp - claims.iat > 900 || claims.exp <= claims.iat) throw invalid();

  if (approvedWorkflowCommit !== undefined &&
      (!/^[0-9a-f]{40}$/.test(approvedWorkflowCommit) || claims.workflow_sha !== approvedWorkflowCommit ||
       claims.sha !== approvedWorkflowCommit || claims.sub !== 'repo:dizigs/archelaos-site:ref:refs/heads/main')) throw invalid();
  let keys;
  try {
    const response = await fetchKeys(jwksUrl, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(7000),
      headers: { accept: 'application/json' }
    });
    if (response.status !== 200 || Number(response.headers.get('content-length') || 0) > 131072) throw invalid();
    const responseText = await response.text();
    if (responseText.length > 131072) throw invalid();
    keys = JSON.parse(responseText).keys;
  } catch { throw invalid(); }
  if (!Array.isArray(keys) || keys.length > 24) throw invalid();
  const matches = keys.filter(k => k?.kid === header.kid && k?.kty === 'RSA' && k?.use === 'sig' &&
    (k.alg === undefined || k.alg === 'RS256') && typeof k.n === 'string' && typeof k.e === 'string');
  if (matches.length !== 1) throw invalid();
  try {
    const publicKey = await crypto.subtle.importKey('jwk', matches[0], { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const data = new TextEncoder().encode(rawHeader + '.' + rawClaims);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, b64Bytes(rawSignature), data);
    if (!valid) throw invalid();
  } catch { throw invalid(); }
  return {
    runKey: claims.run_id + ':' + claims.run_attempt,
    tokenHash: await sha256(token),
    sourceCommit: claims.sha
  };
}
