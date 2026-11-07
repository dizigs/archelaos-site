# Gemma 4 — Central Brain adapter (OFF by default)

Target model: `@cf/google/gemma-4-26b-a4b-it` via Cloudflare Workers AI binding `AI`.

On 2026-11-05 the existing `archelaos-brain-staging` Cloudflare Worker was patched with a staging AI binding (GET settings verified 6 bindings, including the 5 prior ones). This is **not proof of deployment or a model inference**. The Brain PR #111 still has a synthetic-only AI gateway, and no production integration is claimed.

This isolated source adapter has **no HTTP route, no cron and no Worker export**. It cannot run autonomously. Future central Brain integration must inject trusted ports to enforce: global pause, verified account-wide billing guard, per-project monthly budget, durable one-shot reservation, independently verified usage and settlement, and reconciliation of uncertain results. Every classification stays private for human/source verification and never publishes automatically.

Only public sports article excerpts are eligible; no private documents, OAuth credentials, Google Apps Script contents, personal data, user analytics or unredacted logs. Club labels: GAS (G.A.S. Archelaos), MERGED (S.F.K. Pierikos Archelaos), OTHER, REVIEW.

This PR touches only `automation/brain-gemma4/**` and its PR-only test workflow; it does not modify `brain/**` (PR #111), AI boundary PR #202, Apps Script PRs #201/#203/#205 or the production Worker. No new secrets or paid model usage.

**Before connecting:** verify paid/free Cloudflare account and hard budget controls (10,000 free neurons/day is account-wide, Paid may bill beyond), exact-head checks, staged deployment/version readback, protected Brain event and provider usage receipts, replay behavior and private review queue. Leave dispatch disabled until those steps are proven.
