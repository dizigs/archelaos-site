# ARCHELAOS Brain → OpenAI managed Codex — source-only staging bridge

**Status (07/11/2026): PREPARED, DISABLED, NOT CONNECTED.** This is a
dedicated, isolated integration preview. It does not create a Worker,
GitHub token, OpenAI project, API key, CI schedule, managed session,
credential grant, live deployment, or external AI call.

## Why this approach

The official OpenAI **Agents API** provides a managed Codex agent harness
programmatically: `POST /v1/agents/sessions`. This is **not** the private
ChatGPT Codex Cloud backend, not a free use of ChatGPT Plus credits, and
not an implied ability for a ChatGPT chat to launch an existing Codex
Cloud environment. It is a billable OpenAI Platform API.

Official documentation:
- https://developers.openai.com/api/docs/guides/agents-api/overview
- https://developers.openai.com/api/docs/guides/agents-api/quickstart
- https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/methods/create
- https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted
- https://developers.openai.com/api/docs/guides/agents-api/observability
- https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks
- https://developers.openai.com/api/docs/guides/api-keys

## Architecture and existing ownership

```text
ChatGPT / GitHub handoff (NOT automatically a verified event)
        ↓ future authenticated ingestion, never bare issue text
Existing Brain DO: reviewed signed task → durable CLAIMED
       exact SHA + allowed paths + operator approval
       ONE global €20/month AI reservation
        ↓ future trusted service-binding/HMAC readback (not connected)
Adapter: separate approved BEGIN receipt → ONE request
        ↓ POST /v1/agents/sessions, spend_control.limit (USD cents)
OpenAI managed Codex: isolated small sandbox, NO network access
       no repo checkout, no GitHub credentials, no tools
        ↓ session ID + status (NOT proof a turn succeeded)
Existing Brain durable settlement and provider readback
        ↓ future approved artifact/review handoff
Human and independent tests → PR review only, never auto-merge
```

The **only existing Brain** remains `brain/src/worker.mjs` /
`BrainCoordinator`. The existing authority described in
`brain/docs/EXECUTION_AUTHORITY_20261105.md` must handle approvals,
leases, dedupe, reservations, and reconciliation. Do not introduce
another coordinator or a second €20 ledger. Do not change PR #273,
#280, #282, #283 or their files from this adapter PR.

## Source currently provided

- `policy.mjs`: bounded task schema, exact repo and immutable Git SHA,
  path restrictions, public-safe excerpt and allowed task classes
  `REVIEW` and `TEST_PLAN`; validates expected independent Brain
  signed/read-back authorization shape; constructs the documented
  Agents API session request with `review:none`, no tools, no subagents,
  sandbox `network.access=disabled`, `container_size=small`, and
  **non-optional `spend_control.limit`**.
- `transport.mjs`: unmounted one-attempt provider transport. Defaults
  to OFF; requires independently verified Brain claim, durable BEGIN,
  small per-session cap, API key, and a durable ACK callback. Returns
  UNKNOWN without retrying if the provider outcome or settlement is
  uncertain. Never prints provider error body or API key.
- `adapter.test.mjs`: all calls use synthetic test data and a mocked
  fetch. There is **no** external OpenAI or GitHub traffic.

The `BRAIN_SIGNED_READBACK` marker is a **contract expectation**,
not a cryptographic verifier. The production verifier MUST be an
independent trusted service-binding call that verifies the actual
Brain-signed receipt; it must not pass through arbitrary caller JSON.
No production code imports or deploys this transport today.

**Privacy:** the initial design intentionally has no repo checkout.
Only an explicitly approved *public-safe* excerpt can become input.
Input validation rejects common secret patterns but is not a DLP
system. Never supply personal data of athletes, private documents,
unreviewed security logs, private GitHub credentials or emails.
The Agents API currently offers US data residency and no ZDR;
confirm legal, rights and GDPR review before any sensitive material.

## Cost controls

1. The **existing Brain central €20/month budget** must reserve the
   predicted worst-case amount **before** an external attempt.
2. The provider session request also includes `spend_control.limit`
   in USD cents (MVP contract only accepts 1–100 cents per task).
   This is an additional provider-level safeguard, not proof of
   entire-account monthly limit or immediate settled actual charges.
3. Stop if FX, prices, available OpenAI project balance, unknown
   usage, outstanding spend, or accounting are unverified. Unknown
   outcomes stay locked and charged conservatively until reconciled.
4. Protect the OpenAI project separately with organization/project
   spend controls and notifications; Plus/Pro subscription limits
   are not Platform API budget controls.
5. Start with one owner-approved small staging task and inspect
   actual tokens, sandbox usage, final invoice/provisional usage
   and independent signed readback before raising traffic.

The model `gpt-6-astra` follows the current official Agents API
examples. **Entitlement and actual pricing are NOT confirmed** for
this account; a model-level readiness check must run first.

## Account setup required before any real task

- Use a dedicated OpenAI Platform project (prefer an Archelaos
  service account over a personal user key). Grant minimum
  `api.agents.read`, `api.agents.write`, `api.responses.write`
  required by the official API. Do not create an unrestricted key.
- Store the key only as a server-side secret in a future authorized
  staging executor; **never** place it in this repository, logs,
  public docs, prompts, PR checks, or the Codex sandbox.
- Independently review price, spend caps, provider project access,
  GDPR/data residency and webhook signature requirements.
- Wire the adapter only to the **already approved** Brain execution
  authority after the Brain ↔ Self-Heal P0 acceptance and signed
  receipt proof. The initial transport has no public endpoint.
- Connect a signed OpenAI webhook or read-only session polling for
  final-turn results. An `idle` session or successfully created
  session is NOT a passing test or a finished code change. No auto
  retries after unknown provider errors, and do not trust bot comments
  as authenticated approvals.
- Add approved read-only repository access inside the sandbox only
  in a later, separately reviewed PR; never grant GitHub write or
  automatic merge/deploy rights by default.

## Offline checks

From the repository root, using **only Node 22+**:

```sh
node --check automation/brain-codex-agents-api/policy.mjs
node --check automation/brain-codex-agents-api/transport.mjs
node --test automation/brain-codex-agents-api/*.test.mjs
```

All these tests are synthetic and incur no OpenAI token or Cloudflare
Worker bill. A green CI result proves source validity only.

## Completion proof and reconciliation

Track stages separately: `SOURCE_READY` (this draft),
`CI_PASS` (exact head), `API_CREDENTIAL_VERIFIED` (authorized account
read test), `BRAIN_CLAIM_VERIFIED`, `STAGING_SUBMITTED` (real session
ID), `STAGING_TURN_COMPLETED` (actual saved items), and
`AUTHENTICATED_SETTLED` (signed readback + real cost).

Canonical tracking goes into the already existing private LIVE Sheet
LOG and tools/access Google Doc; do not create a parallel journal.
Preserve the actual session ID and provider evidence in private logs
only. For this PR, do NOT create a second scheduled agent.
