# Signed Brain→Self-Heal dispatch — code wiring, runtime remains OFF

Repository: `dizigs/archelaos-site`. This change integrates the existing signed, single-shot outbox candidate of merged #253 into the **same canonical BrainCoordinator / central SQLite**, without another Worker, ledger, scheduler or autonomous repair mechanism.

## Private signed dispatch path

The existing Brain Worker accepts `POST /v1/selfheal/dispatch` only after its current source-scoped `github-v1` HMAC authentication with timestamp and the exact signed request body. The body must be **exactly** `{"receiptId":"<RFC4122-uuid>"}`. No caller-provided CI verdict, repair command, source code, target URL, credentials, force flag or retry option is accepted.

**Crucial:** this is a route in the existing default Brain Worker, **not a new public Cloudflare Route**. Repository `workers_dev=false` and `preview_urls=false` remain unchanged. The Cloudflare operator must independently verify zero public routes/custom domains and connect via **private native Service Bindings** only. The HMAC check is required regardless; a URL path is not by itself proof of private transport.

Other identities (operator, staging, analytics, apps_script, drive, site, gmail, news) cannot call this path. The existing source-identity and service-binding verification gates also apply. The canonical DO receives only the receipt ID; all real provider evidence, required-CI and chain-halt metadata must be read from its existing authoritative SQLite proof and control tables.

The existing `SELFHEAL_OUTBOX_SCHEMA` is added to the existing BrainCoordinator schema (single SQLite owner). Dispatch enforces the existing `BRAIN_SELFHEAL_DISPATCH_ENABLED` / recovery / binding OFF-by-default flags, approved nonzero exact SHA, 60-minute staging expiry, sealed unique `HEALER_EVENT_HMAC_KEY`, and existing `HEALER` private Service Binding. It stores an UNKNOWN one-shot barrier **before** signing or invoking the Healer; an ambiguous result is never automatically retried or presented as recovered.

The Healer still verifies its independent HMAC nonce and obtains signed CI receipts via the **named** `BrainRecoveryPort` binding. `HEALER_EVENT_HMAC_KEY` must differ from every source/operator/capability receipt principal HMAC key. Neither token values nor a GitHub provider read token are stored in source code or in this handoff.

## Current limits: do not claim operational autonomy

The Brain's `source:github` control pause is not evidence that independent GitHub Actions are halted. The current Healer records at most manual-review intent; no code edits, merges, deploys or AI execution. There is no reliable durable downstream readback/ACK reconciliation yet, and a positive RPC return must remain `UNKNOWN`.

No LIVE Cloudflare settings or secrets, routes, cron triggers, bindings, versions or staging data have been changed by this PR. Existing Guardian and Photo Worker PRs are owned separately.

## Required release evidence before ever enabling the dispatch flag

1. Exact-head unit + Miniflare/workerd tests, CodeQL, SonarCloud, GitGuardian and review approval; then code-only merge and post-merge checks.
2. Cloudflare operator checks precise source SHA **and deployed executable bytes**, approved private route/subdomain/domain inventory, DO persistence, existing Worker identity and provider provenance.
3. Provision scoped HMAC secrets and the **two native bindings** without replacing existing DOs or secrets: Brain `HEALER` → `archelaos-self-heal` default; Healer `BRAIN_RECOVERY` → `archelaos-brain-staging` named `BrainRecoveryPort`.
4. Time-bound **≤60-minute** staging activation using fail-closed gate readback. Exercise source HMAC tampering, wrong identity, exact failed required CI SHA/run/attempt and externally halted CI chain, replay/nonce, expiring receipts, unknown network outcome, single manual-review intent, rollback, no AI charges or unauthorized writes.
5. If any proof fails, disable activation and do not automatically retry an UNKNOWN state. No production self-repair without new separately reviewed authorization and independently demonstrated external halt.

**Verdict: Code path wired, all live runtime capabilities remain OFF / NOT CONNECTED.**
