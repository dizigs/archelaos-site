/**
 * Optional, read-only Apps Script inventory and advisory safety checks.
 * Reuses PR #124's exact project binding, hashing and content validation.
 * NO API writes. All real edits/rollback MUST use ../editor.mjs ScriptEditor.
 */
import { contentHash, normalizeFiles } from '../files.mjs';
import { constantEqual, hex, randomToken, sha256, ScriptFault } from '../security.mjs';

export const LIMITATION = 'BRIDGE_ADVISORY_LEASE_ONLY; NO GOOGLE_WEB_IDE_OR_EXTERNAL_OAUTH_LOCK';
const SCRIPT_ID = /^[A-Za-z0-9_-]{20,200}$/;
const STR = /^[A-Za-z0-9_.:@-]{1,160}$/;
const TOKEN_VALUE = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\bya29\.[A-Za-z0-9_-]+/g,
  /\b1\/\/[A-Za-z0-9_-]+/g,
  /\bGOCSPX-[A-Za-z0-9_-]+/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
];
const SECRET_KEY = /(?:token|secret|password|private.?key|api.?key|authorization|cookie|credential|client.?assertion)/i;

export function redactSecrets(input, ancestors = new WeakSet(), depth = 0) {
  if (depth > 12) return '[TRUNCATED]';
  if (typeof input === 'string') {
    let output = input.slice(0, 4096);
    for (const pattern of TOKEN_VALUE) output = output.replace(pattern, '[REDACTED_SECRET]');
    return output;
  }
  if (input === null || typeof input !== 'object') return input;
  if (ancestors.has(input)) return '[CIRCULAR]';
  ancestors.add(input);
  let output;
  if (Array.isArray(input)) {
    output = input.slice(0, 50).map(value => redactSecrets(value, ancestors, depth + 1));
  } else {
    output = Object.fromEntries(Object.entries(input).slice(0, 50).map(([key, value]) => [
      key.slice(0, 128),
      SECRET_KEY.test(key) ? '[REDACTED]' : redactSecrets(value, ancestors, depth + 1)
    ]));
  }
  ancestors.delete(input);
  return output;
}

export class AuditLogger {
  constructor({ store, now = () => new Date().toISOString() }) {
    if (typeof store?.insertAuditLog !== 'function') throw new ScriptFault('SAFETY_AUDIT_STORE_REQUIRED', 503);
    this.store = store; this.now = now;
  }
  async log({ eventType, scriptId = null, actorId = null, outcome, reasonCode = null, details = {} }) {
    if (!/^[A-Z_]{3,64}$/.test(eventType) || !['INFO','REJECTED','ERROR','ALLOWED'].includes(outcome)) {
      throw new ScriptFault('INVALID_SAFETY_AUDIT_EVENT', 422);
    }
    const entry = {
      timestamp: this.now(), eventType,
      scriptId: scriptId ? redactSecrets(String(scriptId)) : null,
      actorId: actorId ? await sha256(String(actorId)) : null,
      outcome, reasonCode: reasonCode ? redactSecrets(String(reasonCode)) : null,
      detailsJson: JSON.stringify(redactSecrets({ ...details, limitation: LIMITATION }))
    };
    await this.store.insertAuditLog(entry);
    return entry;
  }
}

/**
 * Verified read-only inventory for precisely ONE preconfigured Apps Script project.
 * metadata()/content() are the same GoogleProjects methods as PR #124.
 * Google Projects REST does not expose all installable triggers or IDE writers.
 */
export class AppsScriptInventoryService {
  constructor({ projectId, projectTitle, provider, store, auditLogger, readDeployments, readVersions }) {
    if (!SCRIPT_ID.test(projectId) || typeof projectTitle !== 'string' || !projectTitle ||
        !provider?.metadata || !provider?.content || !store?.upsertInventorySnapshot || !auditLogger) {
      throw new ScriptFault('INVENTORY_PROJECT_BINDING_REQUIRED', 503);
    }
    Object.assign(this, { projectId, projectTitle, provider, store, auditLogger, readDeployments, readVersions });
  }
  async inspect() {
    // Do not infer writer identity from projects.get; its response is not Drive's file metadata.
    const metadata = await this.provider.metadata();
    const raw = await this.provider.content();
    if (metadata?.scriptId !== this.projectId || metadata?.title !== this.projectTitle ||
        raw?.scriptId !== this.projectId) throw new ScriptFault('INVENTORY_PROJECT_IDENTITY_MISMATCH', 403);
    const files = normalizeFiles(raw);
    return { metadata, files, sourceHash: await contentHash(this.projectId, files) };
  }
  async sync() {
    const { metadata, files, sourceHash } = await this.inspect();
    // Manifest webapp/executionApi describe configurations, not installable triggers.
    const manifest = JSON.parse(files.find(f => f.name === 'appsscript' && f.type === 'JSON').source);
    const entrypoints = [];
    if (manifest.webapp) entrypoints.push({ kind: 'WEBAPP_CONFIGURATION' });
    if (manifest.executionApi) entrypoints.push({ kind: 'EXECUTION_API_CONFIGURATION' });
    if (Array.isArray(manifest.sheets?.macros)) {
      for (const macro of manifest.sheets.macros.slice(0, 100))
        entrypoints.push({ kind: 'SHEET_MACRO', functionName: String(macro.functionName || '').slice(0,128) });
    }
    // Never persist raw API payloads or project source.
    const safeItems = (items, kind) => Array.isArray(items) ? items.slice(0, 200).map(item => ({
      kind,
      id: String(kind === 'DEPLOYMENT' ? item.deploymentId || '' : item.versionNumber || '').slice(0,180),
      versionNumber: Number.isInteger(item.deploymentConfig?.versionNumber)
        ? item.deploymentConfig.versionNumber : null
    })) : [];
    const deployments = typeof this.readDeployments === 'function'
      ? safeItems(await this.readDeployments(this.projectId), 'DEPLOYMENT') : [];
    const versions = typeof this.readVersions === 'function'
      ? safeItems(await this.readVersions(this.projectId), 'VERSION') : [];
    const snapshot = {
      scriptId: this.projectId, title: this.projectTitle, parentId: null,
      sourceHash, fileCount: files.length,
      remoteUpdateTime: metadata.updateTime ?? null,
      lastModifyUser: null, // not available from projects.get
      triggerVisibility: 'NOT_VERIFIED',
      entrypoints, deployments, versions, syncedAt: new Date().toISOString()
    };
    await this.store.upsertInventorySnapshot(snapshot);
    await this.auditLogger.log({
      eventType: 'INVENTORY_SYNC', scriptId: this.projectId, outcome: 'INFO',
      details: { sourceHash, fileCount: files.length, triggerVisibility: 'NOT_VERIFIED' }
    });
    return { ...snapshot, limitationNotice: LIMITATION, installableTriggersComplete: false };
  }
  async inspectDrift({ expectedSourceHash }) {
    if (!hex.test(expectedSourceHash ?? '')) throw new ScriptFault('MISSING_EXPECTED_HASH', 422);
    const current = await this.inspect();
    const stored = await this.store.getInventorySnapshot(this.projectId);
    const signals = [];
    if (expectedSourceHash !== current.sourceHash) signals.push('REMOTE_SOURCE_HASH_DRIFT');
    if (stored?.remoteUpdateTime && current.metadata.updateTime &&
      Date.parse(current.metadata.updateTime) > Date.parse(stored.remoteUpdateTime)) {
      signals.push('PROJECT_METADATA_UPDATED_AFTER_SNAPSHOT');
    }
    return { scriptId: this.projectId, sourceHash: current.sourceHash,
      driftDetected: signals.length > 0, signals, limitationNotice: LIMITATION,
      externalWriterExclusionVerified: false, triggerInventoryVerified: false };
  }
}

/** Advisory lock for scheduling READ-ONLY bridge jobs. Not a write authorization. */
export class LeaseManager {
  constructor({ store, auditLogger, now = () => Date.now() }) {
    if (!store?.tryAcquireLease || !store?.getLease || !store?.renewLease || !store?.releaseLease) {
      throw new ScriptFault('ATOMIC_SAFETY_LEASE_STORE_REQUIRED', 503);
    }
    Object.assign(this, { store, auditLogger, now });
  }
  async acquire({ scriptId, holderId, expectedSourceHash, ttlMs = 60000 }) {
    if (!SCRIPT_ID.test(scriptId) || !STR.test(holderId) || !hex.test(expectedSourceHash) ||
        !Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) {
      throw new ScriptFault('INVALID_SAFETY_LEASE_REQUEST', 422);
    }
    const token = randomToken();
    const record = {
      scriptId, holderId, tokenHash: await sha256(token),
      expectedSourceHash, acquiredAt: this.now(), expiresAt: this.now() + ttlMs
    };
    if (!await this.store.tryAcquireLease(record)) {
      await this.auditLogger?.log({ eventType: 'LEASE_ACQUIRE', scriptId, actorId: holderId,
        outcome: 'REJECTED', reasonCode: 'LEASE_CONFLICT' });
      throw new ScriptFault('SAFETY_LEASE_CONFLICT', 423);
    }
    await this.auditLogger?.log({ eventType: 'LEASE_ACQUIRE', scriptId, actorId: holderId,
      outcome: 'ALLOWED', details: { expiresAt: record.expiresAt } });
    return { scriptId, holderId, token, expectedSourceHash, expiresAt: record.expiresAt,
      limitationNotice: LIMITATION };
  }
  async verify({ scriptId, holderId, token, expectedSourceHash }) {
    const record = await this.store.getLease(scriptId);
    if (!record || record.expiresAt <= this.now() || record.holderId !== holderId ||
        !hex.test(record.tokenHash) || !constantEqual(record.tokenHash, await sha256(token || '')) ||
        record.expectedSourceHash !== expectedSourceHash) throw new ScriptFault('SAFETY_LEASE_INVALID', 423);
    return record;
  }
  async renew(lease, ttlMs = 60000) {
    if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new ScriptFault('INVALID_LEASE_TTL', 422);
    await this.verify(lease);
    const expiresAt = this.now() + ttlMs;
    if (!await this.store.renewLease(lease.scriptId, await sha256(lease.token), expiresAt))
      throw new ScriptFault('SAFETY_LEASE_INVALID', 423);
    return { ...lease, expiresAt };
  }
  async release(lease) {
    await this.verify(lease);
    return this.store.releaseLease(lease.scriptId, await sha256(lease.token));
  }
}

/**
 * Deliberately denies ANY write through this secondary safety module.
 * Route approved writes through PR124 ScriptEditor.mutate() only: its authenticated
 * executor, full-file check, immutable encrypted backup, atomic operations and
 * reconciliation must never be bypassed.
 */
export async function executeGuardedWrite() {
  throw new ScriptFault('WRITE_MUST_USE_PR124_SCRIPT_EDITOR', 423);
}
