# Ceramic.ai web-search adapter (non-production)

The independent adapter `ceramic-search.mjs` prepares an optional **public-web-search** port for the central Archelaos Brain. Its only provider is `ceramic`, via the Cloudflare `AI.websearch()` binding and the existing AI Gateway named `default`. It is a search provider, not an LLM or fact verifier.

* **Pricing reference (2026-11-05):** https://developers.cloudflare.com/web-search/providers/ and https://www.ceramic.ai/pricing — $0.25 per 1,000 requests ($0.00025/search). Prices are in USD and may change. The Gemini/Gemma/Brain AI models have separate billing and are NOT invoked here.
* **Cloudflare status observed 2026-11-05:** personal account has AI Gateway `default` but **zero credits**, no payment method and no auto-top-up. This module performs no billable calls by itself; a live test is not possible until credits or an approved provider API key are available.
* **Possible free start:** Ceramic.ai offers an introductory 1,000 queries through its own account. Obtain an API key privately, store it as a **Ceramic provider key** in AI Gateway and set a deliberate `byokAlias` (for example `ceramic_free`). Never commit it to GitHub or document its value. An explicit alias prevents fallback to Gateway credits if the key is missing.
* **A live call requires:** provisioned AI binding in the target Worker (`[ai] binding = "AI"`), verified approved public-only query, a **durable once-only** budget reservation + claim by the Brain, an `enabled: true` switch, and a durable audit hook. The adapter is not yet imported in the Brain (#111 owns that code). **No cron, endpoint, secret, worker, deploy or auto-merge is created here.**
* **Budget:** the existing Brain tracks a €20/month shared AI budget and requires verified USD/EUR FX and pricing evidence. Count Ceramic searches under that same cap before any paid invocation; no silent fallback or unaudited use. Search responses are *candidates* requiring URL source reading, event dedupe, correct person identity and attribution to G.A.S. Archelaos before publication.
* **Privacy:** only approved public keyword queries. Never submit private Drive, Gmail, PDF or children’s private information. Audit stores only reservation ID, provider, status and result count. On timeout or uncertain billing, keep reservation until reconciliation; never blind-retry.

## Offline tests

```sh
node --test automation/ceramic-search/test/ceramic-search.test.mjs
```

## Consumer example (not executable without approved Brain ports)

```js
import { ceramicSearch } from './automation/ceramic-search/ceramic-search.mjs';
const result = await ceramicSearch({
  ai: env.AI,
  query: approvedPublicQuery,
  gatewayId: 'default',
  byokAlias: 'ceramic_free', // optional, only when configured
  authorize: brainPublicSearchBudgetReserveAndClaim,
  audit: brainDurableAudit,
  enabled: operatorHasActivatedVerifiedSearch,
});
// result.items must be independently checked; never auto-publish.
```
