# Antigravity managed-agent pilot — SOURCE ONLY / NO-GO for live API

**Purpose:** a strictly review-only pilot for the public Brain ↔ Self-Heal HMAC mismatch / fail-closed UNKNOWN issue (#268). Only this folder is owned by this proposal. Does **not** alter canonical Brain, Workers, GitHub workflows, Gemini adapters, deployed secrets, cron, CI, or live state.

## Google sources and billing
- Official managed agent: https://ai.google.dev/gemini-api/docs/antigravity-agent
- Gemini API billing: https://ai.google.dev/gemini-api/docs/billing/
- Antigravity IDE plans: https://antigravity.google/docs/plans

The managed Antigravity agent is exposed through the **Gemini API Interactions API**, with `antigravity-preview-09-2026`, not a desktop app requirement. **Google AI Pro baseline quota is NOT automatically an API credit.** The Gemini API can offer eligible projects a free-tier quota or charge separately under its own billing account. Promotional Google Cloud/API credits must be independently verified as applicable. User permission to consume **existing benefits** is not permission for a charge to a card or unverified paid-tier billing.

Google's `agent_config.max_total_tokens` is best-effort, **not** a strict spending cap, especially for long agentic tool loops.

## What is implemented
- Disabled-by-default REST review adapter with `background:true`, `store:true`, one-shot POST and authenticated GET polling; **no production caller imports or enables it**.
- Five allowlisted public source paths from the Brain ↔ Self-Heal acceptance work, exact 40-hex SHA, 90,000-character total limit.
- Independently required trusted Brain operator approval, **verified free API quota or eligible promotional API credits**, and a **durable budget reservation + receipt settlement** before any network call. An untrusted JSON grant must never be accepted by a future integration.
- One billable background creation POST only, with a separately persisted interaction ID and trusted GET polling. No duplicate POST, no automatic continuation, REST `steps[].content[].text` parsing and best-effort 60,000-token cap, NOT a guaranteed euro cap.
- No GitHub token, HMAC material, Google credential value, private Drive content, children's data or account records may be transmitted. The regex is a defense-in-depth heuristic, **not** a secret-scanning proof.
- No PR authoring, code patches, merge, production mutation, autonomous repair or deployment from the agent.

## Mock tests

```sh
node --check automation/antigravity-agent-pilot/adapter.mjs
node --test automation/antigravity-agent-pilot/adapter.test.mjs
```

Updated tests use synthetic credentials and simulated Google responses, with no external API call or costs. They cover v09 background request, no egress by default, exact SHA/path checks, budget gate, no duplicate POST on transport uncertainty, authenticated GET polling, REST steps and durable receipt failures. They do **not** establish live entitlement or model quality.

## Mandatory next gates — no live call without them

1. Verify the actual Google AI Studio **project and billing tier** as well as the eligible Gemini API free quota/promotional credit for this specific agent; no key values shared in issue/PR.
2. Review the public test/docs content to ensure no accidental credentials or nonpublic incident material is transmitted and assess Google data privacy terms.
3. Use a trusted authenticated Brain component to enforce the shared **€20/month AI limit** with atomic reservations, provider receipts and UNKNOWN-safe settlement.
4. Independently inspect exact deployed Worker SHA and service permissions if integration is ever proposed; separate ownership/CI/security review.
5. Authorize at most one test only while **verified benefits** cover it, obtain source-bound usage and billing receipts and evaluate whether the review was worthwhile.

**Status 2026-11-06:** Source-only adapter remains DISABLED / NOT CONNECTED / NOT DEPLOYED. A separate one-time GitHub Actions request used the repo-scoped Gemini API secret without exposing its value. It reached Google's API but returned INCOMPLETE, not a review. Further paid calls NO-GO pending cost reconciliation and a better hard-stop strategy. No merge or deployment.

## 2026-11-06 one-time live experiment (stopped)

Operator approved spending a small amount from existing Google API benefits/credits. A temporary push-only GitHub Actions file was used once to call official Interactions API `antigravity-preview-09-2026` on a bounded set of PUBLIC Brain ↔ Self-Heal files with `agent_config.max_total_tokens=20000`, `tools: []`, single request, no retries, and no writes. Actual run: https://github.com/dizigs/archelaos-site/actions/runs/42288322936 . HTTP 200; provider status `incomplete`; reported `usage.total_tokens=85559` (this total can include cached tokens, which are EXCLUDED from max_total_tokens; cached/noncached breakdown was not logged, so cap overshoot is UNPROVEN); **no final review output**. Exact billing amount and which credit bucket was charged were not verified. Because the request returned no completed deliverable and cost details were unknown, the temporary workflow was REMOVED from the branch (commit 2ef1716f28096caca1ef457dcb1bc2eec75f1fbc) and no further provider calls authorized. The first workflow parse failure had zero jobs; the corrected attempt is the sole actual Google request.

**Safety finding:** Do NOT rely on `max_total_tokens` as a guaranteed euro cap. Do not enable this adapter or any automatic retries. First read billing usage, design a realistic independent spending guard/cancellation and stage test with approved ledger, and independently inspect the agent's output/step accounting before considering another trial. The run logs reveal no API key values. A valid HTTP response with `incomplete` is NOT a completed AI review.


## 2026-11-06 — Configuration audit and offline-only repair

Official references:
- https://ai.google.dev/gemini-api/docs/background-execution (background create, GET polling, cancellation)
- https://ai.google.dev/gemini-api/docs/antigravity-agent (current v09 model, source mounts, budget settings)
- https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026 (REST steps schema versus SDK convenience output_text)

**Diagnosed settings problems:**
1. Both earlier GitHub Action experiments used synchronous HTTP POST instead of background creation. The v09 attempt hit Node UND_ERR_HEADERS_TIMEOUT after approximately five minutes, before any headers or interaction ID.
2. The source-only pilot used SDK-like output_text against raw REST, which may discard final text in steps[].content.
3. The source-only pilot had a stale v05 agent version and a path available in a different PR rather than the current main.
4. The first 20,000-token run ended incomplete; reported total_tokens included an unknown cached-token share which does not count toward max_total_tokens. No hard token overrun is proven.

**Repair:** v09 agent, background:true, store:true, public inline file mounts, one POST with no automatic retry, durable interaction ID receipt, separate GET-only readback, and steps/model_output text extraction. A timed-out POST may have started an unobserved billable Google interaction, so **never retry create automatically**.

**Status:** SOURCE-ONLY, disabled by default, no new billable requests, no Cloudflare/Brain bindings, no workflows, no merge or deployment. Unit tests are mock-only. The approved EUR 5 test ceiling is an operator budget objective, not a provider-guaranteed hard cap. Before a further paid call the trusted Brain must verify pricing, billable credit balance, EUR FX and atomic reservations, support cancellation and reconcile unknown outcomes.
