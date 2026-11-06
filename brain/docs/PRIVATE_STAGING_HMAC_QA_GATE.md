# Brain ↔ Self-Heal — private staging HMAC acceptance gate

Status: **code-only QA plan; live authenticated end-to-end test NOT VERIFIED**.

## Verified metadata snapshot (6 November 2026)

- Main code merge: `5c5401d57fda3a3d1a815c48b43f55a2741a8ded`. Do not confuse a script annotation or passing CI with a live authenticated call.
- Brain Worker: `archelaos-brain-staging`, existing private preview `archelaos-brain-qa-isolated` (`204965a6ba624184bfdfccb94794aff8`).
- Healer Worker: `archelaos-self-heal`, isolated preview `archelaos-healer-qa-isolated` (`ac43359770de4a058fd77bd4d5257226`).
- Both previews: **zero URLs, zero deployments**, no enabled observability/log forwarding. Both production Worker scripts have no public routes, cron triggers or public preview URLs.
- On the deployed **staging scripts**, `HEALER_EVENT_HMAC_KEY` is present as a secret binding in both. Matching binding names **do not prove identical values**; their values are never printed, inspected or submitted to GitHub.
- Five recovery, dispatch and durable ACK flags are OFF. Brain staging expiry is `1970-01-01T00:00:00Z`; `BRAIN_SELFHEAL_APPROVED_SHA` is absent. No recovery or AI action is authorized.

## Why existing staging cannot be used as an ACK acceptance harness

The existing `requireStaging()` in `brain/src/selfheal_signed_outbox.mjs` requires the **legacy recovery/dispatch/binding-attestation flags** set true, approved pinned SHA, a future expiry ≤ 1 hour and a Brain HMAC key of at least 43 characters. It does **not** establish key equality with Healer. `automation/self-heal-worker/src/durable_ack.mjs` requires `HEALER_DURABLE_ACK_ENABLED=true`. The existing `/v1/selfheal/dispatch` route also requires source-specific GitHub authorization and durable CI proof; it is **not a synthetic read-only QA endpoint**.

**Never turn those legacy recovery permissions ON to force a staging test to pass.** Do not send a fake CI failure to a durable ledger. Avoid public routes, global preview URLs, new dispatch authority, real repair recipes, automatic retries or a second coordinator.

## Preflight and independent review required for live synthetic QA

1. Build a **dedicated, narrowly scoped private-only synthetic protocol**, reviewed as its own change, that can attest secret equality via domain-separated HMAC challenge and fresh random nonce, with no secret-value disclosure.
2. The synthetic challenge must not call existing dispatch/recovery routes or modify the existing Brain or Healer durable state. Use isolated preview Durable Object namespaces only if durable receipt tests are explicitly approved. A mere HMAC parity proof is not a durable ACK/readback proof.
3. Deny unknown, stale, repeated or malformed challenges; no RPC capability, storage handle or unexpected method may be exposed. Avoid public access to either Worker; use an operator-authorized private runner with a finite lifetime.
4. Before runtime execution, attest exact preview versions/source hashes, preview-isolated DO namespaces, explicit service-binding targets, secret bindings and rollback targets. Explicitly test wrong-key rejection, replay, forged ACK, lost ACK, failed readback and no redelivery.
5. Terminate any temporary test surface, verify both preview URLs empty and live flags OFF, read back baseline state and attach **redacted** proof to Issue #71.
6. A successful challenge only establishes HMAC key parity; **separate persisted signed ACK/readback** and once-only settlement tests must pass before saying `CONNECTED` / `AUTHENTICATED`. Production automated repair remains NO-GO until a separate operator release gate.

## Native regression added in this PR

The `selfheal_ack.test.mjs` fixture accepts an independently supplied synthetic Healer HMAC key while the Brain test key remains fixed to `KEY`. The throwaway Miniflare Healer copy records actual command delivery attempts in persistent synthetic SQLite, with assertions that duplicate dispatches and post-restart readbacks do not redeliver. The new test proves differing synthetic keys yield `UNKNOWN`, no durable ACK, no Healer recovery, no Brain audit settlement, and no second delivery even after restart. This is **local workerd/Miniflare coverage only**; it neither reads actual Cloudflare secret values nor attests production connectivity.

No Worker source code, Wrangler flags, secrets, routes or deployments are modified by this QA-only change.
