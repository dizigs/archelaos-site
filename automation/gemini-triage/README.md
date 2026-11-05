# Gemini public-news triage — isolated source-only adapter

**Status (2026-11-05): Draft PR, NOT deployed, NOT invoked against Gemini API.**
No production Worker, OAuth, Google Apps Script, DNS, schedules, cost
controls or Brain code is changed.

## Verified live state

The existing Cloudflare Worker \`archelaos-automation-bridge\` includes the
binding NAME \`GEMINI_API_KEY\` as \`secret_text\` (value not read). Its
currently downloadable source has no \`GEMINI_API_KEY\` reference or Gemini
GenerateContent route, so a stored key is NOT evidence of a working API call.
The separate staging Brain worker has no Gemini secret binding.

PR #111's Brain AI gateway is intentionally synthetic and AI-paused, and
its current ledger provider enum covers cloudflare, azure and openai, NOT
gemini. It must not be bypassed or silently expanded from this folder.

## Proposed first use

Classify metadata from a VERIFIED PUBLIC article: sports department,
explicit event date, public names where permitted, possible duplicate
review flag and confidence. The result is always PRIVATE_REVIEW_REQUIRED.
No news record, biography, Hall entry or live website content is modified.

- Accept only one public, privacy-reviewed, bounded article.
- No private PDFs, uploaded contributions, document contents, accounts or
  children's data before independent privacy review and appropriate provider
  privacy terms. Free-tier Gemini data use may differ from paid tier.
- Fixed Google API origin and allowlisted Flash-Lite model IDs.
- One request, no automatic retries, bounded prompt/output.
- Required trusted approval from the Brain's eventual atomic **shared**
  EUR20/month ledger (not supplied by any browser or untrusted payload).
- This standalone adapter never settles budget claims and never invokes an
  external provider without explicitly enabled production integration.
- Validate structured JSON and usage counters; never treat AI results as facts.

## Live activation blockers (do not assume resolved)

1. Verify the actual Google AI Studio project key permissions, model access,
   billing tier, quota and whether any free-tier call is allowed. A secret
   binding proves only storage, NOT an authenticated API invocation.
2. Add Gemini to the verified centralized Brain provider/cost policy,
   price/effective date, conversion, 75/90 alerts and same EUR20 cap
   through the Brain owner's separately reviewed scope, preserving PR #111.
3. Authenticate the service-to-service call and authorized operator; only
   public privacy-cleared input may cross the boundary.
4. Independently verify the exact Worker source/bindings and production
   deployment safeguards before any separate, approved mount; no second Worker.
5. Observe one real authorized test with source-bound receipt, actual response,
   usage settlement and no unexpected charge; then decide about new work.

No claim is made that \`gemini-3.5-flash-lite\` is available to this particular
Google API project; model availability is a provider-specific live check.
A free advertised tier does not guarantee that this project is eligible.
See https://ai.google.dev/gemini-api/docs/models and
https://ai.google.dev/gemini-api/docs/pricing .

## Local synthetic tests

\`\`\`sh
node --test automation/gemini-triage/triage.test.mjs
\`\`\`

The included tests exercise fake responses, no real key and zero external
Gemini calls. Offline success is **not** live Gemini API success.
