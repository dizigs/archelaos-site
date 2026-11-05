import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { HealerLedger } from './ledger.mjs';
import { parseFinding } from './policy.mjs';
import { RecoveryLedger, recover as recoverIncident } from './recovery.mjs';

const COORDINATOR = 'archelaos-club';
export class HealerMemory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ledger = new HealerLedger(ctx.storage);
    this.recoveryLedger = new RecoveryLedger(ctx.storage);
  }
  // Internal Durable Object RPC methods; no public HTTP handlers.
  async recordFinding(finding) { return this.ledger.record(finding); }
  async lookupFinding(code, resource) { return this.ledger.find(code, resource); }
  async getStatus() { return this.ledger.status(); }
  async getRecoveryStatus() {
    const rows = [...this.recoveryLedger.sql.exec('SELECT state,COUNT(*) AS count FROM recoveries GROUP BY state')];
    return { status: 'DURABLE_RECOVERY_STATE', states: rows.map(row => ({
      state: row.state, count: row.count
    })), autoMergeAllowed: false, deployAllowed: false };
  }
  async attemptRecovery(value) {
    // Metadata authenticity must be verified against Brain's own durable receipt.
    // Without the separately approved Brain Service binding, fail closed.
    const finding = parseFinding(value);
    const brain = this.env.BRAIN_RECOVERY;
    const ports = brain ? {
      verifyBrainReceipt: async f => brain.verifySelfHealReceipt(f),
      routeBuilderReview: async plan => brain.routeSelfHealReview(plan),
      readOnlyProbe: async probe => brain.recheckSelfHealHealth(probe)
    } : {};
    return recoverIncident(finding, this.recoveryLedger, ports);
  }
}

// Calls are possible only from Workers with an explicitly configured Service binding.
// No workers.dev hostname, custom route, cron, webhook, GitHub write authority or AI calls.
export default class HealerService extends WorkerEntrypoint {
  get memory() {
    const id = this.env.HEALER_MEMORY.idFromName(COORDINATOR);
    return this.env.HEALER_MEMORY.get(id);
  }
  async observe(finding) { return this.memory.recordFinding(finding); }
  async diagnose(code, resource) { return this.memory.lookupFinding(code, resource); }
  async status() { return this.memory.getStatus(); }
  async recoveryStatus() { return this.memory.getRecoveryStatus(); }
  async attemptRecovery(finding) { return this.memory.attemptRecovery(finding); }
  async fetch() {
    return new Response('Not found', { status: 404,
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  }
}
