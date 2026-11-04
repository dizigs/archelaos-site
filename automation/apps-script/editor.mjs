import { boundedJson, hex, operationId, PrivateCipher, ScriptFault, SCRIPT_SCOPE, sha256 } from './security.mjs';
import { applyChanges, contentHash, normalizeFiles } from './files.mjs';

export class GoogleProjects {
  constructor({ projectId, accessToken, fetchGoogle = fetch, audit = () => {} }) {
    if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(projectId) || typeof accessToken !== 'function') throw new ScriptFault('AUTHORIZED_PROJECT_BINDING_REQUIRED', 503);
    this.projectId = projectId; this.accessToken = accessToken; this.fetchGoogle = fetchGoogle; this.audit = audit; this.syntheticOnly = false;
  }
  async call(suffix, files) {
    try {
      const token = await this.accessToken();
      if (typeof token !== 'string' || token.length < 16) throw new ScriptFault('ADMIN_ACCESS_TOKEN_REQUIRED', 401);
      const response = await this.fetchGoogle('https://script.googleapis.com/v1/projects/' + this.projectId + suffix, {
        method: files ? 'PUT' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        ...(files ? { body: JSON.stringify({ files }) } : {})
      });
      this.audit('GOOGLE_PROJECT_' + (suffix ? 'CONTENT' : 'METADATA') + '_' + (files ? 'PUT' : 'GET') + '_HTTP_' + response.status);
      return await boundedJson(response);
    } catch (error) { if (error instanceof ScriptFault) throw error; throw new ScriptFault('GOOGLE_PROJECT_TRANSPORT_UNCERTAIN', 503); }
  }
  metadata() { return this.call(''); }
  content() { return this.call('/content'); }
  update(files) { return this.call('/content', files); }
}

export class ScriptEditor {
  constructor({ projectId, projectTitle, expectedAdminEmail, store, provider, cipher, policy = {}, ports = {}, now = Date.now }) {
    if (!projectId || !projectTitle || !expectedAdminEmail || !store || !provider || !(cipher instanceof PrivateCipher)) throw new ScriptFault('SCRIPT_INTEGRATION_UNCONFIGURED', 503);
    Object.assign(this, { projectId, projectTitle, expectedAdminEmail, store, provider, cipher, policy, ports, now });
  }
  authorize(actor, right) {
    if (actor?.verified !== true || actor.emailVerified !== true || typeof actor.email !== 'string' || actor.email.toLowerCase() !== this.expectedAdminEmail.toLowerCase() || typeof actor.sub !== 'string' || !actor.sub || !Array.isArray(actor.grantedScopes) || !actor.grantedScopes.includes(SCRIPT_SCOPE) || !Array.isArray(actor.rights) || !actor.rights.includes(right)) throw new ScriptFault('ADMIN_SCOPE_OR_EXECUTOR_AUTHORIZATION_REQUIRED', 403);
  }
  async load() {
    const metadata = await this.provider.metadata();
    if (metadata?.scriptId !== this.projectId || metadata.title !== this.projectTitle) throw new ScriptFault('PROJECT_IDENTITY_MISMATCH', 403);
    const raw = await this.provider.content();
    if (raw.scriptId !== this.projectId) throw new ScriptFault('CONTENT_PROJECT_IDENTITY_MISMATCH', 403);
    const files = normalizeFiles(raw); return { metadata, raw, files, hash: await contentHash(this.projectId, files) };
  }
  async operation(actor, id) {
    this.authorize(actor, 'apps-script:read');
    if (!operationId.test(id)) throw new ScriptFault('INVALID_OPERATION_ID', 422);
    const result = this.store.inspect(id, this.projectId, await sha256(actor.sub + '|' + actor.email.toLowerCase()));
    if (!result) throw new ScriptFault('OPERATION_NOT_FOUND', 404);
    return result;
  }
  async reconcile(actor, id) {
    this.authorize(actor, 'apps-script:edit');
    const prior = await this.operation(actor, id);
    if (!['WRITE_IN_FLIGHT', 'RECONCILIATION_REQUIRED'].includes(prior.status)) return prior;
    if (this.now() - prior.updatedAt < 30000) throw new ScriptFault('OPERATION_STILL_SETTLING', 423);
    const current = await this.load();
    if (current.hash !== prior.intendedHash || await this.triggers() !== prior.triggerHash) return { operationId: id, status: 'RECONCILIATION_REQUIRED', code: 'EXPECTED_OUTCOME_NOT_CONFIRMED' };
    const result = { operationId: id, status: 'VERIFIED', backupId: prior.backupId, headHash: current.hash, reconciled: true, verificationScope: 'configured-provider-content-readback', providerDeploymentVerified: false };
    this.store.finish(id, result); return result;
  }
  async read(actor) {
    this.authorize(actor, 'apps-script:read'); const current = await this.load();
    return { status: 'PRIVATE_CONTENT_READ', files: current.files, headHash: current.hash, projectIdentityVerified: true };
  }
  async snapshot(current) {
    const id = crypto.randomUUID(); const context = 'script-backup:' + this.projectId + ':' + id;
    const snapshot = { version: 1, projectId: this.projectId, beforeHash: current.hash, metadata: current.metadata, content: current.raw, files: current.files, at: this.now() };
    this.store.putPrivate(id, await this.cipher.seal(snapshot, context));
    const saved = await this.cipher.open(this.store.getPrivate(id), context);
    if (saved.projectId !== this.projectId || saved.beforeHash !== current.hash || await contentHash(this.projectId, normalizeFiles(saved.content)) !== current.hash) throw new ScriptFault('PRIVATE_BACKUP_READBACK_FAILED', 503);
    return id;
  }
  async backup(actor) {
    this.authorize(actor, 'apps-script:read'); const current = await this.load();
    const backupId = await this.snapshot(current); return { status: 'PRIVATE_BACKUP_VERIFIED', backupId, headHash: current.hash, fileCount: current.files.length };
  }
  async writerLease() {
    if (this.policy.liveWritesEnabled !== true || typeof this.ports.assertExclusiveWriter !== 'function') throw new ScriptFault('LIVE_WRITE_PREFLIGHT_INCOMPLETE', 423);
    const lease = await this.ports.assertExclusiveWriter(this.projectId);
    // Google updateContent has no atomic ETag precondition. Our project lock
    // cannot exclude IDE/other-client writers; require a trusted maintenance port.
    if (lease?.verified !== true || lease.projectId !== this.projectId || lease.expiresAt < this.now() + 30000) throw new ScriptFault('EXTERNAL_WRITER_EXCLUSION_UNVERIFIED', 423);
  }
  async triggers() {
    if (typeof this.ports.readTriggerInventory !== 'function') throw new ScriptFault('TRIGGER_VERIFICATION_UNAVAILABLE', 423);
    const result = await this.ports.readTriggerInventory(this.projectId);
    if (result?.verified !== true || !hex.test(result.fingerprint)) throw new ScriptFault('TRIGGER_VERIFICATION_UNAVAILABLE', 423);
    return result.fingerprint;
  }
  async edit(actor, input) {
    if (!input || Object.keys(input).some(key => !['operationId', 'expectedBaseHash', 'changes'].includes(key))) throw new ScriptFault('INVALID_EDIT_REQUEST', 422);
    return this.mutate(actor, input, files => applyChanges(files, input.changes));
  }
  async rollback(actor, input) {
    if (!input || Object.keys(input).some(key => !['operationId', 'expectedBaseHash', 'backupId'].includes(key)) || !operationId.test(input.backupId)) throw new ScriptFault('INVALID_ROLLBACK_REQUEST', 422);
    return this.mutate(actor, input, async () => {
      const data = this.store.getPrivate(input.backupId); if (!data) throw new ScriptFault('BACKUP_NOT_FOUND', 404);
      const target = await this.cipher.open(data, 'script-backup:' + this.projectId + ':' + input.backupId);
      const files = normalizeFiles(target.content);
      if (target.projectId !== this.projectId || await contentHash(this.projectId, files) !== target.beforeHash) throw new ScriptFault('BACKUP_PROJECT_OR_HASH_MISMATCH', 403);
      return files;
    });
  }
  async mutate(actor, input, change) {
    this.authorize(actor, 'apps-script:edit');
    if (!operationId.test(input.operationId) || !hex.test(input.expectedBaseHash)) throw new ScriptFault('OPERATION_AND_BASE_HASH_REQUIRED', 422);
    await this.writerLease();
    const actorHash = await sha256(actor.sub + '|' + actor.email.toLowerCase());
    const digest = await sha256(JSON.stringify(input));
    const begun = this.store.begin(input.operationId, this.projectId, actorHash, digest);
    if (!begun.fresh) return begun.result || { operationId: input.operationId, status: begun.status, replaySuppressed: true };
    let sent = false;
    try {
      const triggerFingerprint = await this.triggers();
      const current = await this.load();
      if (current.hash !== input.expectedBaseHash) throw new ScriptFault('STALE_PROJECT_HASH');
      const next = await change(current.files); const targetHash = await contentHash(this.projectId, next);
      if (typeof this.ports.reviewChange !== 'function' || await this.ports.reviewChange({ beforeHash: current.hash, afterHash: targetHash, files: next }) !== true) throw new ScriptFault('IMMUTABLE_DIFF_REVIEW_REQUIRED', 423);
      const backupId = await this.snapshot(current); this.store.attachBackup(input.operationId, backupId);
      const latest = await this.load();
      if (latest.hash !== current.hash) throw new ScriptFault('CONCURRENT_PROJECT_CHANGE');
      await this.writerLease();
      this.store.sent(input.operationId, targetHash, triggerFingerprint); sent = true;
      const response = await this.provider.update(next);
      if (response.scriptId !== this.projectId || await contentHash(this.projectId, normalizeFiles(response)) !== targetHash) throw new ScriptFault('WRITE_RESPONSE_MISMATCH');
      const after = await this.load();
      if (after.hash !== targetHash) throw new ScriptFault('POST_WRITE_READBACK_MISMATCH');
      if (await this.triggers() !== triggerFingerprint) throw new ScriptFault('TRIGGER_INVENTORY_CHANGED');
      const result = { operationId: input.operationId, status: 'VERIFIED', backupId, beforeHash: current.hash, headHash: targetHash, fileCount: after.files.length, verificationScope: 'configured-provider-content-readback', providerDeploymentVerified: false };
      this.store.finish(input.operationId, result); return result;
    } catch (error) {
      const code = error instanceof ScriptFault ? error.code : 'PRIVATE_OPERATION_FAILED';
      this.store.finish(input.operationId, { operationId: input.operationId, status: sent ? 'RECONCILIATION_REQUIRED' : 'FAILED_PREWRITE', code }, !sent);
      throw new ScriptFault(sent ? 'WRITE_OUTCOME_REQUIRES_RECONCILIATION' : code, sent ? 409 : error instanceof ScriptFault ? error.status : 503);
    }
  }
}
