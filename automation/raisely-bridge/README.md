# Archelaos Raisely Bridge (phase 1 — no payment writes)

This is a completely standalone Cloudflare Worker for fundraising campaign `archelaos-katerini`. All requests to Raisely are **fixed, GET-only**, using the official API v3.

- `GET /health` — public, does not say Raisely connection succeeded.
- `GET /check` — requires a separate `RAISELY_CHECK_KEY` (`Authorization: Bearer ...`); fetches `GET /v3/authenticate` and `GET /v3/campaigns?path=archelaos-katerini&private=true&pruneConfig=true&limit=3`, returns a minimal whitelisted summary.
- No POST, PATCH, DELETE, donations, donor information, payment configuration, fundraising campaign writes, or scheduled polling.

## Cloudflare Secrets (do not put values in Git/Issues/chat)

1. `RAISELY_API_KEY` — Raisely campaign private API key from Campaign → Settings → API & Webhooks or API Keys. This key can carry **organisation administrator permissions** and should never be used in browser-side JavaScript. Restrict its storage to this Worker.
2. `RAISELY_CHECK_KEY` — independent random command-auth key (32+ characters), for trusted clients to call `/check`. It is **not** the Raisely key.

Never put either secret in `wrangler.jsonc` or the website's public HTML/JS.

## Rollout

Run `node --test test/bridge.test.mjs`; review PR, confirm new Worker and `/health`, then store Raisely key in Cloudflare Secrets and perform an authorized live `/check` from a trusted caller. Do not claim Raisely API authentication is successful until the check has returned a real response. Brand/logo/hero assets are managed manually until an approved patch shape and backup/rollback are documented; Raisely styles can be precompiled rather than instantly reflected by JSON updates.

This worker does not touch `archelaos-automation-bridge`, the GitLab Workers, site Pages deployments or GitHub main. No additional cron or external payment/financial write is configured.

Official API docs: https://developers.raisely.com/docs/authentication-1 and https://developers.raisely.com/reference/getcampaigns .
