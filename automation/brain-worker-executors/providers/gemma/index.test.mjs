import test from "node:test";
import assert from "node:assert/strict";
import { createGemmaExecutor, GemmaExecutorError, MODEL_ID, MAX_REQUEST_USD } from "./index.mjs";

const sha = "a".repeat(40);
const task = () => ({
  eventId: "event_12345678", commitSha: sha, approved: true,
  paths: ["automation/example.mjs"], prompt: "Fix one small issue"
});
const output = () => ({
  choices: [{
    finish_reason: "stop",
    message: { content: JSON.stringify({
      summary: "Small fix", risk: "low",
      files: [{ path: "automation/example.mjs", replacement: "export const ok = true;", reason: "Regression fix" }],
      tests: ["node --test"]
    }) }
  }]
});
const ledger = () => {
  const calls = { reserves: [], settles: [] };
  return {
    calls,
    async reserve(request) {
      calls.reserves.push(request);
      return { approved: true, eventId: request.eventId, modelId: request.modelId,
        currency: "USD", reservationId: "reserved_12345678",
        amountUsd: request.amountUsd, expiresAt: new Date(Date.now() + 60000).toISOString() };
    },
    async settle(request) { calls.settles.push(request); }
  };
};
function adapter(api, budget, extra = {}) {
  return createGemmaExecutor({ api, budget, enabled: true, inventoryVerified: true,
    sleep: async () => {}, ...extra });
}
async function rejectsCode(promise, code) {
  await assert.rejects(promise, e => e instanceof GemmaExecutorError && e.code === code);
}
test("defaults to disabled with zero calls", async () => {
  let used = 0;
  const a = createGemmaExecutor({ api: { run: () => { used++; } } });
  assert.equal((await a.run(task())).reason, "operator_disabled");
  assert.equal(used, 0);
});
test("inventory verification is mandatory before a billable call", async () => {
  const a = createGemmaExecutor({ enabled: true, api: { run: () => { throw Error("called"); } } });
  assert.equal((await a.run(task())).reason, "provider_not_verified");
});
test("requires external atomic Brain ledger", async () => {
  await rejectsCode(adapter({ run: async () => output() }).run(task()), "brain_budget_ledger_missing");
});
test("valid scoped proposal, exact verified model, schema and budget reserve", async () => {
  const budget = ledger();
  let calls = 0;
  const ai = { async run(model, body, options) {
    calls++;
    assert.equal(model, MODEL_ID);
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.deepEqual(options, { rejectIfBusy: true });
    return output();
  } };
  const result = await adapter(ai, budget).run(task());
  assert.equal(result.status, "proposed");
  assert.equal(result.proposal.files[0].path, "automation/example.mjs");
  assert.equal(result.writesPerformed, false);
  assert.equal(calls, 1);
  assert.equal(budget.calls.reserves.length, 1);
  assert.equal(budget.calls.settles[0].status, "consumed");
  assert.ok(budget.calls.reserves[0].amountUsd <= MAX_REQUEST_USD);
});
test("rejects unapproved tasks and disallowed paths before reserve", async () => {
  const budget = ledger(); let used = 0;
  const a = adapter({ run: () => { used++; return output(); } }, budget);
  await rejectsCode(a.run({ ...task(), approved: false }), "brain_approval_required");
  await rejectsCode(a.run({ ...task(), paths: ["../../secrets"] }), "invalid_path_scope");
  await rejectsCode(a.run({ ...task(), paths: ["automation/../secret"] }), "invalid_path_scope");
  await rejectsCode(a.run({ ...task(), autoMerge: true }), "brain_approval_required");
  assert.equal(budget.calls.reserves.length, 0); assert.equal(used, 0);
});
test("refuses invalid receipt before calling Gemma", async () => {
  const budget = ledger(); budget.reserve = async request => ({ approved: false, eventId: request.eventId });
  let used = 0;
  await rejectsCode(adapter({ run: () => { used++; } }, budget).run(task()), "unverified_budget_reservation");
  assert.equal(used, 0);
});
test("model output outside allowlist is rejected and budget stays unknown", async () => {
  const budget = ledger();
  const malicious = output();
  malicious.choices[0].message.content = JSON.stringify({
    summary: "bad", risk: "low", tests: [],
    files: [{ path: "automation/secrets.mjs", replacement: "bad", reason: "unsafe" }]
  });
  await rejectsCode(adapter({ run: async () => malicious }, budget).run(task()), "invalid_structured_output");
  assert.equal(budget.calls.settles[0].status, "unknown");
});
test("non-JSON and incomplete output are safely rejected", async () => {
  const budget = ledger();
  await rejectsCode(adapter({ run: async () => ({ response: "not JSON" }) }, budget).run(task()),
    "invalid_structured_output");
  await rejectsCode(adapter({ run: async () => ({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }) }, ledger()).run(task()),
    "incomplete_model_response");
});
test("429 retries once with bounded backoff and reservation for both attempts", async () => {
  const budget = ledger(); let used = 0; const sleeps = [];
  const a = adapter({ async run() {
    used++; if (used === 1) throw Object.assign(new Error("capacity"), { status: 429, code: 3040 });
    return output();
  } }, budget, { sleep: async ms => { sleeps.push(ms); } });
  const result = await a.run(task());
  assert.equal(result.attemptsUsed, 2); assert.deepEqual(sleeps, [250]);
  assert.equal(budget.calls.reserves[0].attempts, 2);
});
test("timeout is not retried, uncertain reservation retained", async () => {
  const budget = ledger(); let used = 0;
  const a = adapter({ async run() { used++; return new Promise(() => {}); } }, budget, { timeoutMs: 100 });
  await rejectsCode(a.run(task()), "provider_timeout_unknown_charge");
  assert.equal(used, 1);
  assert.equal(budget.calls.settles[0].status, "unknown");
});
test("permanent provider error does not retry", async () => {
  const budget = ledger(); let used = 0;
  const a = adapter({ async run() { used++; throw Object.assign(new Error("server"), { status: 503 }); } }, budget);
  await rejectsCode(a.run(task()), "provider_failure_unknown_charge");
  assert.equal(used, 1); assert.equal(budget.calls.settles[0].status, "unknown");
});
test("budget settlement errors fail closed", async () => {
  const budget = ledger(); budget.settle = async () => { throw Error("ledger unavailable"); };
  await rejectsCode(adapter({ run: async () => output() }, budget).run(task()), "budget_settlement_unconfirmed");
});
test("configuration caps prevent unsafe delays, attempts and output tokens", () => {
  assert.throws(() => createGemmaExecutor({ maxAttempts: 7 }), /invalid_configuration/);
  assert.throws(() => createGemmaExecutor({ maxOutputTokens: 20000 }), /invalid_configuration/);
  assert.throws(() => createGemmaExecutor({ timeoutMs: 120000 }), /invalid_configuration/);
});
