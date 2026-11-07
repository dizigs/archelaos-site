# ARCHELAOS — Canonical Brain × Antigravity: hybrid execution plan
Status: DESIGN ONLY — NO LIVE INTEGRATION. Date: 2026-11-06.
Related: Draft PR #270, Brain issues #71/#108, HMAC/ACK PR #268.

## Verified status
- Canonical Brain has Durable Object/SQLite receipts, task intents, execution-authority and budget modules. Current brain/src/ai_gateway.mjs accepts synthetic test doubles only; no live provider integration.
- Existing Antigravity pilot in PR #270 remains disabled/source-only, not merged or deployed.
- GitHub run 42298692225 actually completed one chained Google interaction and produced a review report; it did NOT test/repair live Cloudflare HMAC service binding. Provider usage reported 1,753,012 gross tokens for that continuation; actual EUR billing remains unverified.
- No new billable calls, production secrets, live scheduling, merge or deployment are authorized by this planning document.

## Execution modes: different technology and cost profiles

| Mode | Agent runtime | Model inference | Appropriate use |
|---|---|---|---|
| GOOGLE_MANAGED_REMOTE | Google-hosted managed Antigravity sandbox using Gemini Interactions REST | Cloud Gemini API, billed per provider terms | Rare complex, long-running source investigation, isolated multi-file security review |
| LOCAL_SDK_CLOUD_MODEL | Google Antigravity Python SDK and tools execute on an approved local machine/runner | Remote Gemini API / Vertex; still potentially billed | File-based engineering and offline code tests against disposable workspace; local source stays controlled except model context transmitted to provider |
| LOCAL_SDK_LOCAL_MODEL | Google Antigravity SDK plus LiteRT local checkpoint or OpenAI-compatible local server (Ollama/LM Studio/vLLM) | On-device/local inference, API key not required for compatible model | Low-cost repeated inspection, classification, bounded offline code tasks, local/private workloads under approved controls |

Local runtime is not the same thing as local inference. The Interactions API environment=remote is Google cloud, not a request to execute on our own PC. A GitHub-hosted Actions runner is also a cloud machine, not the operator's computer. Local runners must be online for remote orchestration.

Official documentation:
- https://antigravity.google/docs/sdk/overview/
- https://antigravity.google/docs/sdk/local-models/
- https://antigravity.google/docs/sdk/policies/
- https://ai.google.dev/gemini-api/docs/antigravity-agent
- https://ai.google.dev/gemini-api/docs/background-execution

Local requirements are NOT yet checked: Windows or WSL2 support for the installed binary, host CPU/RAM/GPU, local runner availability, filesystem and network sandbox. Google suggests roughly 24 GB VRAM/unified memory for LiteRT Gemma 4 26B A4B. We can start smaller using compatible Ollama models; capability/quality must be measured, not assumed.

## Brain design: authority stays central

Flow: authenticated source event -> canonical Brain receipt and dedupe -> triage -> choose local/cloud executor -> budget and permissions gate -> task execution -> collect structured provenance and artifacts -> independent verification -> Draft PR/private review -> separate release approval.

The Brain alone decides scope, provider, privacy class, approved model, budget, retry/continuation and authorization. Antigravity is a scoped investigator/executor, not the authority to release or write to production.

Routing:
1. Routine sports news, Hall of Fame discovery, duplicate checks: existing discovery/classifier/writing pipelines, not Antigravity.
2. Repeated failures in HMAC, durable ACK, multi-Worker integration, security regressions: static tests first, then local SDK engineering or Google-managed deep investigation when justified.
3. Private Drive documents, identities, minors, photos, credentials: prevent egress to managed providers unless separately authorized with data/provenance/consent policy. Local model still needs GDPR and access reviews.
4. Local machine offline or hardware inadequate: mark UNAVAILABLE and request explicit cloud alternative; never silently switch to a paid provider.

## Canonical task and provider adapter contract — future work
Task record fields: immutable task ID, source-event digest, exact repository SHA, allowlisted paths, privacy class, expected artifacts, executor mode, model/version, operator grant, budget reservation, start time, expiry, idempotency key, evidence digest and source citations.

Provider attempt fields: attempt ID, PREPARED/CLAIMED flag, create_started_at, interaction ID, environment ID, poll state, continuation parent ID, total input/cached/output tokens, actual provider invoice/credit status, cancellation outcome and immutable audit receipt.

Status flow:
PROPOSED -> TRIAGED -> PENDING_APPROVAL -> RESERVED -> CLAIMED -> RUNNING -> COMPLETED / INCOMPLETE / FAILED / CANCELLED / UNKNOWN -> EVIDENCE_REVIEW -> ACCEPTED_FOR_DRAFT / REJECTED / NEEDS_MORE_EVIDENCE.

Absolute rules:
- Atomic durable authorization before any billable POST. If creating the interaction times out and no ID is returned, UNKNOWN_CREATE and NO automated retry.
- If an ID exists, persist it immediately; safe GET polling may retry. Continue an INCOMPLETE task only when terminal, with previous_interaction_id + environment_id and a newly reserved, explicitly authorized continuation. No unbounded agent loop.
- max_total_tokens and gross token counters are NOT hard EUR spending caps. Apply verified price/FX, reservations and provider usage settlement. Keep standard shared EUR20/month AI policy unless the operator explicitly records a time- and amount-limited override. Promotional credit coverage must be verified, not assumed.
- On timeout, request server-side cancellation and verify via readback; cancellation failure means UNKNOWN, not a claim of stopped billing.
- All returned advice, patches and reviews are UNTRUSTED. No automatic merge, live Worker deployment, secret changes, production Self-Heal enablement, or writes to main.
- Local SDK gets a disposable, tightly scoped workspace with synthetic keys, restricted shell/network policies, and no home directory, browser profile, production credentials or private Shared Drive mount. Avoid allow_all policy.
- Observability/Control Center must distinguish SOURCE_READY, TEST_PASS, PROVIDER_COMPLETED, DRAFT_REVIEW, and DEPLOYED; one status cannot substitute for another.

## Implementation milestones

P0 — Document only (this PR):
- Record 3 execution modes and routing policy.
- Reconcile actual Google cost of run 42298692225; preserve existing €20 monthly guard as default.
- Capture intended local machine hardware/OS, online availability, permissible data classes.
- Update private tools/API registry as CLOUD_TESTED; LOCAL_SDK_PLANNED_UNVERIFIED; LOCAL_MODEL_PLANNED_UNVERIFIED.

P1 — Local offline feasibility test (new isolated Draft PR):
- Install official google-antigravity package in a disposable Python 3.10+ environment, verify platform-specific binary.
- Run synthetic, read-only tests against a copy of public brain code. Verify permitted/denied filesystem and terminal tool calls.
- Evaluate Ollama/LM Studio or LiteRT model feasibility against real hardware, compare performance/quality and zero-cloud-egress evidence.
- Do not infer support for Windows/WSL2 until actual local test evidence exists.

P2 — Provider-neutral Brain orchestration (separate branch/owner):
- Add provider port create, poll, cancel, continue, collect, settle, each with provenance and immutable receipts.
- Integrate with brain/src/task_intents.mjs, exec_authority.mjs, ai_gateway.mjs and budget.mjs without weakening synthetic-only boundary before acceptance.
- Test crash before create, crash after create, missing interaction ID, duplicate event, key mismatch, offline local host, provider rate limit and reconciliation.

P3 — Secure connectivity and staging:
- Signed pull-based local worker relay with mutual authenticated handoff, source SHA, TTL, replay rejection and no public local admin endpoint.
- Managed REST gateway from a private authorized executor. Test no duplicate billable creation and safe continuation/cancellation.
- Independent security and cost acceptance, exact deployed Worker SHA checks and an operator-visible Control Center proof record.

P4 — Release decision:
- One operator-approved staging task through the whole flow with real receipts and independent tests.
- Return Draft PR and evidence, never production changes without a distinct release approval.

## Recommended architecture
Use a HYBRID system. The Brain stays the central Cloudflare coordinator and ledger; local Gemma/Ollama serves inexpensive bounded tasks, the local Antigravity SDK can run real code/test workflows in a disposable clone, and Google Managed Antigravity is the escalation tier for rare deep investigation. Choose the backend per task with explicit cost, privacy, provenance and authorization policy.

Definition of done for initial acceptance: a synthetic Brain task traverses authenticated durable queue -> selected mocked local/cloud executor -> immutable artifact and usage receipt -> private review, without duplicate calls, unauthorized remote writes or exposed secrets.
