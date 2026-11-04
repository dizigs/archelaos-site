export class ScriptFault extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
export const SCRIPT_SCOPE = 'https://www.googleapis.com/auth/script.projects';
export const hex = /^[0-9a-f]{64}$/;
export const operationId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const utf8 = new TextEncoder();
export const bytes = value => utf8.encode(value);
export const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(value))), b => b.toString(16).padStart(2, '0')).join('');
export function base64url(value) { return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
export function unbase64url(value) {
  if (typeof value !== 'string' || value.length > 131072 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new ScriptFault('INVALID_ENCRYPTED_RECORD');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export function constantEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0;
}
export class PrivateCipher {
  #secret;
  constructor(secret) {
    if (typeof secret !== 'string' || secret.length < 32) throw new ScriptFault('PRIVATE_STORAGE_KEY_UNAVAILABLE', 503);
    this.#secret = secret;
  }
  async key(context) {
    const material = await crypto.subtle.importKey('raw', bytes(this.#secret), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: bytes('archelaos-script-bridge:v1'), info: bytes(context) }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async seal(value, context) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: bytes(context) }, await this.key(context), bytes(JSON.stringify(value)));
    // Ciphertext can exceed URL-token bounds: encode it in bounded chunks.
    const encoded = Array.from(new Uint8Array(data)); let raw = '';
    for (let i = 0; i < encoded.length; i += 8192) raw += String.fromCharCode(...encoded.slice(i, i + 8192));
    return JSON.stringify({ version: 1, iv: base64url(iv), data: btoa(raw) });
  }
  async open(record, context) {
    try {
      const value = JSON.parse(record);
      if (value.version !== 1 || typeof value.data !== 'string' || value.data.length > 8000000) throw new Error();
      const data = Uint8Array.from(atob(value.data), c => c.charCodeAt(0));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64url(value.iv), additionalData: bytes(context) }, await this.key(context), data);
      return JSON.parse(new TextDecoder().decode(plain));
    } catch { throw new ScriptFault('PRIVATE_RECORD_AUTHENTICATION_FAILED', 503); }
  }
}
export async function boundedJson(response, max = 3 * 1024 * 1024) {
  // Cloudflare Workers does not implement redirect: 'error'. Callers use
  // redirect: 'manual' and refuse 3xx responses before reading any body or URL.
  if (response.status >= 300 && response.status < 400) throw new ScriptFault('GOOGLE_REDIRECT_REJECTED', 502);
  if (!response.ok) throw new ScriptFault('GOOGLE_HTTP_' + response.status, response.status === 401 || response.status === 403 ? response.status : 502);
  const reader = response.body?.getReader(); if (!reader) throw new ScriptFault('GOOGLE_EMPTY_RESPONSE', 502);
  let size = 0; const parts = [];
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) throw new ScriptFault('GOOGLE_RESPONSE_TOO_LARGE', 502); parts.push(value); }
    const data = new Uint8Array(size); let offset = 0; for (const part of parts) { data.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder().decode(data));
  } catch (error) { if (error instanceof ScriptFault) throw error; throw new ScriptFault('GOOGLE_RESPONSE_INVALID', 502); }
  finally { await reader.cancel().catch(() => {}); }
}
