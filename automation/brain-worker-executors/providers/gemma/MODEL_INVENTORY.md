# Gemma inventory / provider verification — 2026-11-05

Provider chosen: **Cloudflare Workers AI**, through an existing Worker AI binding
(env.AI.run), not a Gemini/Google paid API or a separate hosted service.

## Verified without inference (read-only)

- Connected Cloudflare account: Admin@archelaos.club's Account.
- Cloudflare API GET /accounts/{account_id}/ai/models/search?search=gemma-4-26b-a4b-it
  returned success=true and the exact model @cf/google/gemma-4-26b-a4b-it.
- Cloudflare API GET /accounts/{account_id}/ai/models/schema?model=... returned
  success=true, messages input, max_completion_tokens, response_format
  json_schema (name/schema/strict), and chat completions output.
- Model metadata reports context window **256,000 tokens**, supported
  text generation, built-in reasoning and function calling.
- Account listing and model catalog access do NOT prove an inference binding
  is configured, or authorize paid requests. No POST/run was attempted.
- Cloudflare public catalog price: **USD $0.10 / 1M input tokens** and
  **USD $0.30 / 1M output tokens** (cached input $0.05 / 1M).
- Workers AI plan pricing: 10,000 neurons/day free allocation; on Workers Paid,
  billable usage beyond the daily allocation, currently $0.011 / 1,000 neurons.
  This model's equivalent neurons are 9,091 / 1M input tokens and 27,273 / 1M output tokens.
- Text generation default rate limit: **300 requests/min**, subject to provider
  capacity and any stricter per-account or per-model limits.

## References

- https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/platform/limits/
- https://developers.cloudflare.com/workers-ai/features/reject-if-busy/
- https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/

## Remaining blockers / explicitly NOT verified

1. An AI binding on a dedicated Build B Worker, runtime/model inference permission,
   stage endpoint and staging execution. None is created here.
2. Integration with PR #209 dispatcher and Brain PR #111, with authenticated,
   deduplicated and scoped event receipts.
3. Common atomic budget reserve/settle ledger, live monthly EUR threshold,
   FX rate policy, usage reconciliation, and user-approved billing policy.
4. Actual model JSON conformity and output quality. Mock tests do not prove E2E.
5. CI status for this PR must be read from GitHub; no manual/remote inference ran.

Default state: **DISABLED**. Activation must be a separate reviewed and
explicitly authorized integration, with a staging safety test and known cost ceiling.
