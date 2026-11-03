import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Load the Cloudflare Pages module without requiring a project-wide package type change.
const source = await readFile(new URL('../functions/api/contact.js', import.meta.url), 'utf8');
const { onRequestGet, onRequestPost } = await import('data:text/javascript,' + encodeURIComponent(source));

const ENV = { RESEND_API_KEY: 'resend-test-not-real', TURNSTILE_SECRET: 'turnstile-test-not-real' };
const origin = 'https://archelaos.club';
const validMessage = {
  name: 'Test Contributor', email: 'test@example.org', phone: '',
  topic: 'general', sport: '', message: 'This is an offline test message.',
  website: '', archiveLink: '', consent: true
};

async function submit({ token = 'test-valid-token', env = ENV, verification = {},
                        multipart = false, withAttachment = false } = {}) {
  let resendCalls = 0;
  let verifyCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/siteverify')) {
      verifyCalls += 1;
      return Response.json({
        success: true, hostname: 'archelaos.club', action: 'contact', ...verification
      });
    }
    if (String(url).includes('api.resend.com')) {
      resendCalls += 1;
      return Response.json({ id: 'offline-test-only' });
    }
    throw new Error('Unexpected outbound request: ' + url);
  };
  try {
    let request;
    if (multipart) {
      const form = new FormData();
      const message = { ...validMessage, topic: withAttachment ? 'archive' : 'general' };
      for (const [key, value] of Object.entries(message)) {
        form.set(key, typeof value === 'boolean' ? String(value) : value);
      }
      if (token !== null) form.set('cf-turnstile-response', token);
      if (withAttachment) {
        const pngSignature = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
        form.set('attachments', new Blob([pngSignature], { type: 'image/png' }), 'test.png');
      }
      request = new Request(origin + '/api/contact', { method: 'POST', body: form,
        headers: { Origin: origin } });
    } else {
      request = new Request(origin + '/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ ...validMessage, turnstileToken: token })
      });
    }
    const response = await onRequestPost({ request, env });
    return { status: response.status, body: await response.json(), verifyCalls, resendCalls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('GET advertises direct sending only with both encrypted secrets', async () => {
  const enabled = await (await onRequestGet({ env: ENV })).json();
  assert.equal(enabled.ready, true);
  assert.equal(enabled.turnstileSiteKey, '0x4AAAAAAFoyKwIFuvMbrcAd');
  const disabled = await (await onRequestGet({ env: { RESEND_API_KEY: 'test' } })).json();
  assert.equal(disabled.ready, false);
});

test('missing encrypted Turnstile secret stops direct submissions', async () => {
  const result = await submit({ env: { RESEND_API_KEY: 'resend-test-not-real' } });
  assert.equal(result.status, 503);
  assert.equal(result.resendCalls, 0);
});

test('missing or empty tokens are rejected before contacting Resend', async () => {
  for (const token of [null, '', 'x'.repeat(2049)]) {
    const result = await submit({ token });
    assert.equal(result.status, 403);
    assert.equal(result.resendCalls, 0);
    assert.equal(result.verifyCalls, 0);
  }
});

test('failed, wrong-host and wrong-action tokens do not send email', async () => {
  for (const verification of [
    { success: false }, { hostname: 'other.example.org' }, { action: 'login' }
  ]) {
    const result = await submit({ verification });
    assert.equal(result.status, 403);
    assert.equal(result.verifyCalls, 1);
    assert.equal(result.resendCalls, 0);
  }
});

test('valid token sends exactly one email in normal JSON flow', async () => {
  const result = await submit();
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.verifyCalls, 1);
  assert.equal(result.resendCalls, 1);
});

test('multipart archive message with an allowed attachment still works', async () => {
  const result = await submit({ multipart: true, withAttachment: true });
  assert.equal(result.status, 200);
  assert.equal(result.verifyCalls, 1);
  assert.equal(result.resendCalls, 1);
});

test('an invalid multipart token cannot send attachments', async () => {
  const result = await submit({ multipart: true, withAttachment: true, verification: { success: false } });
  assert.equal(result.status, 403);
  assert.equal(result.resendCalls, 0);
});
