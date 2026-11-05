# Ceramic.ai → Cloudflare AI Gateway → ARCHELAOS Central Brain

**Status 2026-11-05: CODE ONLY / OFF / NOT CONNECTED TO BRAIN / NO BILLABLE REQUEST.**

This is a *private, isolated* provider adapter for the existing architecture, not a
separate Worker, autonomous web crawler, Cron or public endpoint. The Cloudflare
account already has AI Gateway `default` and the staging Brain has an `AI`
binding (previous GET readback). The separate Brain PR #111 has no production
Ceramic dispatch, and this package does not edit `brain/**` or any active PR.

Cloudflare docs:
- https://developers.cloudflare.com/web-search/how-to-use/
- https://developers.cloudflare.com/web-search/providers/
- https://www.ceramic.ai/terms-of-service

## Intended private deployment

```js
// Only in a trusted central Brain Worker after provider-cost verification,
// strict account-wide reservation and source-policy authorization:
const search = createCeramicBindingTransport(env.AI);
const result = await runCeramicDiscovery(command, {
  readControls: () => durableBrain.readControls(),
  readBudget: () => durableBrain.readVerifiedSharedAiSearchBudget(),
  reserve: (quote) => durableBrain.reserveOnce(quote),
  search, // calls env.AI.websearch({gatewayId:'default',query,provider:'ceramic',limit:5})
  verifyPrimary: (url) => independentPublisherVerifier(url),
  reconcile: (receipt) => durableBrain.reconcileProviderCost(receipt),
});
```

**This is an illustration only. These private ports are not wired, verified or
available yet.** A synthetic test double is not proof of real credits/spend caps.

## Security and cost gates

1. Call source is restricted to a UUID + enum topic + optional year 1956-present.
   Never forward arbitrary messages, athlete names, emails, personal information,
   private documents or analytics IPs to Ceramic without legal review/DPA.
2. **OFF default.** In a future production version, the central Brain alone
   enables searches after permissions and a shared cross-provider AI + search
   monthly budget are genuinely verified. Maximum agreed budget: **20 EUR/month**.
   Missing gateway credits, no authoritative price quote, or missing hard stop
   is a blocker. Workers Paid and Workers AI neurons do NOT make web search free.
3. Provider cost reference: **USD $0.25/1,000 searches**, through AI Gateway
   credits/BYOK; exchange conversion and effective final billing must be
   verified by the accounting port and enforced before any search. One
   reservation per event before the single websearch call; unknown outcomes
   require reconciliation, never blind retries.
4. Ceramic Terms Section 7(n)/(p): do not persist, cache or aggregate search
   Output, rankings, snippets, descriptions or search corpora. Search candidates
   stay ephemeral in a single invocation, and are checked immediately against
   **independently fetched primary publishers**. Only original independently
   verified facts/sources are eligible for the museum news index.
5. Never interpret a search snippet as evidence of a historical fact. No
   auto-publication, no direct Hall/news edits, no duplicated news records.
   Human/editorial gate is mandatory.
6. The primary verifier must block private IP ranges, DNS rebinding, redirects
   to unsafe endpoints and untrusted publisher source bytes. URL checks in
   this adapter are defense-in-depth, not SSRF completeness.
7. Any provider response or billing failure leaves an explicit hold. No
   error/log payload includes raw search results or financial secrets.
8. Authentication, durable billing ledger, account-wide budget enforcement and
   source validation are central Brain responsibilities and are not supplied by
   an untrusted HTTP request or this isolated package.

## Local tests

Run `npm run check` from `automation/brain-ceramic/`. A pull-request-only
GitHub Actions workflow runs the tests. The workflow has no secrets, no
network calls to Ceramic, no provider consumption and no schedule.

## Activation is BLOCKED until

- AI Gateway credits or verified provider BYOK configuration is confirmed
  without creating credits or enabling auto-top-up.
- Account-wide, race-safe monthly budget/credits/FX reconciliation and hard-stop
  under 20 EUR are tested with the *actual* billing source, including reserved
  charges from Gemini, Gemma, and all other AI/search providers.
- The Brain's genuine private `env.AI.websearch` port and authenticated
  intake are deployed to a bounded staging version with provider and version
  readback, complete CI/Sonar and a signed request.
- One explicitly authorized, bounded search is executed and its real cost
  verified. No results retained unless independently verified at source.
- The owner approves any external personal-data search workflow after legal
  privacy/DPA assessment.

No new subscriptions, credentials, Workers, Cron Triggers or production changes.
