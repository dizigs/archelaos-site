import { WorkerEntrypoint } from 'cloudflare:workers';
import { buildBrainAnalyticsEvent } from './aggregate.mjs';

/**
 * No HTTP surface. Only the central Brain may invoke this private RPC
 * after checking original report provenance, signed receipt and caller rights.
 */
export default class ArchelaosAnalytics extends WorkerEntrypoint {
  async fetch(){return new Response('Not found',{status:404});}
  async normalizeForBrain({report,observedAt}={}) {
    if(this.env?.ANALYTICS_ENABLED!=='true')throw Error('ANALYTICS_WORKER_DISABLED');
    return buildBrainAnalyticsEvent(report,observedAt);
  }
}
