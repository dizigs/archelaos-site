import { AdapterBlocked, deliver, enabled, metadataEvent } from './common.mjs';
import { digest, UUID } from '../contract.mjs';

export async function handleGitHubWebhook(request, config, deps, now = Date.now()) {
  enabled(config, deps, ['enqueue']);
  if (!Number.isSafeInteger(config.repositoryId) || config.repositoryId < 1) throw new AdapterBlocked('GITHUB_REPOSITORY_CONFIGURATION_REQUIRED');
  if (typeof request.rawBody !== 'string' || new TextEncoder().encode(request.rawBody).length > 262144 || !UUID.test(request.deliveryId) || !/^sha256=[0-9a-f]{64}$/.test(request.signature || '') || typeof config.webhookSecret !== 'string' || config.webhookSecret.length < 32) throw new AdapterBlocked('GITHUB_WEBHOOK_UNVERIFIED');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(request.signature.slice(7).match(/../g), pair => Number.parseInt(pair, 16));
  if (!await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(request.rawBody))) throw new AdapterBlocked('GITHUB_WEBHOOK_UNVERIFIED');
  let body; try { body = JSON.parse(request.rawBody); } catch { throw new AdapterBlocked('GITHUB_INVALID_PAYLOAD'); }
  if (body.repository?.full_name !== 'dizigs/archelaos-site' || body.repository?.id !== config.repositoryId) throw new AdapterBlocked('GITHUB_REPOSITORY_SCOPE_MISMATCH');
  if (!['pull_request', 'issues', 'workflow_run', 'check_run'].includes(request.event)) return { status: 'IGNORED_UNSUPPORTED_EVENT', receipts: [] };
  const record = body.pull_request || body.issue || body.workflow_run || body.check_run;
  if (!record || !Number.isSafeInteger(record.id) || record.id < 1 || typeof record.updated_at !== 'string') throw new AdapterBlocked('GITHUB_RECORD_UNVERIFIED');
  if (record.head?.repo?.full_name && record.head.repo.full_name !== 'dizigs/archelaos-site') return { status: 'PRIVATE_REVIEW', reason: 'FORK_CODE_MUST_NOT_EXECUTE' };
  if (request.event === 'workflow_run' && record.name === 'Brain core runtime and security regressions') return { status: 'IGNORED_SELF_EVENT', receipts: [] };
  const event = await metadataEvent('github', String(record.id), request.event + '|' + record.updated_at + '|' + (record.head?.sha || record.head_sha || '') + '|' + (body.action || ''), request.deliveryId,
    { blobSha256: await digest(request.rawBody), mimeType: 'application/json', sizeBytes: new TextEncoder().encode(request.rawBody).length }, now);
  event.eventType = request.event === 'workflow_run' || request.event === 'check_run' ? 'github.ci.failed' : 'github.' + (request.event === 'pull_request' ? 'pr' : 'issue');
  if (['workflow_run', 'check_run'].includes(request.event) && !['failure', 'timed_out', 'cancelled'].includes(record.conclusion)) return { status: 'IGNORED_SUCCESS_OR_PENDING', receipts: [] };
  return { status: 'TECHNICAL_REVIEW_ONLY', ...await deliver(event, deps) };
}
