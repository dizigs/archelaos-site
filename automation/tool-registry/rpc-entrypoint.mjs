// Export this named class from the EXISTING Worker only after reviewed integration.
// It has no public URL route. Consumers need an explicit Cloudflare Service Binding
// to `archelaos-automation-bridge`, entrypoint `ToolRegistryEntrypoint`.
import { WorkerEntrypoint } from 'cloudflare:workers';
import { createRegistryReader } from './reader.mjs';
const readRegistry = createRegistryReader();
export class ToolRegistryEntrypoint extends WorkerEntrypoint {
  async getCatalog() { return readRegistry(this.env); }
}
