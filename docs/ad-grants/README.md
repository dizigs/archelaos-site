# Google Ad Grants — dry-run preparation

Status on **3 November 2026 (Europe/Athens): PREPARATION ONLY**.
No campaign, budget, external service, Ads script schedule, tag or conversion
action is created or enabled. Nothing in this package can publish Issues or
change Google Ads. The independent branch starts at main `74b6bcb`.

## Run the complete package

```sh
bash rebuild/ads/run_dry_run.sh --fixture
```

This single command validates Ads evidence and the existing GA4/Search Console
export together, builds/syntax-checks the candidate Ads Script, runs the Python
Issue planner on the validated report and writes a final handoff. No dependency
installation, network request, credential or administrative approval is needed
for this synthetic rehearsal. Output is ignored under
`rebuild/test-artifacts/ad-grants/handoff/`:

- `audit-report.json`: sanitized finding codes/counts with account-local `as_of`.
- `issue-plan.json`: hypothetical creates/reopens or already-open matches.
- `status.json`: `DRY_RUN_COMPLETE` only after every stage succeeds; always
  `ready_for_live_ads: false`, explicit provenance and outstanding live blockers.

The fixture clock is synthetic and clearly labelled. For a real-evidence dry-run,
omit `--fixture` and use these existing fixed input slots, without committing them:

| Slot under `rebuild/test-artifacts/ad-grants/` | Required source |
| --- | --- |
| `audit-report.json` | Fresh sanitized JSON from the latest candidate Google Ads Script; `source_kind: google-ads-readonly` and `as_of` required |
| `google-analytics-aggregate.json` | Existing GA4/GSC export JSON, unchanged schema, no fixture clock |
| `existing-issues.json` | Complete all-state GitHub Issue inventory, following the existing pagination contract |

The runner rejects a synthetic report in real mode, stale/malformed evidence,
fixture clocks in real input and importable/budgeted campaigns. It resets the
status to `INCOMPLETE` before validation; missing real inputs cannot retain a
previous successful fixture status. A failed later stage leaves the handoff
uncompleted. It does not manufacture inputs or retrieve private reports.

`DRY_RUN_COMPLETE` means the **offline preparation pipeline** completed, not that
Google approved ads, a real account was tested, or production conversions work.
The source label is not independent proof of account access. Reusing the already
existing daily consumer after #67 is ready remains the integration route; no
second schedule has been added.

## Start here

1. P0 [#66](https://github.com/dizigs/archelaos-site/issues/66) stays first.
   [#68](https://github.com/dizigs/archelaos-site/pull/68) fixes one verified Git
   command-option boundary. Its PR checks pass, including Sonar; **main Sonar is
   still C/failing**. The other findings and main A verification remain open.
2. Read [POLICY_REVIEW.md](POLICY_REVIEW.md). Official Google policy access was
   blocked by the session proxy; thresholds are provisional review indicators,
   not a current compliance certification.
3. Run the offline commands below. Follow [EXECUTION_LOG.md](EXECUTION_LOG.md)
   for actual evidence, limits and the eventual PR/commit handoff.

## Package

| File | Purpose |
| --- | --- |
| `rebuild/ads/campaigns.draft.json` | Two non-importable Greek Search campaign plans; no budget values |
| `rebuild/ads/ad_grants_core.js` | Pure audit, consent/receipt contract and aggregate-report adapter |
| `rebuild/ads/google_ads_audit.js` | Read-only candidate Google Ads Scripts collector; never run here against Google |
| `rebuild/ads/build_preview.cjs` | Concatenates the two JS files into an ignored local preview bundle |
| `.github/scripts/ad_grants_issue_plan.py` | Bounded, public-safe, idempotent Issue planning; no HTTP/write path |
| `.github/workflows/ad-grants-dry-run.yml` | Offline PR/manual checks, read-only token, no cron or secrets |

## Campaign drafts

- **Αθλητικά τμήματα και ακαδημίες Κατερίνης:** sports and academy-interest
  groups, landing at `tmimata.html` / `contact.html`. Two RSA drafts per group,
  two sitelinks, phrase-keyword candidates and local presence intent. Current
  programmes, ages, schedules, geo target IDs and availability must be verified
  before activation; no availability or price is invented.
- **Ψηφιακό Μουσείο και ιστορία Αρχέλαου:** museum and history/people groups,
  landing at `index.html` / `history.html`, with two RSA drafts per group and
  history/Hall sitelinks. The primary conversion is deliberately unset until a
  real museum outcome exists. Reading a biography is not an invented lead.

These are editorial JSON plans, not Ads API import payloads. RSA copy-length and
structure checks pass offline; Google approval/landing availability do not
follow from those tests. All four live landing GETs returned HTTP 403 locally;
their origin/proxy/WAF cause is undetermined because that probe retained no
response headers. The separate bare-domain HEAD returned a real 301 to the
`www` domain. Do not mark the pages broken or usable from this evidence alone.

## Real conversion contract and GDPR

The target is **one accepted academy-interest request**, not a button click,
submit event, page view, HTTP 200 or thank-you URL. No working interest endpoint
or production conversion has been verified. The integrating backend must issue
an opaque receipt only after accepting the request. It must authenticate that
receipt and supply durable idempotency; client-provided `status: accepted` is
not evidence. The pure function below is a contract test, not receipt validation.

`conversion(receipt, consent, seen)` emits only `generate_lead` with
`form_kind: academy_interest`, and a local Ads-eligibility decision. Receipt IDs
remain inside the caller's dedup state; names, email, telephone, free text, full
URLs and visitor identifiers never enter the event. No value/revenue is invented.
The form must remain usable when optional analytics consent is refused.

Default all four Consent Mode categories to **denied**. Missing/denied
`analytics_storage` means no optional analytics event. Ads eligibility additionally
requires explicit `ad_storage` and `ad_user_data` grants; denied
`ad_personalization` is retained and must never be upgraded by an adapter.
Analytics-only consent does not authorize Ads attribution. No historic receipts
are replayed after later consent. No enhanced conversions, hashed personal data,
offline uploads or cookieless pings are implemented.

The existing `rebuild/js/shell.js` banner loads optional Clarity after analytics
consent and keeps its ad storage denied. That is **not proof** of Google Consent
Mode v2/CMP readiness. Before production integration: prove default-denied order,
independent granular choices, revoke/reload handling, no Google network/cookies
before consent, accepted/rejected/duplicate receipts, no PII in payloads and
preserved form operation under refusal. Do this in a dedicated later PR; this
package adds no production tracking loader or frontend import.

## Reuse GA4/Search Console; do not duplicate #67

Main already has `.github/workflows/google-analytics-aggregate.yml`, cron
`39 7 * * *` (07:39 UTC), OIDC short-lived auth and 14-day artifact retention.
Its exporter requests readonly GA4 and Search Console scopes, a 28-day window
ending three days ago, and daily aggregate traffic metrics. It has **no verified
lead/key-event or Ads-attribution export**. Run `41422510038` has success for
OIDC, export and upload steps; no private report was downloaded or inspected.

PR #67 owns that workflow and its daily anomaly-triage scripts. Those files are
unchanged. The new `analyticsEvidence(report, now)` consumes its existing JSON
shape offline, checks generation/coverage freshness and returns only row counts
plus `conversions: unavailable`. It cannot infer leads or paid performance from
traffic totals. Synthetic tests verify that interface; real artifact ingestion
has not been exercised. Artifact access follows repository permissions; the
word “private” in an existing job label is not a confidentiality guarantee in a
public repository. Do not upload raw Ads records or personal data there.

After #67 stabilizes, its owner can add one hook to the **existing** daily
consumer: load the existing aggregate, call this adapter, read a verified Ads
snapshot if available, and save a sanitized review plan. No second cron,
parallel GA4 exporter, new OAuth keys or service activation is needed here.

## Candidate Ads Script and Issue handoff

The preview reads enabled ads/keywords via three GAQL queries, checks the two
last complete account-local months, and GETs at most 30 unique allowlisted
public HTML URLs. It rejects more than 5000 rows per query instead of silently
claiming complete coverage. Only exact HTTPS site paths are fetched; no queries,
credentials, arbitrary hosts or redirect following. A fetch exception/redirect
is `URL_UNCHECKED`, not a fabricated 404 or pass. Soft-404s, WAFs, consent,
ad relevance, account setup and all policy requirements still require separate
review. Quality scores missing or outside 1–10 are unknown, not a pass.

The bundle is an inert candidate for a later **authorized manual Preview**. It
was syntax-checked and its actual collector exercised with strict mock Ads/GET
adapters; it has **not** been executed in the Google Ads runtime. No `pause`,
`enable`, budget operation, mail, webhook or remote Issue write exists.

`ad_grants_issue_plan.py` accepts only known finding codes/counts, emits no raw
record fields and always sets `can_publish: false`. It checks trusted-author
markers across open and closed Issues: already-open → no new issue; closed →
would reopen; absent → would create. An incomplete/failed inventory aborts.
`inventory(fetch_page)` specifies `state=all`, 100 rows/page and fails closed at
the pagination limit. No automatic closing is inferred from absent/partial data.
The future adapter must preserve that completeness contract and use one daily
consumer/concurrency owner. This PR exercises the plan, **not real Issue writes**.

Runtime input slots are fixed at
`rebuild/test-artifacts/ad-grants/{audit-report,existing-issues}.json`;
`--fixture` uses committed synthetic inputs. There is no arbitrary-path CLI or
`--apply` mode. Do not replace synthetic evidence with raw/private Ads records.

## Reproduce offline

```sh
node --test rebuild/ads/tests/*.test.cjs
python -m unittest discover -s .github/tests -p 'test_ad_grants*.py' -v
node rebuild/ads/build_preview.cjs
node --check rebuild/test-artifacts/ad-grants/google-ads-audit.js
python .github/scripts/ad_grants_issue_plan.py --fixture
```

No package installation, Google account, network request or credential is needed.
The fixture's disapprovals/404/low CTR are **synthetic**, not observed Ads failures.

## Activation blockers — continue independent preparation, never bypass

P0 #66 main Sonar A and required checks; current policy verification; account
setup from #41 by the authorized owner; successful live landings; functioning
interest form/verified backend receipts; consent QA; real GA4 key-event and Ads
attribution verification; and an authorized Google Ads Preview all remain open.
The museum campaign additionally needs a meaningful primary outcome. There is
no activation date, paid setup, payment change or administrative acceptance here.
