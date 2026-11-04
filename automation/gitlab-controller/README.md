# ARCHELAOS — GitLab Automation Controller

This is an **independent** Cloudflare Worker, not the website or existing Apps Script bridge. Canonical repository remains `dizigs/archelaos-site` on GitHub. GitLab project ID `88488684` is the pull mirror.

## Behavior
- `GET /health`: public, minimal health response.
- `POST /issues`: **disabled unless two independent secrets exist**.
- Accepts only `category` = `audit` / `blocker` / `maintenance`, `title`, `description`, stable `ticketId`.
- Writes **confidential GitLab issues only**, using fixed `POST /api/v4/projects/88488684/issues`; before creation, searches for prior `ARC-CTRL:<ticketId>` marker to reduce duplicate retries.
- No arbitrary GitLab API path, merge, branch, repository push, deployment, Webhook, GitHub write, or Cloudflare Pages change. No schedules. Duplicate prevention is best effort and not an atomic provider lock; callers must serialize identical ticket IDs.
- Strict max request size; input validation and rejection of GitLab slash quick actions; no sensitive data in logs or returned errors.

## Secrets

On **Cloudflare Workers & Pages → archelaos-gitlab-controller → Settings → Variables and Secrets**, configure separately:

- `GITLAB_CONTROLLER_TOKEN`: the *second* GitLab project access token; scoped to project `88488684`, role **Developer**, scope `api`.
- `CONTROLLER_COMMAND_KEY`: a separate random 32+ character command key, generated securely and installed in Cloudflare; not the GitLab token.

Do **not** put either secret in GitHub, GitLab Issues, chat, screenshots, or a plain Google document. Using `api` for the GitLab token does **not** turn this Worker into an unrestricted API proxy. The deployed code exposes only a fixed issue-creation operation. The plugin's Owner permissions remain separate.

## Testing

```sh
cd automation/gitlab-controller
node --test test/controller.test.mjs
npx wrangler deploy --dry-run
```

Then validate `GET /health`, unauthenticated `POST /issues` returning `404`, and authenticated `POST /issues` with a deliberate **single** test issue only after a secure authorized caller and GitLab token are installed. Never put bearer credentials in command-line logs. No automatic schedule until operations are proven and quotas evaluated.

**Important:** A successful Cloudflare deployment proves only deployment, not GitLab authorization or issue creation. Keep draft PR #131 under review and never direct-push to `main`.


## Technical review correction — 2026-11-04

Duplicate reconciliation matches the complete controller-reference line, not a ticket prefix. An existing matching issue must explicitly be confidential; a public/unknown match now blocks with UPSTREAM_PRIVACY_CONFLICT instead of returning a misleading private receipt. Two new regressions reproduce the former bugs; a carriage-return quick-action case is an additional positive safety control (the old multiline check already rejected it). No source change claims atomic deduplication: callers must still serialize ticket requests, and live authorization remains unverified. No deployment or real issue creation performed.
