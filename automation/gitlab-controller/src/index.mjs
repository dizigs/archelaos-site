// ARCHELAOS GitLab Controller — scoped, authenticated issue-only API.
// Canonical source: GitHub dizigs/archelaos-site; GitLab project is pull-only mirror.
// No Git pushes, merges, pipelines, CI config changes, or arbitrary endpoints.
const GITLAB_PROJECT_ID = 88488684;
const API_BASE = `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}`;
const ISSUE_MAX_BYTES = 4096;
const UPSTREAM_MAX_BYTES = 100_000;
const ALLOWED_CATEGORIES = Object.freeze({
  audit: '[ARC AUDIT]',
  blocker: '[ARC BLOCKER]',
  maintenance: '[ARC MAINTENANCE]',
});

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length < 32 || b.length !== a.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readLimited(stream, limit) {
  if (!stream) throw new Error('MISSING_BODY');
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error('BODY_TOO_LARGE');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
}

export function validateIssue(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_REQUEST');
  const allowedKeys = ['category', 'title', 'description', 'ticketId'];
  if (Object.keys(input).some(key => !allowedKeys.includes(key))) throw new Error('INVALID_REQUEST');
  const { category, title, description, ticketId } = input;
  if (!Object.hasOwn(ALLOWED_CATEGORIES, category) ||
      typeof title !== 'string' || title.length < 4 || title.length > 140 ||
      typeof description !== 'string' || description.length < 6 || description.length > 2500 ||
      typeof ticketId !== 'string' || !/^[A-Z0-9][A-Z0-9_.-]{7,63}$/.test(ticketId) ||
      /[\r\n\x00-\x1F]/.test(title) ||
      /(^|\n)\s*\//m.test(description)) throw new Error('INVALID_REQUEST');
  const marker = `ARC-CTRL:${ticketId}`;
  return {
    title: `${ALLOWED_CATEGORIES[category]} ${title}`,
    description: `${description}\n\nController reference: ${marker}`,
    confidential: true,
    marker,
  };
}

async function callGitLab(path, options, token, fetcher) {
  const url = `${API_BASE}${path}`;
  const signal = AbortSignal.timeout(9000);
  const result = await fetcher(url, {
    method: options.method,
    headers: {
      'PRIVATE-TOKEN': token,
      'accept': 'application/json',
      ...(options.method === 'POST' ? {'content-type': 'application/json'} : {}),
    },
    ...(options.body ? {body: JSON.stringify(options.body)} : {}),
    redirect: 'manual',
    signal,
  });
  if (result.status >= 300 && result.status <= 399) throw new Error('UPSTREAM_REDIRECT');
  if (!result.ok) throw new Error('UPSTREAM_HTTP_STATUS');
  if (Number(result.headers.get('content-length') || 0) > UPSTREAM_MAX_BYTES) throw new Error('UPSTREAM_TOO_LARGE');
  const raw = await readLimited(result.body, UPSTREAM_MAX_BYTES);
  return JSON.parse(raw);
}

export async function submitIssue(input, env, fetcher = fetch) {
  if (!env?.GITLAB_CONTROLLER_TOKEN) throw new Error('CONTROLLER_NOT_CONFIGURED');
  const validated = validateIssue(input);
  // Reconcile retries by a caller-generated stable ticket ID, before creating any issue.
  // Not an atomic reservation; callers must serialize retries for a single ticket ID.
  const q = new URLSearchParams({ search: validated.marker, in: 'description', state: 'all', per_page: '100' });
  const existing = await callGitLab(`/issues?${q}`, {method:'GET'}, env.GITLAB_CONTROLLER_TOKEN, fetcher);
  if (!Array.isArray(existing)) throw new Error('UPSTREAM_SCHEMA');
  const duplicate = existing.find(x => typeof x.description === 'string' &&
    x.description.split(/\r?\n/).some(line => line === 'Controller reference: ' + validated.marker));
  if (duplicate && duplicate.confidential !== true) throw new Error('UPSTREAM_PRIVACY_CONFLICT');
  if (duplicate) return { status: 'exists', iid: duplicate.iid, url: duplicate.web_url };
  const created = await callGitLab('/issues', {
    method:'POST',
    body:{ title: validated.title, description: validated.description, confidential: validated.confidential },
  }, env.GITLAB_CONTROLLER_TOKEN, fetcher);
  if (!Number.isInteger(created.iid) || !created.web_url || created.confidential !== true)
    throw new Error('UPSTREAM_SCHEMA');
  return { status:'created', iid:created.iid, url:created.web_url };
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/health') {
      return reply({service:'archelaos-gitlab-controller', healthy:true});
    }
    if (request.method !== 'POST' || pathname !== '/issues') return reply({error:'NOT_FOUND'},404);
    const bearer = request.headers.get('authorization') || '';
    const provided = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
    if (!constantTimeEqual(env?.CONTROLLER_COMMAND_KEY, provided)) return reply({error:'NOT_FOUND'},404);
    if (!env?.GITLAB_CONTROLLER_TOKEN) return reply({status:'not_configured'},503);
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json'))
      return reply({error:'INVALID_REQUEST'},400);
    if (Number(request.headers.get('content-length') || 0) > ISSUE_MAX_BYTES) return reply({error:'INVALID_REQUEST'},413);
    try {
      const input = JSON.parse(await readLimited(request.body, ISSUE_MAX_BYTES));
      const saved = await submitIssue(input, env);
      console.log(JSON.stringify({event:'gitlab_controller_issue', status:saved.status, iid:saved.iid}));
      return reply(saved, saved.status === 'created' ? 201 : 200);
    } catch (error) {
      if (error?.message === 'INVALID_REQUEST' || error?.message === 'BODY_TOO_LARGE')
        return reply({error:'INVALID_REQUEST'},400);
      console.error(JSON.stringify({event:'gitlab_controller_issue',status:'unavailable'}));
      return reply({status:'unavailable'},503);
    }
  },
};
