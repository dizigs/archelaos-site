# Automation Bridge deployed-source attestation — 2026-11-07

This directory contains **non-secret cryptographic module fingerprints only**; it does not contain the current deployed Worker source, private legacy `worker.js`, OAuth credentials, settings values, tokens or access grants.

## Verified source lineage

- Cloudflare authenticated GET `workers/scripts/archelaos-automation-bridge/content/v2` was performed twice; the random MIME multipart boundaries and part order differ, but each of the **15 module bytes** matched across both reads.
- Cross-checked each module's `git hash-object` SHA-1 against the **pinned protected GitHub main** commit `8882f9ea224ea949f343140fd2d9f09549c87480`: **12 exact matches** under `automation/apps-script/**`; **1 expected deployed/repo divergence** `monitor-bridge.mjs` vs `automation/uptimerobot/monitor-bridge.mjs`; and **2 private-only modules** `bridge-entry.mjs` and `worker.js` without a public repository counterpart.
- Cloudflare deployment `e9da0b1c-99b4-4861-9a94-119732448ff0`, deployed version `9445de37-5465-4927-be71-a546359c5b21` at readback. A matching configured `DEPLOY_SHA` text alone is NOT executable-byte attestation.
- Repository baseline comparison is intentionally pinned. Later main changes must be reviewed, not silently treated as deployed changes.

## Local-only verification (NO network, upload, writes or deployment)

With a trusted local clone of the pinned GitHub commit:

    node automation/bridge-source-attestation/verify.mjs repo .

The repo command deliberately exits 2 with `SOURCE_RECOVERY_BLOCKED`, even if the 12 matches are correct, because the remaining three modules have not been recovered. Unexpected repo drift exits 3.

After an authorized **private** source-owner export of the installed Worker modules (preserve original bytes, nested paths and existing OAuth routes):

    node automation/bridge-source-attestation/verify.mjs private /secure/bridge-export

A full local export is `ATTESTED_PRIVATE_COPY` only if **all 15 module sizes, SHA-256 hashes and Git blob SHA-1 hashes** match. No module contents or credentials are printed, exported, posted to a public issue or included in this PR.

Tests with synthetic-only module files:

    node --test automation/bridge-source-attestation/test_verify.mjs

## Mandatory release boundary

This is a **CODE/SOURCE RECOVERY TOOL**, not HMAC parity, provider OAuth grant attestation, private RPC acceptance, durable ACK, authorized staging, deployment or production approval. Before composing PR #272 into the existing Bridge, its source owner must preserve the 15-module topology, existing `APPS_SCRIPT_COORDINATOR` DO, `AUTH_KV`, OAuth routes and all existing binding names, independently verify actual Google Apps Script receipt provenance, and obtain a separately approved private staging plan and rollback. No new Cloudflare bindings, keys, flags, schedules, deployment or repair are authorized by this evidence.

## Security gate correction (PR #281 follow-up)

The initial verifier used Git's legacy SHA-1 blob algorithm as an integrity decision. Sonar rule javascript:S4790 and CodeQL correctly blocked that design. The verifier now uses **only SHA-256** (including a second, pinned `repo_sha256` for the historic GitHub baseline). Git SHA-1 IDs remain informational source-control object identifiers in the manifest and are **never used for security decisions**. No suppression, alert dismissal or bypass was applied.
