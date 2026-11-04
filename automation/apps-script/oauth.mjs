import { base64url, boundedJson, bytes, constantEqual, PrivateCipher, randomToken, ScriptFault, SCRIPT_SCOPE, sha256, unbase64url } from './security.mjs';
export const STATE_COOKIE = '__Host-archelaos-script-state';
export const SESSION_COOKIE = '__Host-archelaos-script-session';
const SCOPE_SET = new Set(['openid', 'email', 'https://www.googleapis.com/auth/userinfo.email', SCRIPT_SCOPE]);
const cookie = (name, value, age) => name + '=' + value + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + age;
function readCookie(header, name) {
  if (typeof header !== 'string' || header.length > 8192) throw new ScriptFault('OAUTH_COOKIE_REQUIRED', 401);
  const matches = header.split(';').map(s => s.trim()).filter(s => s.startsWith(name + '='));
  if (matches.length !== 1) throw new ScriptFault('OAUTH_COOKIE_REQUIRED', 401);
  const token = matches[0].slice(name.length + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ScriptFault('OAUTH_COOKIE_REQUIRED', 401);
  return token;
}
function grantedScopes(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new ScriptFault('GRANTED_SCOPES_REQUIRED', 403);
  const scopes = [...new Set(value.split(' ').filter(Boolean))];
  if (!scopes.includes(SCRIPT_SCOPE) || !scopes.includes('openid') || !(scopes.includes('email') || scopes.includes('https://www.googleapis.com/auth/userinfo.email')) || scopes.some(scope => !SCOPE_SET.has(scope))) throw new ScriptFault('GRANTED_SCOPES_REJECTED', 403);
  return scopes;
}
export async function verifyGoogleIdToken(token, { clientId, nonce, fetchGoogle = fetch, now = Date.now() }) {
  try {
    if (typeof token !== 'string' || token.length > 16384) throw new Error();
    const parts = token.split('.'); if (parts.length !== 3) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(unbase64url(parts[0])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 128 || header.jku || header.jwk || header.x5u || header.crit) throw new Error();
    const keys = await boundedJson(await fetchGoogle('https://www.googleapis.com/oauth2/v3/certs', { redirect: 'error', signal: AbortSignal.timeout(10000) }), 65536);
    if (!Array.isArray(keys.keys) || keys.keys.length > 20) throw new Error();
    const matching = keys.keys.filter(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
    if (matching.length !== 1) throw new Error();
    const key = await crypto.subtle.importKey('jwk', matching[0], { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unbase64url(parts[2]), bytes(parts[0] + '.' + parts[1]))) throw new Error();
    const claims = JSON.parse(new TextDecoder().decode(unbase64url(parts[1])));
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== clientId || claims.azp && claims.azp !== clientId || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now || !Number.isSafeInteger(claims.iat) || claims.iat * 1000 > now + 60000 || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 || nonce && !constantEqual(claims.nonce, nonce)) throw new Error();
    return claims;
  } catch { throw new ScriptFault('GOOGLE_IDENTITY_PROOF_REJECTED', 401); }
}

// Existing Worker integration calls these helpers with its configured Google
// client and state secret. No key, deployment, resource or route is created here.
export class ScriptOAuth {
  constructor({ config, store, cipher, fetchGoogle = fetch, now = Date.now }) {
    if (!config || typeof config.clientId !== 'string' || !config.clientId || typeof config.clientSecret !== 'string' || !config.clientSecret || typeof config.expectedAdminEmail !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(config.expectedAdminEmail) || !(cipher instanceof PrivateCipher)) throw new ScriptFault('OAUTH_CONFIGURATION_REQUIRED', 503);
    const origin = new URL(config.origin);
    if (origin.protocol !== 'https:' || origin.hostname !== 'archelaos-automation-bridge.dimitriszgalanis.workers.dev' || origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new ScriptFault('EXISTING_BRIDGE_ORIGIN_REQUIRED', 503);
    Object.assign(this, { config, store, cipher, fetchGoogle, now });
    this.callbackUrl = origin.origin + '/oauth/callback';
  }
  async begin() {
    const state = 'as_' + randomToken(); const stateId = await sha256(state); const browser = randomToken();
    const nonce = randomToken(); const verifier = randomToken();
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(verifier))));
    const value = { nonce, verifier, browserHash: await sha256(browser), callbackUrl: this.callbackUrl };
    this.store.putState(stateId, await this.cipher.seal(value, 'oauth-state:' + stateId), this.now() + 600000);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [name, entry] of Object.entries({ client_id: this.config.clientId, redirect_uri: this.callbackUrl, response_type: 'code', scope: 'openid email ' + SCRIPT_SCOPE, state, nonce, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', login_hint: this.config.expectedAdminEmail })) url.searchParams.set(name, entry);
    return { location: url.href, cookie: cookie(STATE_COOKIE, browser, 600) };
  }
  async exchange(body) {
    try {
      const response = await this.fetchGoogle('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, client_id: this.config.clientId, client_secret: this.config.clientSecret }).toString() });
      return await boundedJson(response, 65536);
    } catch (error) { if (error instanceof ScriptFault) throw error; throw new ScriptFault('GOOGLE_TOKEN_EXCHANGE_UNCERTAIN', 503); }
  }
  admin(claims) {
    if (claims.email_verified !== true || typeof claims.email !== 'string' || claims.email.toLowerCase() !== this.config.expectedAdminEmail.toLowerCase()) throw new ScriptFault('DESIGNATED_ADMIN_REQUIRED', 403);
    return { sub: claims.sub, email: claims.email, emailVerified: true, verified: true };
  }
  tokenFields(token) {
    if (token?.token_type?.toLowerCase() !== 'bearer' || typeof token.access_token !== 'string' || token.access_token.length < 16 || token.access_token.length > 8192 || !Number.isSafeInteger(token.expires_in) || token.expires_in < 1 || token.expires_in > 3600) throw new ScriptFault('INVALID_GOOGLE_TOKEN_RESPONSE', 502);
  }
  async callback({ state, code, cookieHeader }) {
    if (typeof state !== 'string' || !/^as_[A-Za-z0-9_-]{43}$/.test(state) || typeof code !== 'string' || !code || code.length > 4096) throw new ScriptFault('INVALID_OAUTH_CALLBACK', 401);
    const id = await sha256(state); const stored = this.store.peekState(id, this.now());
    if (!stored) throw new ScriptFault('OAUTH_STATE_EXPIRED_OR_REPLAYED', 401);
    const data = await this.cipher.open(stored, 'oauth-state:' + id);
    if (!constantEqual(await sha256(readCookie(cookieHeader, STATE_COOKIE)), data.browserHash) || data.callbackUrl !== this.callbackUrl) throw new ScriptFault('OAUTH_BROWSER_BINDING_REJECTED', 401);
    // Atomic one-time consumption precedes the only token exchange attempt.
    this.store.consumeState(id, this.now());
    const token = await this.exchange({ code, grant_type: 'authorization_code', redirect_uri: this.callbackUrl, code_verifier: data.verifier });
    this.tokenFields(token);
    const scopes = grantedScopes(token.scope);
    const claims = await verifyGoogleIdToken(token.id_token, { clientId: this.config.clientId, nonce: data.nonce, fetchGoogle: this.fetchGoogle, now: this.now() });
    const principal = this.admin(claims);
    if (typeof token.refresh_token !== 'string' || token.refresh_token.length < 16 || token.refresh_token.length > 8192) throw new ScriptFault('OFFLINE_REFRESH_GRANT_REQUIRED', 403);
    const session = randomToken(); const sessionId = await sha256(session);
    const record = { principal, scopes, accessToken: token.access_token, refreshToken: token.refresh_token, accessExpiresAt: this.now() + token.expires_in * 1000, sessionExpiresAt: this.now() + 8 * 3600000, grantExpiresAt: this.now() + 30 * 86400000, generation: 0 };
    this.store.putSession(sessionId, await this.cipher.seal(record, 'oauth-session:' + sessionId));
    this.store.bindGrant(await sha256(principal.sub + '|' + principal.email.toLowerCase()), sessionId);
    return { status: 'ADMIN_SCRIPT_GRANT_VERIFIED', grantedScopes: scopes, cookie: cookie(SESSION_COOKIE, session, 8 * 3600), clearStateCookie: cookie(STATE_COOKIE, '', 0) };
  }
  async access(cookieHeader) {
    const id = await sha256(readCookie(cookieHeader, SESSION_COOKIE));
    return this.accessId(id, false);
  }
  async accessForPrincipal(principal) {
    if (principal?.verified !== true || principal.emailVerified !== true || typeof principal.sub !== 'string' || !Array.isArray(principal.rights) || !principal.rights.some(right => ['apps-script:read', 'apps-script:edit'].includes(right))) throw new ScriptFault('EXECUTOR_ADMIN_BINDING_REQUIRED', 403);
    this.admin({ ...principal, email_verified: principal.emailVerified });
    const id = this.store.grantSession(await sha256(principal.sub + '|' + principal.email.toLowerCase()));
    if (!id) throw new ScriptFault('ADMIN_GRANT_REQUIRED', 401);
    return this.accessId(id, true);
  }
  async accessId(id, forExecutor) {
    const stored = this.store.getSession(id); if (!stored) throw new ScriptFault('ADMIN_SESSION_REQUIRED', 401);
    let data = await this.cipher.open(stored, 'oauth-session:' + id);
    if ((forExecutor ? data.grantExpiresAt : data.sessionExpiresAt) <= this.now()) throw new ScriptFault('ADMIN_SESSION_EXPIRED', 401);
    if (data.accessExpiresAt <= this.now() + 30000) {
      this.store.claimRefresh(id + ':' + data.generation);
      const token = await this.exchange({ grant_type: 'refresh_token', refresh_token: data.refreshToken }); this.tokenFields(token);
      // RFC6749: omitted refresh scope is identical to the original verified
      // grant. A returned narrowed/expanded scope is explicitly revalidated.
      const scopes = token.scope === undefined ? grantedScopes(data.scopes.join(' ')) : grantedScopes(token.scope);
      const user = await boundedJson(await this.fetchGoogle('https://openidconnect.googleapis.com/v1/userinfo', { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: 'Bearer ' + token.access_token } }), 32768);
      const principal = this.admin(user);
      if (principal.sub !== data.principal.sub) throw new ScriptFault('REFRESH_PRINCIPAL_MISMATCH', 403);
      if (token.refresh_token !== undefined && (typeof token.refresh_token !== 'string' || token.refresh_token.length < 16 || token.refresh_token.length > 8192)) throw new ScriptFault('INVALID_REFRESH_ROTATION', 502);
      data = { ...data, principal, scopes, accessToken: token.access_token, refreshToken: token.refresh_token || data.refreshToken, accessExpiresAt: this.now() + token.expires_in * 1000, generation: data.generation + 1 };
      this.store.putSession(id, await this.cipher.seal(data, 'oauth-session:' + id));
    }
    this.admin({ ...data.principal, email_verified: data.principal.emailVerified });
    return { accessToken: data.accessToken, principal: data.principal, grantedScopes: [...data.scopes] };
  }
}
