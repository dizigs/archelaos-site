# GitHub App evidence-token staging gate (Cloudflare owner handoff) — CODE ONLY

The existing read-only Brain↔Healer metadata validator `selfheal-binding-plan.mjs` is now aligned with Brain-only PR #258, which uses a dedicated short-lived GitHub App installation token instead of a long-lived Personal Access Token.

**User-provided identities, not yet independently verified through GitHub App auth**:
- GitHub App ID `5641216`, Installation ID `179225349`.
- Expected sole repository `dizigs/archelaos-site`.
- Required minimum App permissions `Actions: Read`, `Checks: Read`, `Metadata: Read`; all others NONE.

**Expected metadata on existing `archelaos-brain-staging` Worker after verified, operator-approved setup:**
- `BRAIN_GITHUB_APP_ID` plain_text `5641216`
- `BRAIN_GITHUB_APP_INSTALLATION_ID` plain_text `179225349`
- `BRAIN_GITHUB_APP_PRIVATE_KEY` **secret_text** containing a PEM private key; the value MUST NOT be printed, stored in GitHub, sent in conversation or added to logs.
- Existing `BRAIN_GITHUB_READ_TOKEN` must **not** remain bound or be used as a substitute for the App.
- Separate `HEALER_EVENT_HMAC_KEY` (secret on Brain and on existing Self-Heal) and source-scoped `BRAIN_GITHUB_INTAKE_KEY` / `BRAIN_CAPABILITY_RECEIPT_KEY` follow their existing independent safety controls.
- Existing private `HEALER` → Self-Heal and `BRAIN_RECOVERY` → named `BrainRecoveryPort` remain required, no public route.

The validator checks supplied settings **only**, never contacts Cloudflare or GitHub, never reads secret values, and always returns `verifiedConnectivity:false`, `e2eProved:false`, `automationEnabled:false`. Even `READY_FOR_STAGING_REVIEW` is NOT proof of a live App JWT exchange or immutable receipt. Source-byte attestation, separate owner/operator approval, replay/timeout/UNKNOWN/rollback and ≤60-minute private staging are still required before any activation. AI spending and autonomous repair remain OFF.

**Ownership:** this PR touches ONLY `automation/cloudflare-brain-integration/**`. Do not modify Brain PR #258 or Guardian/Photo branches. No Cloudflare writes/deployments in this PR.
