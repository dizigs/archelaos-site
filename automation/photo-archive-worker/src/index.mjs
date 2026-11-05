import { WorkerEntrypoint } from "cloudflare:workers";
import { isIntakeEnabled, stageOriginal } from "./intake.mjs";

/*
 * A PRIVATE service-binding entrypoint: no public website route or workers.dev URL.
 * The sole Brain is the authority for all pending upload receipts and review decisions.
 */
export default class ArchelaosPhotoArchive extends WorkerEntrypoint {
  async status() {
    return {
      service: "archelaos-photo-archive",
      intakeEnabled: isIntakeEnabled(this.env),
      publicUploadEnabled: false,
      publishEnabled: false,
      canonicalBrainRequired: true,
    };
  }
  async stageOriginal(request) {
    return stageOriginal(this.env, request);
  }
  async fetch() {
    return new Response("Not found", {
      status: 404,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
}
