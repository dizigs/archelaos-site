# Brain security, monitoring & cost controls (isolated draft)

Owner scope: **only** \`automation/brain-security/**\`. This package has no Worker route, no new schedule, no provider API calls and no Cloudflare resource creation. Integration with the single live Brain must be reviewed after the Brain / Builder / Testing PR owners publish their stable contracts.

## Existing main verified by code inspection

- \`brain/src/contract.mjs\`: HMAC signed staging requests and bounded request parsing.
- \`brain/src/worker.mjs\`: SQLite Durable Object jobs, audit, source-level rate limits, controls, internal diagnostics.
- \`brain/src/budget.mjs\`: atomic reservation/claim/settlement, €20 monthly cap (20,000,000 micro-EUR), single-delivery 75% and 90% alert records, separate OpenAI conservative cap.
- \`brain/src/ai_gateway.mjs\`: no live paid provider transport; test double only, fail-closed.

**Do not create a second ledger.** \`createBrainLedgerAdapter\` wraps the *same* BrainCoordinator Durable Object storage and budget tables. It does not support Gemini/Gemma until the canonical ledger explicitly validates provider pricing and adjusts its provider contract in the Brain owner's scope. An adapter created against another DO instance must not be used for global budget admission.

## Interfaces and safe operation

1. \`verifySignedTask(request, exactRawBody, keyring, nonceStore)\`: HMAC-SHA256 over method, path+query, timestamp, nonce, and exact UTF-8 body. Rejects >5m clock drift, missing scope, replay and unsigned content. \`keyring.resolve\` is an injected secret reader; **never log credentials**. Atomic nonce store is mandatory. Role capability \`ai.invoke\` is explicit.
2. \`admitTask(context, ports, policy)\`: disabled by default. Requires \`{enabled:true,coverageConfirmed:true,mode:'guarded',monthlyMicroEur:20000000}\`, healthy control state, durable rate and breaker, canonical ledger reservation and delivered once-per-month alerts. No external provider is invoked.
3. \`claimAuthorizedCall\`: re-reads kill switches before the one-time ledger claim. Calling an AI provider requires an authorized claim and a separately reviewed adapter. Never claim and retry an ambiguous provider outcome.
4. \`settleVerifiedCall\` settles only with verified usage evidence; \`recordFailedCall\` opens breaker / retains reservation until reconciliation. Never automatically release a possibly charged reservation.
5. \`createMonitor\` records only fixed telemetry fields: allowlisted status/code, UUID/hex correlation and receipt IDs, attempt, latency. It rejects arbitrary payloads and never serializes headers, input documents, prompts or exception messages.
6. \`createSqlSecurityStore\` should receive the Brain's **one** Durable Object storage, for atomic anti-replay, minute/day rate windows and half-open single-probe circuit breakers. This adds three isolated SQL tables on first construction; it does not run until integrated.

**Fail-closed integration requirements:** pass HMAC identity from configured secret binding, not user-controlled JSON; route only authenticated internal traffic; use one global Durable Object for all builder admissions and the ledger; make read/write failures deny calls; keep alert delivery idempotent and durable; protect against external task payloads smuggling unsigned changes; require a single canonical cost and verified FX evidence. No auto-merge, deploy, new bindings or resources are part of this PR.

Tests: \`node --test automation/brain-security/*.test.mjs\` (no dependencies).

### Cloudflare Workers Paid (documentation only)

Official docs (checked 2026-11-05): 10M Worker requests/month and 30M CPU ms/month included on Standard, with metered overages; Durable Objects and Queues also have metered tiers. Paid limits expand cron triggers, CPU ceiling and bindings, **not** free unlimited execution. Do not enable any additional paid product or exceed existing invocations based on this module. Sources:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/limits/

### Outstanding gates

- Brain owner must explicitly approve the **single-ledger** integration and route all provider consumers through its same durable coordinator.
- Reconcile Gemini/Gemma provider pricing, account permissions and budget scope; fail closed until verified.
- Verify replay, HMAC and real billing/alert sink against a staging-only binding before enabling any provider.
- Run canonical CI on the exact PR SHA; no staging/live or production claim from mock tests.
