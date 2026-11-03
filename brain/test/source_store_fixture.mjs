// Synthetic-only Workers harness. Never imported by the deployable entrypoint.
import { DurableObject } from 'cloudflare:workers';
import { BrainCoordinator } from '../src/worker.mjs';
import { SqlSourceState } from '../src/source_state.mjs';
import { SqlDraftRegistry } from '../src/content_pipeline.mjs';
import { handleDriveNotification } from '../src/adapters/drive.mjs';
import { handleGmailPush } from '../src/adapters/gmail.mjs';
import { handleContributionReceipt } from '../src/adapters/contributions.mjs';
export { BrainCoordinator };

export class StoreHarness extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.ctx = ctx; this.env = env;
    this.store = new SqlSourceState(ctx.storage, () => Number(this.env.TEST_NOW) || Date.now());
    this.drafts = new SqlDraftRegistry(ctx.storage);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS fixture_calls(kind TEXT,cursor TEXT,page_token TEXT)');
  }
  async fetch(request) {
    const input = await request.json(); const path = new URL(request.url).pathname;
    const core = this.env.CORE.get(this.env.CORE.idFromName('adapter-intake'));
    try {
      if (path === '/initialize') { this.store.initialize(input.key, input.cursor); return Response.json({ ok: true }); }
      if (path === '/snapshot') return Response.json({ cursor: this.store.getCursor(input.key), sourceRows: [...this.ctx.storage.sql.exec('SELECT source,revision,owner IS NOT NULL AS locked FROM source_state')], calls: [...this.ctx.storage.sql.exec('SELECT * FROM fixture_calls')], core: await (await core.fetch('https://internal/internal/diagnostics')).json() });
      if (path === '/hold') return Response.json(await this.store.withLease(input.key, Date.now(), async () => { await new Promise(resolve => setTimeout(resolve, 200)); return { held: true }; }));
      if (path === '/crashed-lease') { this.ctx.storage.sql.exec('UPDATE source_state SET owner=?,expires=? WHERE source=?', 'synthetic-crashed-owner', Number(this.env.TEST_NOW) + 60000, input.key); return Response.json({ persisted: true }); }
      if (path === '/draft') return Response.json(await this.drafts.save(input.draft));
      if (path === '/draft-count') return Response.json([...this.ctx.storage.sql.exec('SELECT COUNT(*) AS count FROM content_drafts')][0]);
      let deliveries = 0;
      const dependencies = {
        enqueue: async event => {
          const response = await core.fetch('https://internal/internal/events', { method: 'POST', body: JSON.stringify(event) });
          if (![200, 202].includes(response.status)) throw new Error('Synthetic core rejected intake');
          const receipt = await response.json(); deliveries++;
          if (input.failAfterDurable === deliveries) throw new Error('Synthetic crash after durable enqueue');
          return receipt;
        },
        readApprovedMetadata: async () => input.metadata,
        listChanges: async options => {
          this.ctx.storage.sql.exec('INSERT INTO fixture_calls(kind,cursor) VALUES(?,?)', 'drive', options.cursor);
          return input.pages[options.cursor];
        },
        verifyOidc: async () => input.principal,
        listHistory: async options => {
          this.ctx.storage.sql.exec('INSERT INTO fixture_calls(kind,cursor,page_token) VALUES(?,?,?)', 'gmail', options.cursor, options.pageToken || '');
          if (input.historyMissing) { const error = new Error('Synthetic expired history'); error.code = 'HISTORY_NOT_FOUND'; throw error; }
          if (options.cursor !== '100') throw new Error('Gmail startHistoryId corrupted by page token');
          return input.pages[options.pageToken || 'first'];
        },
        verifyBackendReceipt: async () => input.backendReceipt
      };
      if (path === '/drive') return Response.json(await handleDriveNotification(input.notification, input.config, dependencies, this.store, Number(this.env.TEST_NOW) || Date.now()));
      if (path === '/gmail') return Response.json(await handleGmailPush(input.push, input.config, dependencies, this.store, Number(this.env.TEST_NOW) || Date.now()));
      if (path === '/form') return Response.json(await handleContributionReceipt(input.input, input.config, dependencies));
      return Response.json({ error: 'FIXTURE_ROUTE_UNSUPPORTED' }, { status: 404 });
    } catch (error) { return Response.json({ code: error.code || 'SYNTHETIC_INTERRUPTED_ACTION' }, { status: 409 }); }
  }
}
export default { fetch(request, env) { return env.STORE.get(env.STORE.idFromName('fixture')).fetch(request); } };
