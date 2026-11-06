# Antigravity managed-agent pilot — SOURCE ONLY / NO-GO for live API

**Purpose:** a strictly review-only pilot for the public Brain ↔ Self-Heal HMAC mismatch / fail-closed UNKNOWN issue (#268). Only this folder is owned by this proposal. Does **not** alter canonical Brain, Workers, GitHub workflows, Gemini adapters, deployed secrets, cron, CI, or live state.

## Google sources and billing
- Official managed agent: https://ai.google.dev/gemini-api/docs/antigravity-agent
- Gemini API billing: https://ai.google.dev/gemini-api/docs/billing/
- Antigravity IDE plans: https://antigravity.google/docs/plans

The managed Antigravity agent is exposed through the **Gemini API Interactions API**, with `antigravity-preview-05-2026`, not a desktop app requirement. **Google AI Pro baseline quota is NOT automatically an API credit.** The Gemini API can offer eligible projects a free-tier quota or charge separately under its own billing account. Promotional Google Cloud/API credits must be independently verified as applicable. User permission to consume **existing benefits** is not permission for a charge to a card or unverified paid-tier billing.

Google's `agent_config.max_total_tokens` is best-effort, **not** a strict spending cap, especially for long agentic tool loops.

## What is implemented
- Disabled-by-default pure review-request builder and optional REST client; **no code imports it or enables it**.
- Only 3 allowlisted public source paths from the Brain ↔ Self-Heal acceptance work, exact 40-hex SHA, 20,000-character total limit.
- Independently required trusted Brain operator approval, **verified free API quota or eligible promotional API credits**, and a **durable budget reservation + receipt settlement** before any network call. An untrusted JSON grant must never be accepted by a future integration.
- One request only, fixed Google endpoint, explicit token cap, no retries, no continuation, response treated as untrusted human-review advice.
- No GitHub token, HMAC material, Google credential value, private Drive content, children's data or account records may be transmitted. The regex is a defense-in-depth heuristic, **not** a secret-scanning proof.
- No PR authoring, code patches, merge, production mutation, autonomous repair or deployment from the agent.

## Mock tests

```sh
node --check automation/antigravity-agent-pilot/adapter.mjs
node --test automation/antigravity-agent-pilot/adapter.test.mjs
```

Tests use synthetic credentials and simulated Google responses, with no external API call or costs. They cover no-egress defaults, separate Pro/API billing semantics, allowlist/SHA, budget, provider failures, and receipt uncertainty. They do **not** establish Google API entitlement or real agent quality.

## Mandatory next gates — no live call without them

1. Verify the actual Google AI Studio **project and billing tier** as well as the eligible Gemini API free quota/promotional credit for this specific agent; no key values shared in issue/PR.
2. Review the public test/docs content to ensure no accidental credentials or nonpublic incident material is transmitted and assess Google data privacy terms.
3. Use a trusted authenticated Brain component to enforce the shared **€20/month AI limit** with atomic reservations, provider receipts and UNKNOWN-safe settlement.
4. Independently inspect exact deployed Worker SHA and service permissions if integration is ever proposed; separate ownership/CI/security review.
5. Authorize at most one test only while **verified benefits** cover it, obtain source-bound usage and billing receipts and evaluate whether the review was worthwhile.

**Status 2026-11-06:** Offline source preparation only. **NO-GO** for live calls. No verified project entitlement, no live Google API call, no charged credits, no merge, and no deployment.
