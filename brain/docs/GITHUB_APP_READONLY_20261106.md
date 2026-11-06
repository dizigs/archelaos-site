# Private GitHub App evidence reader — default-OFF staging handoff

This change replaces the previous requirement for a long-lived `BRAIN_GITHUB_READ_TOKEN` in the **existing** `BrainRecoveryPort` with short-lived GitHub App installation tokens. It does not add a Worker, coordinator, scheduler, exposed route or GitHub write permission.

## User-supplied app identifiers

- GitHub App ID: `5641216`.
- Installation ID: `179225349`.
- Expected repo: `dizigs/archelaos-site` ONLY.
- App installation/permission scopes are **user-reported, not independently proven** until authenticated token issuance and read-only API checks succeed. The connected ChatGPT GitHub app has a distinct installation and is not evidence of this new app.

## Required Cloudflare bindings (no values in repo or conversation)

On existing Worker `archelaos-brain-staging`, after reviewed source deployment and operator approval:

- `BRAIN_GITHUB_APP_ID` — plain_text: `5641216`.
- `BRAIN_GITHUB_APP_INSTALLATION_ID` — plain_text: `179225349`.
- `BRAIN_GITHUB_APP_PRIVATE_KEY` — **secret_text**: the GitHub-generated PEM private key, not a token; must never be sent through chat, git commits or public logs.

Provision through secure Cloudflare Secret management **only after** the operator's exact source/version/rollback/readiness review. The previous `BRAIN_GITHUB_READ_TOKEN` is **NOT** needed by the new Brain source. The Cloudflare read-only eligibility checker under the separately owned `automation/cloudflare-brain-integration/**` currently still expects the old binding name and requires a **separate owner-scoped change** before this setup can be marked ready.

## Signed token exchange

1. `BrainRecoveryPort` checks existing, fail-closed staging approval, pinned exact SHA, `BRAIN_SELFHEAL_RECOVERY_ENABLED=true` and `BRAIN_SELFHEAL_BINDING_ATTESTED=true` in a private entrypoint.
2. Read the sealed PEM only inside the Worker; convert GitHub's PKCS#1 RSA PEM to PKCS#8 for WebCrypto, and create an RS256 JWT with issuer `5641216`, issued one minute ago, expiration eight minutes in the future.
3. POST to the specific installation token endpoint with a JWT, requesting exactly `repositories:['archelaos-site']` and `permissions:{actions:'read',checks:'read',metadata:'read'}`. Require HTTP 201 and independently inspect response: exactly one `dizigs/archelaos-site` repository, requested read-only permissions, and token expiring within one hour.
4. Use the returned installation token in the existing READ-ONLY GitHub evidence GETs for the particular Actions run, ruleset, and commit check runs. Tokens/private PEM are not stored in SQLite or returned to callers, and are not logged by this source.

**No new provider writes**, no personal token, no automatic repair or AI. This is a code-only candidate; true live GitHub App identity, credential validity, actual settings, and integration E2E **remain unverified** until the operator adds the private key, authenticates, and performs controlled staging tests.

## Before live use

- Complete exact-head native workerd, Node crypto, CodeQL, SonarCloud and GitGuardian checks and merge only with security review.
- Provision the PEM via the GitHub App's Credentials > Key pairs > New key, then store as a **Cloudflare Secret** with no chat/upload/log exposure. Rotate/revoke under operator control as necessary.
- Validate GitHub App ID/Installation ID and exact repository+permissions through a safe one-shot non-logging token exchange in **private staging**, plus validate all three scoped evidence GETs (not merely a 201 POST).
- Update the separate Cloudflare private-binding eligibility validator to require the App ID/Installation ID/secret metadata instead of a PAT name.
- Preserve current Brain/Healer DO, both native service bindings, exact release provenance, short expiry, zero external routes, proof/replay/UNKNOWN/rollback, zero AI/unauthorized writes. **Never activate automatic repair based only on this token.**

**Status: CODE-ONLY APP AUTH PREPARED, LIVE CONNECTIVITY BLOCKED.**
