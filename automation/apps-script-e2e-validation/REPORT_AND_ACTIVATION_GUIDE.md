# ARCHELAOS — Team 2 Apps Script E2E validation

## Status: SYNTHETIC ONLY / OFF / NOT DEPLOYED

This independent module corrects unsafe aspects of the submitted Gemini draft.
It has no Google transport, Worker entrypoint, cron, AI API connection, or
production writer. It never accepts arbitrary Google-shaped clients for writes.

## Security review of Gemini proposal

1. Original SIMULATION could use a live injected gasClient and call a real PUT.
   Corrected: the E2E lifecycle accepts ONLY an internally minted, in-memory
   synthetic client. Live CLI requests are refused even if environment approval
   flags are supplied.
2. The Google Apps Script project API does not expose complete cross-account
   triggers. Trigger inventories here are synthetic fixtures, not Google proof.
   A local lease or last editor metadata cannot exclude external IDE/API writers.
3. Original reconciliation automatically restored a backup after unknown PUT,
   bypassing fresh signed approval and exclusive-writer proof. Corrected:
   reconciliation is strictly READ ONLY and returns an explicit hold for a
   separately authorized PR #124 operator.
4. Project hashes preserve original source bytes including CRLF.
   AES-256-GCM backup binds the project and snapshot digest to authenticated
   associated data. The in-memory backup is NOT durable production storage.
5. In-memory operation journal supports restart modeling only through an
   explicit synthetic checkpoint; real production durability is the existing
   PR #124 SQLite Durable Object, not proven by these tests.
6. OAuth here validates test fixture metadata only, not Google's live issuer,
   audience, signature or refresh token; reuse the existing Admin grant from
   PR #124 without requesting an additional OAuth scope.
7. Local Brain diagnostics are NOT PR #201 events or live Brain receipts.
   PR #111 does not yet accept the apps_script source; live dispatch is refused.
8. Test HMAC signer cannot be treated as independent real approval. Live signed
   execution must use the separately reviewed, existing PR #124 writer.

## Scope

New files under automation/apps-script-e2e-validation/ only, plus
.github/workflows/apps-script-e2e-validation.yml. Do not edit PR #201, #203,
#202 or the separately owned Brain PR #111.

## Verification

Run locally:
- node --check automation/apps-script-e2e-validation/harness.mjs
- node --test automation/apps-script-e2e-validation/e2e-validation.test.mjs
- node automation/apps-script-e2e-validation/live-verification-runner.mjs
- node automation/apps-script-e2e-validation/live-verification-runner.mjs --live

The last command MUST fail. CI runs on PR and manual dispatch only, no schedule.

## BLOCKED before live use

- Independently establish complete cross-account trigger inventory and external
  IDE/API writer exclusion, not caller supplied verified flags.
- Confirm full private encrypted Google source backup/readback, immutable
  reviewed diff, approved signed command digest, and exact project identity.
- Perform one narrowly authorized, comment-only smoke using the existing
  signed PR #124 writer; independent provider readback; separate approved
  rollback with second readback. No automatic retry.
- Add genuine apps_script source support to central Brain and authenticated
  private Service Binding with durable receipt and replay rejection.
- Verify exact-head GitHub CI/Sonar and actual Cloudflare provider logs.
  Passing simulated tests does NOT establish any Google production operation.

No Google writes, no new secrets, no new costs, no production deployment.
