# Build B — Cloudflare Gemma provider (isolated)

An independent, **disabled-by-default**, dependency-free proposal adapter for the Build B lane.
Only this directory is owned by this change. It neither imports nor edits PR #209 or #111.
It does not invoke GitHub APIs, write repository files, run shell commands, create Workers, merge, or deploy.

## Selection and activation

Selected provider: Cloudflare Workers AI. Verified model ID: @cf/google/gemma-4-26b-a4b-it.
As of 2026-11-05, a read-only model-search and model-schema query on the connected
admin@archelaos.club Cloudflare account succeeded. No inference was performed.
These checks establish catalog visibility, **not** deployed AI binding, production
access policy, or spending authorization.

The factory createGemmaExecutor({ api: env.AI, budget, enabled, inventoryVerified })
will remain inert unless both enabled and inventoryVerified are explicitly true.
Call its run({ eventId, commitSha, approved, prompt, paths }) method only after the
central Brain has authenticated the event, verified the approved path scope,
reserved a common budget and assigned a permitted Build B intent. No dispatcher is
wired in this PR.

The budget object MUST be a trusted server-side, atomic ledger providing
reserve({ eventId, modelId, currency, amountUsd, attempts, maxChargeUsd }) and
settle({ reservationId, eventId, status, chargedUpperBoundUsd, attemptsUsed }).
Reservation receipts must be approved, unexpired, model/event-bound, USD-denominated,
and fully cover all potential attempts. A receipt issued by an untrusted caller
is not authorization. The central Brain must enforce its 20 EUR monthly cap,
currency conversion, per-account/global concurrent spending and idempotency;
the adapter adds a firm $0.005 maximum reservation per execution.
On timeouts or other uncertain outcomes it instructs the ledger to retain
unknown reservations. The ledger MUST never auto-refund unknown charges.

## Behavior

- Up to 12,000 UTF-8 prompt bytes, 8 specific allowed paths, 1,024 output tokens.
- Max 2 attempts; retry only explicit capacity-rejection HTTP 429 / code 3040.
- 15-second default timeout (configurable 100 ms to 30 s); timed-out
  inference is considered potentially billable and is **not retried**.
- Strict JSON schema requested from the provider AND verified locally.
  Output consists solely of reviewable proposed replacements and test suggestions.
- No implicit credentials, REST client, logging of prompts, writes or charges.
- Account inventory/AI binding is a prerequisite to enabling it.

## Offline tests

Run from the repository root:

    node --test automation/brain-worker-executors/providers/gemma/index.test.mjs

Mock AI and budget stubs only. They do not contact Cloudflare or incur charges.
See MODEL_INVENTORY.md for verified pricing, rate limits and blockers.
