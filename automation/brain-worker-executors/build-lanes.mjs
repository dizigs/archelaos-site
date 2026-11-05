/**
 * Two logical build lanes, one central Brain budget and one CI gate.
 * Provider model IDs must be supplied by verified provider inventory.
 * This module performs no inference or GitHub writes.
 */
export const BUILD_LANES = Object.freeze({
  A: Object.freeze({ provider: "gemini", role: "complex-code", maxAttempts: 2 }),
  B: Object.freeze({ provider: "gemma", role: "small-fixes-and-tests", maxAttempts: 2 })
});
const SHA = /^[a-f0-9]{40}$/;
const SAFE_PATH = /^(?:automation|rebuild|assets|functions|tests)\/[a-zA-Z0-9_./-]+$/;
export function planBuild({ lane, commitSha, paths, brainApproval, modelRegistry, reservedEuros, monthlyRemainingEuros }) {
  if (!Object.hasOwn(BUILD_LANES, lane)) throw new Error("Unknown build lane");
  if (brainApproval !== true) throw new Error("Brain approval required");
  if (!SHA.test(commitSha ?? "")) throw new Error("Invalid commit SHA");
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 12 ||
      paths.some(p => typeof p !== "string" || !SAFE_PATH.test(p) || p.includes(".."))) {
    throw new Error("Unsafe or missing file scope");
  }
  if (!Number.isFinite(reservedEuros) || reservedEuros < 0 ||
      !Number.isFinite(monthlyRemainingEuros) || monthlyRemainingEuros < reservedEuros) {
    throw new Error("Insufficient verified budget");
  }
  const provider = BUILD_LANES[lane].provider;
  const model = modelRegistry?.[provider];
  if (!model || model.verified !== true || typeof model.modelId !== "string" || !model.modelId.trim()) {
    throw new Error("Provider model is not verified");
  }
  return Object.freeze({ lane, provider, modelId: model.modelId, commitSha,
    paths: Object.freeze([...paths]), maxAttempts: BUILD_LANES[lane].maxAttempts,
    reservedEuros, mergeAllowed: false, productionAllowed: false });
}
export function canRunTogether(a, b) {
  if (!a || !b || a.lane === b.lane) return false;
  return !a.paths.some(p => b.paths.includes(p));
}
