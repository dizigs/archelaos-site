import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { HealerLedger } from './ledger.mjs';

const COORDINATOR = 'archelaos-club';
export class HealerMemory extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ledger = new HealerLedger(ctx.storage);
  }
  // Internal Durable Object RPC methods; no public HTTP handlers.
  async recordFinding(finding) { return this.ledger.record(finding); }
  async lookupFinding(code, resource) { return this.ledger.find(code, resource); }
  async getStatus() { return this.ledger.status(); }
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
  async fetch() {
    return new Response('Not found', { status: 404,
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  }
}
