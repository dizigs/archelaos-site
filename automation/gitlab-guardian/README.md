# Archelaos GitLab Guardian — read-only mirror observer

Canonical code: `dizigs/archelaos-site` on GitHub. GitLab project `88488684` is a **pull mirror** and is **not** an independent release source.

This is a dedicated Cloudflare Worker (`archelaos-gitlab-guardian`) with `GET /health`, an authenticated `GET /check` and a dormant `scheduled()` handler. It calls only three **fixed, read-only** endpoints:

- `GET https://gitlab.com/api/v4/projects/88488684/mirror/pull`
- `GET https://gitlab.com/api/v4/projects/88488684/repository/branches/main`
- `GET https://api.github.com/repos/dizigs/archelaos-site/commits/main`

The audit compares exact SHA, mirror status/error and safety flags (CI trigger, divergent branch overwrites). It does **not** write GitLab issues, merge requests, branches, secrets, GitHub data, or Cloudflare Pages deployments. An occasional SHA mismatch may be normal while GitLab catches up and is classified as attention before becoming an alert after 120 minutes since the last successful mirror.

## Required secrets (never put in Git or chat)

- `GITLAB_READ_TOKEN`: GitLab **project access token**, project ID `88488684`, scope **`read_api` only**, Reporter or minimum role able to read the pull-mirror details. Avoid broad `api`, `write_repository` or personal owner token. Short expiry with rotation plan.
- `GUARDIAN_CHECK_KEY`: independent random 32+ character secret to authorize `/check` via `Authorization: Bearer …`.

Both secrets must be configured in the Worker secret store. Without either, `/check` is not externally usable. Without the GitLab token, `scheduled()` is a no-op. `/health` is public and does not disclose private repository data.

## Deployment and validation

```sh
node --test test/guardian.test.mjs
npx wrangler deploy --dry-run
# With appropriate Cloudflare operator permissions, after review:
npx wrangler secret put GITLAB_READ_TOKEN
npx wrangler secret put GUARDIAN_CHECK_KEY
npx wrangler deploy
```

**No scheduled trigger is configured** by default. Only after the secret is installed and a real successful `/check` should a low-frequency cron be considered, with logs, cost/quota monitoring and a single owner. `workers.dev` health does not establish GitLab API authorization or successful monitoring.

## Security and ownership

- No production website routes, DNS, GitHub main edits, or cloudflare-automation-bridge modules are touched.
- No GitLab pipelines triggered and no CI/CD duplication.
- Rejects any user-supplied URL; GET-only; guards responses and timeouts, no upstream error bodies or credentials in logs.
- GitLab provider tokens do not pass between the ChatGPT connector and Cloudflare automatically. A separately scoped Worker secret is necessary.
- Track deployment/version/health evidence and blockers in the canonical project issue. The GitLab program is shown as `EDU` in the customer portal; do not assume that resolves nonprofit entitlement questions.

## State, 2026-11-04

10 local Node tests passed against the checked-in source. A live authenticated GitLab API call and unattended monitoring remain **blocked until a scoped token is installed**. The Worker is deliberately not configured with a cron, and no claim about website deployment follows from installing this worker.
