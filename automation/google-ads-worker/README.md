# Archelaos Google Ad Grants Worker — Issue #216

**Status: CODE PREPARED / OFFLINE ONLY. No Google Ads account, API authorization,
Grant entitlement, test customer, live mutation, production deploy or spend was
verified in this PR.** No Codex, cron, Cloudflare publish or Ads write was performed.

## Ownership and dependencies

- Independent scope: `automation/google-ads-worker/**` and the new PR-only
  `.github/workflows/google-ads-worker-checks.yml`.
- Stacked on **draft PR #70** (`codex/ad-grants-dry-run`) so the existing
  `rebuild/ads/ad_grants_core.js` and `campaigns.draft.json` are reused
  *without any edits*; rebase onto main only after PR #70 is merged or reviewed.
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

## Actual Google Ads prerequisites (all blocked)

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
