/**
 * Brain-controlled Build / Testing dispatcher — inert integration scaffold.
 * No credentials, network calls, deploys, or merges. Existing CI is authoritative.
 */
export const TASK_TYPES = Object.freeze(["build", "testing"]);
export const ALLOWED_WORKFLOWS = Object.freeze({
  build: ["rebuild-check.yml"],
  testing: ["rebuild-check.yml", "visitor-experience.yml", "axe-accessibility.yml", "lighthouse-ci.yml"]
});
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-zA-Z0-9_-]{8,96}$/;
export function validateTaskIntent(intent) {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) throw new TypeError("Invalid task intent");
  if (!TASK_TYPES.includes(intent.type)) throw new Error("Unsupported task type");
  if (typeof intent.eventId !== "string" || !ID.test(intent.eventId)) throw new Error("Invalid eventId");
  if (typeof intent.commitSha !== "string" || !SHA.test(intent.commitSha)) throw new Error("Invalid commit SHA");
  if (intent.approved !== true) throw new Error("Brain approval required");
  if (intent.production === true || intent.autoMerge === true) throw new Error("Production/merge forbidden");
  return Object.freeze({ eventId: intent.eventId, type: intent.type, commitSha: intent.commitSha,
    workflows: [...ALLOWED_WORKFLOWS[intent.type]] });
}
export function evaluateChecks(expected, reports) {
  if (!Array.isArray(expected) || !Array.isArray(reports)) throw new TypeError("Invalid checks");
  const statuses = new Map(reports.map(r => [r.workflow, r.conclusion]));
  const failed = expected.filter(name => statuses.get(name) !== "success");
  return Object.freeze({ pass: failed.length === 0, failed, checked: expected.length });
}
