import { WorkerEntrypoint } from 'cloudflare:workers';
import {dispatch} from './engine.mjs';

/** Private service-binding RPC endpoint; no public HTTP, cron, or browser API. */
export default class ArchelaosGoogleAds extends WorkerEntrypoint {
  async fetch() { return new Response('Not found',{status:404}); }
  async executeSignedBrainIntent(envelope) {
    return dispatch(envelope,this.env);
  }
}
