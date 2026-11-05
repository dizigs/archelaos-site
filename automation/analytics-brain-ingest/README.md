# Analytics → Brain: verified private-export handoff (stacked on PR #196)

**Scope owner:** this PR exclusively owns \`automation/analytics-brain-ingest/**\` and
\`.github/workflows/analytics-brain-ingest-checks.yml\`. It does **not** modify
\`brain/**\`, \`automation/analytics-worker/**\`, the existing exporters,
site tracking, provider secrets, triggers or any production configuration.
**Status: contract only, OFF, NOT DEPLOYED, NOT CONNECTED to a live Brain.**

## Sources verified on 2026-11-05

| Existing source | Workflow | Verified run | Artifact | Result |
| --- | --- | --- | --- | --- |
| GA4 + Google Search Console | \`.github/workflows/google-analytics-aggregate.yml\` | [41995891582](https://github.com/dizigs/archelaos-site/actions/runs/41995891582) | \`google-search-ga4-private-report\` (artifact 13399354924) | Run, export, auth and upload steps SUCCESS; private artifact present |
| Microsoft Clarity | \`.github/workflows/clarity-daily-export.yml\` | [41994256131](https://github.com/dizigs/archelaos-site/actions/runs/41994256131) | \`clarity-private-aggregate-report\` (artifact 13399511832) | Run, export and upload steps SUCCESS; private artifact present |

Both reports are currently kept privately in Actions for **14 days**. This
establishes successful exports, **not** complete or nonempty metric data: private
artifact JSON has not been independently mapped against a representative real
payload. Synthetic tests use mock data and mock provenance. The original
GitHub Actions schedules remain the **only** collectors; never create an extra
cron, Clarity token, GA4 pull or visitor tracker here.

## Design and requirements

1. An *authorized private adapter* gets a GitHub run plus artifact using
   repository-scoped credentials. It independently verifies exact repository,
   workflow path/name, schedule/dispatch event, completed/successful status,
   \`main\` commit SHA, artifact ID/name/run association, expiry and time.
   It fetches the artifact ZIP through authenticated GitHub and **extracts the
   selected private JSON file**, then computes the SHA256 of those exact bytes.
   The \`trustedLookup\` port must return this **independently computed content
   hash**, not echo hash values supplied by the caller. If absent or unreachable
   the bridge fails closed. Do not log, expose or publish the ZIP or JSON.
2. \`preparePrivateExport\` matches that independently validated content digest
   and validates the actual exporter schema: GA4 \`activeUsers/sessions\`,
   GSC daily \`clicks/impressions/ctr/position\`, Clarity device summary
   \`totalSessionCount/deadClickCount/rageClickCount/scrollDepth\` where actually
   present. It delegates the closed metric allowlist, page-path privacy
   restrictions, canonical report normalization, timestamps and stable event
   generation to **PR #196** rather than reimplementing a second Worker.
3. No URLs, query strings, search phrases, user/session IDs, emails, recordings,
   campaign IDs, device breakdowns or visitor-level records are ever emitted.
   GA4 releases only daily rows with cohort proxy \`activeUsers >= 20\`.
   GSC uses \`impressions >= 20\` as a **volume threshold, not k-anonymity**:
   impressions do not equal distinct people. GSC data is restricted to
   site-level date dimension and is still subject to legal/privacy review.
   Clarity device cells with \`totalSessionCount < 20\` are excluded *before*
   forming site totals. Partial denominators and inconsistent repeated device
   values cannot be treated as zero or combined arbitrarily.
4. Clarity export describes a **rolling previous-24-hour** period and one
   \`date_utc\`, not midnight-to-midnight calendar bounds; the bridge retains
   the reporting day as a key but cannot certify calendar-day comparability.
   Do not sum consecutive Clarity snapshots or infer causality.
5. A source/day row is a **snapshot**, never an increment. The receiver must
   atomically UPSERT by source+period, dedupe on content revision and reject
   stale/out-of-order revisions. The existing #196 event ID by artifact hash
   alone cannot prevent double counting overlapping 28-day Google exports.
   \`snapshotKey\` and \`metricRevision\` make this explicit, and runtime remains
   blocked until a real durable ledger implements the requirement.
6. \`deliverToBrain\` requires a verified **authenticated private Service
   Binding**, a declared \`analytics.aggregate.v1\` capability, durable snapshot
   semantics and independent cryptographic receipt verification. A missing
   port/capability, broken receipt, timed-out API or uncertain write MUST NOT
   trigger blind retry. Reconcile with the receiver's ledger. The **merged Brain
   #111 currently does not allow sourceType=analytics** and only accepts
   PDF/image/text file metadata, so its current intake MUST NOT be used or
   mislabeled as another source. The handoff has no deployed adapter.
7. \`src/google-ads.mjs\` defines a **disabled** account-wide daily read-only
   Ads reporting shape (impressions, clicks, cost micros, conversions). It
   contains no ads API transport, no Ads secret, and no Ad Grants activation.
   Requires real verified Google Ads availability and new Brain+Worker schema
   before enabling. Ads costs do **not** authorize AI spending.
8. Cloudflare Web Analytics is **SOURCE_PENDING**: actual account/site/read
   permission and accessible reporting API/binding must be verified separately.
   Never substitute generic Cloudflare zone visits for Web Analytics by guess.
9. No new AI calls. The shared €20/month AI ledger remains Brain-owned.
   GDPR/consent remains governed by the existing site behavior and real
   provider contracts; validation cannot certify consent retroactively.

## Run offline tests

\`\`\`sh
cd automation/analytics-brain-ingest
npm run check
\`\`\`

No npm packages, secrets, network calls or provider charges are needed.
Tests cover authenticating **mock** readback provenance, exact payload SHA,
API 403, unexpected/missing data, GSC/GA4/Clarity low volume, duplicates,
PII, schema mismatch, disabled Google Ads, Brain missing capability, forged
ack and delivery timeout. These tests establish code behavior, not live E2E.

## Before enabling (BLOCKED)

- [ ] Read one *real* private artifact with approved credentials, verify
  extraction and parse semantics without putting metrics in PR logs.
- [ ] Independently implement and test the provider-backed \`trustedLookup\`
  port. This package deliberately does not embed GitHub secrets or fetch.
- [ ] Brain owner adds an actual private authenticated \`analytics.aggregate.v1\`
  service method and atomic snapshot ledger; contract and receipt signing.
  **Never** post reports to the current \`/v1/events\` generic intake.
- [ ] Brain receipt readback, replay/concurrency/rollback, source pause and
  alerting at exact revision; CI, reviewer and consent approval.
- [ ] Evaluate Cloudflare Web Analytics read-only capability and authorized
  Google Ads reporting separately. No production deploy until proven.

**Branch relationship:** This is a *stacked draft PR* based on
\`chatgpt/brain-analytics-contract-20261105\` (#196). Only the two newly
owned scopes are changed. After #196 is reviewed/merged, rebase or retarget
this PR to updated \`main\` with verified CI; do not bypass reviews.
