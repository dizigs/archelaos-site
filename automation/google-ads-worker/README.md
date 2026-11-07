# Archelaos Google Ad Grants Worker — Issue #216

## Post-merge integration audit — 2026-11-05

**Merged base:** PRs #70, #223 and #229. **Closed, NOT merged:** #225.
Both explicit service-account auth variants are already present in `main`:
`SERVICE_ACCOUNT` (project-pinned PEM secret) and
`SERVICE_ACCOUNT_JSON` (project/email-pinned JSON secret). This branch does
**not** add another OAuth adapter or change Google credentials. The operator's
HTTP 200 proof from a Chromebook demonstrates an *external account/API path*;
it is **not** a Worker token, Worker GAQL read, a live Worker connection or proof
of the Ad Grants billing profile.

This follow-up adds the `brainHandoff` review-only return value to the
already authenticated private `executeSignedBrainIntent` RPC for
`analytics_preview` and `budget_audit_read`. The allowlisted payload carries
aggregate analytics hints or USD budget/spend totals, correlation ID,
`aiCostEur: 0`, and `deliveryStatus: NOT_SENT_BY_WORKER`. It deliberately
contains no customer ID, credentials, visitor/session rows, or Ads write.
The canonical Brain must verify the originating Analytics event independently
and own any durable delivery receipt; **no service-binding delivery or upstream
Analytics provenance is claimed by this contract**.

The dispatcher now enforces the staging/permission gates *before* calling
even an injected mock adapter for `budget_audit_read` or
`keyword_ideas_read`, and ensures an account-scoped budget audit matches
the configured customer. The inbound analytics adapter explicitly allowlists
the `ga4`, `gsc` and `clarity` aggregate producers. Regression tests exercise
signed Brain -> Ads -> private review handoff, negative scope cases and OFF
defaults; they use synthetic customer values only.

### Google Ads permissions and evidence matrix

| Capability | Code/test status | Real-world status | Production decision |
| --- | --- | --- | --- |
| Service account JWT, fixed `adwords` scope | Offline synthetic RSA/signature tests | Operator HTTP 200; **Worker OAuth not observed** | OFF |
| GCP API Explorer access | Explicit read/reporting path | Operator/external approval evidence; approved GCP project ↔ service account match not independently read by Worker | Read-capable in principle; not enabled |
| KeywordPlanIdeaService | Basic/Standard-only gate, including injected ports | Explorer level does **not** grant Planner APIs | **BLOCKED** |
| GAQL account, account-wide budgets, actual daily/monthly spend | Offline mocked parsing and USD cap checks | No Worker account snapshot or verified Ad Grants billing profile | OFF |
| `validateOnly` Search mutation | Offline mock exercises `validateOnly:true` | No real validateOnly execution | OFF |
| PAUSED writes / readback / idempotency | Offline mocked receipts and UNKNOWN reconciliation | No production D1 binding, Brain account-wide writer lease or approved live receipt | **OFF** |
| Landing-page SHA256 + policy approval | Offline HTTP 200/HTML/digest guards | No operator-approved, production-fresh landing/policy receipt | OFF |
| Brain/Analytics private handoff | New contract and mock E2E | No independently verified service binding or real delivery/readback | Review-only, not delivered |

**Ledger separation:** Google Ad Grants USD campaign budgets and observed spend
are reporting-only figures, not a second AI ledger or an allocation of the
Brain's **EUR 20/month** AI cap. This Worker calls no AI model and reserves
no AI credits.

**CI boundary:** `.github/workflows/google-ads-worker-checks.yml` already runs
offline syntax, dry-run planning and Node tests for PRs touching this directory.
CodeQL runs on PR changes to `*.mjs`. **Exact PR-head checkout** cannot be
proven with the existing checkout configuration (GitHub's default PR merge
ref), and modifications to `.github/workflows/**` are outside this agent's
exclusive file ownership. SonarCloud cannot be marked PASS until an actual
check for the exact PR head is observed. The central coordinator owns any
workflow changes and acceptance.

**Not cleared for automation:** billing and grant entitlement for the exact
account, service account/project identity from the deployed Worker, a real
read-only GAQL account/budget/spend receipt, editorial/policy landing approval,
private Brain/Analytics service binding with signed provenance, global
single-writer lease, exact-head required CI, SonarCloud/CodeQL evidence and
explicit central authorization. The Worker stays unconfigured and kill-switched;
no live campaigns, credentials, charges, deployment or merge.


**Status: CODE PREPARED / OFFLINE ONLY.** Private Google notification emails
confirm Ad Grants activation, Google Ads API Explorer project approval, and
an Ads service-account user with Standard account access. These emails do NOT
prove the service account's Google Cloud project number matches the approved
Explorer project or that the Worker obtained an OAuth bearer token. No Worker
live API read, test customer, mutation, production deploy or spend was performed.
No Codex, cron, Cloudflare publish or Ads write was performed.

## Ownership and dependencies

- Independent implementation scope: `automation/google-ads-worker/**` only.
  The pre-existing workflow is owned by the central CI coordinator.
- Built on the **merged PR #70** editorial drafts; the existing
  `rebuild/ads/ad_grants_core.js` and `campaigns.draft.json` are reused
  *without edits*.
- Analytics producer: **draft PR #196**, aggregates-only event contract;
  the sender must still verify original producer signature/provenance before
  Brain accepts it. The Ads worker does not ingest raw Clarity/session/PII data.
- Main already contains the Brain core (#111), but a Brain RPC service binding
  and centrally managed durable service-to-service auth rollout remain separate
  integration tasks. No second Brain is created.

## Local dry run, no credentials

```sh
npm run plan --prefix automation/google-ads-worker
npm run syntax --prefix automation/google-ads-worker
npm test --prefix automation/google-ads-worker
```

The plan command reads PR #70 core and its Greek editorial campaign candidates,
cross-checks the allowlisted landing pages and writes an *ignored*, inert
`rebuild/test-artifacts/ad-grants/worker-plan/preview.json`. It has no budget
writes, imports, customer IDs or API connection. Candidate headlines, descriptions,
ad groups and phrase keywords are validated. Draft pages are NOT considered
live merely because they are on the domain; independent HTTP 200 and editorial
approval evidence are still required. The draft contains no Keyword Planner
metrics; generated seed templates are not represented as observed demand.

## Integration contract

`index.mjs` is a private `WorkerEntrypoint`; fetch always 404. Only an
authenticated Brain RPC call `executeSignedBrainIntent(envelope)` can dispatch.
Signature = HMAC-SHA256 over `timestamp + "\\n" + nonce + "\\n" +
JSON.stringify(action)`, with a private 32+-char secret shared only by
the Brain and this Worker. Accept a 5-minute clock window; secret must be
a Cloudflare secret, never a committed env var. Production nonce replay and
change idempotency require a D1 receipt store. A new Brain-side caller must use
the same canonical JSON bytes, verify permissions and supply an explicit review.

Accepted modes:
- `dry_run`: validated, non-importable PR70 candidate plan, no network.
- `analytics_preview`: privacy-safe aggregates, review-only suggestions.
- `keyword_ideas_preview`: schema-only keyword planner request (requires staging).
- `keyword_ideas_read`: real, read-only KeywordPlanIdeaService request with explicit
  independently enabled staging + planner-read gates, bounded and sanitized results;
  not exercised without authorization.
- `validate_only`: live Google API *validation only* with `validateOnly:true`;
  requires independently confirmed staging API access and OAuth.
- `apply`: only after every live gate + human-approved signed Brain change ID,
  and D1 audit database. Creates stay **PAUSED**. No API mutation is retried
  after an ambiguous response; it requires reconciliation.
- `rollback_preview`: review-only inverse proposal, never blindly deletes
  active resources. Exact resource IDs and current paused state must be read
  back and reviewed for any future actual undo.

Only single-operation safe descriptors: campaign budgets, paused Search campaigns,
paused Search ad groups, paused responsive search ads, phrase/exact keywords,
pausing entities and budget updates. No ENABLE operation. The worker cannot
make serving ads by itself. No Ads language CampaignCriterion is sent: that
manual Search targeting API was retired September 2026. Keyword Planner may
still use language and reviewed geo seed constants.

D1 schema: `migrations/0001_ads_receipts.sql`. The Wrangler file deliberately
has **no D1 binding, no secrets, no schedules, no public route**, and staging,
live and ads kill switch are all OFF by default. Schema is not applied to Cloudflare.
An authorized operator must provision an isolated staging D1, explicit service
binding and secrets, and separately approve a production setup. A successful
GitHub build is **not** Cloudflare deployment or Google Ads authorization.

## Actual Google Ads prerequisites (production remains blocked)

1. Verify granted nonprofit status and the exact **Ad Grants** customer ID;
   separately prove the OAuth principal has `https://www.googleapis.com/auth/adwords`
   and the linked Google Cloud project has Google Ads API test or production
   access as needed. Never use a paid customer ID. Since September 9 2026,
   developer tokens are no longer required; access is bound to Cloud project.
2. Confirm account currency, accessible customer hierarchy, grant billing and
   existing campaign budget totals. This adapter is **USD-only** pending an
   audited conversion for EUR accounts. Only the grant's up-to-$10,000/month
   allowance may be used, with $329/day ceiling (actual spend not guaranteed).
   The preview additionally budgets by month length to not exceed $10,000 on
   31-day months; this is a proposal, NOT an Ads bill/credit-control proof.
3. Verify public HTTP 200 landing, active programmes where claimed, current
   Google policy, approval for drafts/ads, contact receipts and consent.
   Do not invent lead conversions or use visits as leads. Material changes
   need explicit review, revision and cooling-off.
4. Verify KeywordPlanIdeaService with reviewed geo IDs in a real test account.
   Results must be attributed to the correct Google response and cached;
   seed strings are not historical-volume proof.
5. Demonstrate test-customer `validateOnly`, then intentionally reviewed
   PAUSED create, readback, reconciliation and undo, with exact Google request
   IDs and D1 receipts before considering any live permissions.
6. Have Brain record the Ads change in its audit ledger separately from the
   shared **EUR20/month AI budget**. This Worker performs no AI calls.

**No claim of real API access, Ad Grants eligibility, revenue, live conversion,
production or completed E2E.** Account registration and setup remain blocked
until independently verified.

## Additional budget/spend safety gate (stacked follow-up to #223)

The private `budget_audit_read` Brain mode makes **read-only Google Ads GAQL**
requests for customer metadata, all current campaign budgets, campaign channel
types, and **actual** current-month and current-day `metrics.cost_micros`.
It cannot run unless `ADS_STAGING_ENABLED=true`,
`ADS_BUDGET_AUDIT_READ_ENABLED=true`, and the pre-existing staging gates
are satisfied. No Google Ads account was queried during offline development.
The `googleAds:searchStream` adapter uses OAuth from the *Ads-specific* Cloud
project and returns an aggregate summary, not ad creative or account secrets.

Every future `apply` must re-read the account inventory. The guard rejects:
non-USD/non-enabled/manager/test account metadata; non-Search campaigns; missing
or invalid spend observations; non-daily or unresolved budgets; duplicate
resource names; expired audits; and proposed/observed account-wide daily budgets
over the more conservative of **$329** or **$10,000/days-in-month**, or observed
spend exceeding the $329 daily / $10,000 monthly grant limit. New budget
creates and updates are checked against **all existing budgets**, including
other campaigns. Newly created campaigns must reference an observed budget.
These are intentionally conservative safety conditions, not proof that Google
will spend or charge an exact amount.

Separately from `ADS_ACCOUNT_KIND=AD_GRANTS`, `apply` now requires
`ADS_GRANTS_ENTITLEMENT_RECEIPT_VERIFIED=true` and
`ADS_NO_PAYMENT_METHOD_VERIFIED=true` (both default **false**). The operator
must independently verify the Ad Grants approval/activation for the **exact
customer ID**, the grant billing profile with no payment method, Google Ads
OAuth `adwords` scope, and the Google Cloud Ads API **Explorer or higher**
access for production; Test level applies only to test customers. A non-test
account that is enabled and denominated in USD does not establish a grant.

The USD Ad Grants spend limits are not interchangeable with the independent
EUR 20/month AI budget ledger. This Worker makes no AI provider calls. The
account-wide audit currently guards one isolated mutation at a time; before
production authorization, the Brain must enforce a single active Ads-account
writer/lease, verify billing receipts and approval source, and reconcile any
unknown outcomes. The Ads API read is not a billing guarantee and does not
prove Google Grant entitlement or that an account cannot later be converted
into a paid account.

**Remaining blockers:** no independently authorized Google Ads connection
available to this worker, no real OAuth / Keyword Planner response or Grants
billing receipt, no approved production landing-page QA, no tested shared
Brain authorization and account-level writer lease, no readback/undo E2E,
and no staging D1 resource/deployment. This follow-up remains OFFLINE;
do not set any of the new switches to true without the corresponding evidence.

## Live RSA landing and post-mutation readback (offline-tested only)

A reviewed, signed Brain `apply` for a responsive search ad now must provide
`operation.input.landingContentSha256`: the lowercase SHA-256 of the exact
editorially approved UTF-8 HTML of `operation.input.finalUrl`. Immediately
before mutation the Worker requests the exact allowlisted HTTPS landing with
`redirect: manual`; it requires HTTP 200, HTML, substantial body content,
and an exact SHA-256 match. A changed or inaccessible landing fails closed.
This enforces byte-level reapproval for the currently published page, not
historical editorial truth or a claim about what the page says.

A Google Ads mutation API response is not alone enough to mark the D1 receipt
`APPLIED`. The executor now performs one authenticated, scoped read-only
`googleAds:search` readback for the exact returned resource. Campaigns, ad
groups, RSAs and keywords must be **PAUSED**; budgets must have the requested
exact amount and enabled budget record. Any failed, missing or contradictory
readback is recorded `NEEDS_RECONCILIATION`, with the possibility that the
mutation already happened; **no automatic retry or destructive rollback**.
The existing `rollback_preview` remains a manual proposal only. An eventual
real undo needs operator approval, known exact resource IDs and state checks.

These guards have mocked/offline CI coverage; **no live Google Ads validateOnly,
readback, Keyword Planner, ads write or rollback has been executed**.

## Existing Google Ads service account — private Google evidence, 2026-11-05

Google sent account-specific confirmation of **Ad Grants activation (2026-11-02)**,
**Google Ads API Explorer approval (2026-11-05)** and a Google Ads account
**Standard**-permission service-account user (2026-11-05). The exact customer,
service identity and GCP project number are retained in the operator's
**private access registry**, never placed in this public repo. The invitation
to accept the non-charging billing profile still needs operator confirmation
in the Google console; an email saying the invitation was sent is not proof
that it was accepted. Confirm that the approved Explorer GCP project is the
same GCP project that owns the intended service account, per Google Ads API
documentation. An approved project number by itself cannot establish a
service-account-to-project match.

The Worker now supports explicit `ADS_OAUTH_MODE=SERVICE_ACCOUNT` with a
short-lived, RS256-signed Google OAuth 2.0 JWT:
- `ADS_SERVICE_ACCOUNT_PROJECT_ID`: verified owner project ID (configure
  securely; do not infer from an unrelated project number).
- `ADS_SERVICE_ACCOUNT_CLIENT_EMAIL`: exact Ads-authorized service account.
- `ADS_SERVICE_ACCOUNT_PRIVATE_KEY_PEM`: **Cloudflare secret only**; use the
  private key from the existing service account JSON, never its entire JSON in
  GitHub, a PR, a log or chat. Do not create another key without need.
- Token endpoint `https://oauth2.googleapis.com/token`, exact Ads scope
  `https://www.googleapis.com/auth/adwords`, short expiry.
- No implicit fallback. Alternate previously implemented user-refresh-token
  flow requires explicit `ADS_OAUTH_MODE=USER_REFRESH_TOKEN` and separately
  provisioned secrets. Default remains `UNCONFIGURED`, all staging/live
  gates remain false.

CI exercises synthetic ephemeral RSA keys and mocked token endpoint only.
No real Google Ads OAuth grant, service-account key, billing state, customer
query or production access has been tested by the Worker. The operator must
provision secrets through the Cloudflare secret interface during a separately
approved **private staging** rollout; do not publish a Worker as a side effect
of this code change.

## Keyword Planner capability is NOT included in Explorer access

Official API access levels documentation explicitly restricts
`KeywordPlanIdeaService`, `KeywordPlanService` and other planning APIs at
**Explorer** level. This organization's private confirmation is for Explorer
(up to 2,880 production operations/day), not Basic. The Worker therefore rejects
`keyword_ideas_read` unless the operator independently verifies
`ADS_API_ACCESS_LEVEL=BASIC` or `STANDARD`, in addition to all other
staging and planning gates. Keep `ADS_KEYWORD_PLANNER_READ_ENABLED=false`
at Explorer access. An Ads account user's **Standard** access level is
not the same as the Google Cloud project's **Standard API access**.
Only the latter (or Basic) unlocks the planning service. This change never
applies for Basic access automatically and is not an instruction to upgrade.

Reference: https://developers.google.com/google-ads/api/docs/api-policy/access-levels

## OAuth adapter integration — #225 + #229 (review-only)

The #229 account-wide GAQL budget/spend guard, landing guard, readback and
Basic/Standard-only Keyword Planner gate remain unchanged. The #225
**service account JSON secret** capability is additionally preserved, rather
than silently replacing #229's existing PEM-secret JWT adapter:

- `ADS_OAUTH_MODE=SERVICE_ACCOUNT_JSON` requires `ADS_SERVICE_ACCOUNT_JSON`
  as a **Cloudflare secret**, plus separately verified
  `ADS_SERVICE_ACCOUNT_PROJECT_ID` and
  `ADS_SERVICE_ACCOUNT_CLIENT_EMAIL`. The JSON `project_id`,
  `client_email` and token URL must exactly match those pinned values.
- `ADS_OAUTH_MODE=SERVICE_ACCOUNT` keeps #229's existing
  `ADS_SERVICE_ACCOUNT_PRIVATE_KEY_PEM` secret and project/email pinning.
- `ADS_OAUTH_MODE=USER_REFRESH_TOKEN` remains an explicit legacy option.
  All other modes, including the configured default `UNCONFIGURED`, fail
  closed. There is **no automatic identity fallback**.
- OAuth JWT scope is fixed to `https://www.googleapis.com/auth/adwords`,
  RS256 with short validity. Synthetic tests verify the signature and
  negative identity cases. No actual service-account credential is committed.
- No new Cloudflare deployment, secret upload, D1, cron, Ads API request,
  Brain binding or Google Ads mutation is part of this code integration.
  `ADS_STAGING_ENABLED=false`, `ADS_LIVE_ENABLED=false`,
  `ADS_KILL_SWITCH=on` are unchanged in `wrangler.jsonc`.

**Merged dependency order:** #70 → #223 → #229. #225 was closed without merge;
its JSON-secret behavior already exists in the current main and remains offline-tested.
Do not merge or reintroduce #225 separately. The current Google API Explorer
access permits GoogleAdsService reporting but not KeywordPlanIdeaService.
For any staging read, independently confirm the same approved Google Cloud
project owns the service account and the exact customer is the nonprofit
Ad Grants account, not a separate paid Ads account.
