# Private Brain ↔ Self-Heal HMAC acceptance — blocked local checkpoint

**Status: BLOCKED / TEST_FAILED. Not accepted, not deployed, no live key-parity proof.**

This source-only candidate continues merged #265/#268 from main
`e4fe97715acfd4b4f3394345086411b6d8de0534`. It is NOT imported by either existing
Worker, and changes no existing Wrangler configuration, flag, secret or binding.
The owner's earlier instruction “Σταμάτα σε οποιαδήποτε αποτυχία security gate”
applies: implementation, reruns, full checks and publication stopped at the first
observed failing native security gate. No Draft PR is created after that stop.

## Intended isolated protocol (not accepted for live use)

Two dedicated named entrypoints in `private_hmac_candidate.mjs` expose only
`BrainHmacAcceptancePort.runChallenge()` and
`HealerHmacAcceptancePort.answerChallenge(request)`. Helpers/stubs stay module-private.
No existing recovery/dispatch method, incident, canonical receipt or outbox is used.
The default HTTP handler returns404; no route, cron, fetch transport, GitHub token,
recovery/AI function or production binding is available to this candidate.

The candidate has an isolated SQLite anti-replay Durable Object class, not a
second canonical coordinator/ACK ledger. No namespace/migration is registered in
tracked Wrangler configuration or created remotely. Native tests allocate temporary
workerd namespaces only. Future use must be restricted to the already-existing QA
preview targets, with independently verified isolated storage and private bindings;
never bind either canonical Brain/Healer namespace. Do not replace or deploy the
candidate as the default main of an active Worker.

1. Operator-approved isolated session: random UUID, exact source SHA matching
   DEPLOY_SHA, explicit start/end with maximum5minutes, fixed peer identities.
   The candidate is unusable without these separate acceptance parameters.
2. Existing Brain recovery/binding-attestation/dispatch/ACK flags and Healer ACK
   flag must remainfalse. Brain STAGING_EXPIRES_AT must remain1970. No legacy
   permission is enabled to make a synthetic test succeed.
3. Brain generates a fresh256-bit cryptographic nonce and a <=10second challenge.
   Request domain `archelaos.private-hmac.challenge.v1` binds schema, session,
   source SHA, sender/audience, nonce and exact issue/expiry times.
4. Request HMAC uses HEALER_EVENT_HMAC_KEY internally; no value is returned,
   stored, printed, copied or inspected. Peer checks exact own scalar data fields,
   HMAC, session, version, peer identity and time. Accessors/prototypes/unknown
   fields/symbols are rejected; only verified workerd Symbol.dispose metadata is
   normalized, without invoking a getter or relaxing authenticated protocol fields.
5. Atomic SQLite nonce claim precedes the Healer answer. A repeated authenticated
   challenge cannot produce a second signed answer, including after restart.
   Store holds only session/nonce/challenge digest/outcome/expiry, never keys,
   incidents or signed transcripts; at most16unexpired entries, no alarms.
6. Response domain `archelaos.private-hmac.response.v1` binds the original full
   challenge digest, nonce, session, source, peer identities, times and key-possession
   verdict. Brain independently verifies it and atomically finalizes only its
   isolated nonce record. A whole valid stale response cannot attest another nonce.
7. Single RPC attempt,1500ms timeout, no automatic retry. Failure, forged response,
   wrong key, absent binding, expiry or uncertain state returnsUNKNOWN. Public
   result contains only status/session/source/digest/actionsExecuted0.

A successful exchange is evidence of possession of matching effective HMAC key
material under trusted-source/runtime assumptions, not a mathematical proof of raw
secret-byte identity or proof against a compromised peer. Secret-name presence,
metadata, source pins and Service Binding declarations alone establish no live
key match. This parity protocol cannot attest durable ACK/independent receipt
readback/canonical settlement, and cannot authorize any repair or production write.

## Actual first gate and stop

- Syntax46modules PASS.
- Dedicated suite11tests: **10PASS /1FAIL /0skipped /0cancelled**,27800.24ms.
- Failing native case: matching-key private binding/security-boundary test,
  `brain/test/private_hmac_acceptance.test.mjs:116`:
  `assert.ok((await f.call({op:'probe'})).every(Boolean))` expectedtrue, actualfalse.
- Before that assertion, the same case successfully observes synthetic HMAC proof,
  one Brain VERIFIED nonce and one Healer ANSWERED nonce, oneRPCattempt, no alarms
  and actionsExecuted0. It then fails the RPC visibility assertion. Later public-HTTP
  and restart assertions in THIS case are NOT reached; do not claim that case passes.
- Probe inspects env/ctx/nonceStore/coordinator/memory/constructor/__proto__ on
  both private ports. It records booleans only. The exact offending property and
  whether it represents local stub-prototype behavior or real remote exposure are
  **NOT CONFIRMED**. Do not call it an established coordinator leak or a harmless
  false positive without a follow-up reproduction.
- Other actually passing cases cover domain/session/nonce/time/key checks, hostile
  field/getter/prototype input, disabled permit gates, wrong-key denial before Healer
  persistence, replay+concurrency across restart, forged response, timeout, missing
  binding, stale-response cross-nonce rejection, forged request with unchanged
  SQLite/alarm state and bounded nonce capacity. Zero provider egress is asserted.
- Actual full TAP, syntax and source hashes: `../evidence/private-hmac-acceptance-initial/`.
  No assertion weakened, failing case skipped or source correction/rerun after stop.
- Full regressions, Wrangler dry-runs, hosted exact-head CI, CodeQL and Sonar for
  this new checkpoint NOT RUN after the failed gate. Prior #265/#268/main checks
  are not relabelled as this candidate's acceptance.

## Actual Cloudflare evidence and remaining prerequisites

This executor has no ready Cloudflare credential/outbound identity and the enforced
host allowlist excludes api.cloudflare.com. No denied call is repeated or bypassed.
No fresh active-version read, secret lookup or live challenge was attempted.

Connected-owner handoff #71/6695650463 reports (at its own readback time):
- Brain active e565910f-bbb4-44f6-b0b5-3463906ce495.
- Healer active65b729ea-c5c2-4118-8632-9d37e615d0cb.
- Secret binding names present, five flagsOFF, Brain expiry1970; real key equality
  and signed private E2E not verified. These are attributed metadata, not our fresh
  verification. Main's later test-only merge does not deploy new executable bytes.

Next follow-up must first identify the precise failing RPC property in a temporary
native diagnostic, without exposing env/secrets/capabilities. Fix a real exposure
or establish a justified precise local-vs-remote property distinction while retaining
all meaningful boundary assertions. Then rerun this suite, full native/security
regressions, syntax and no-upload builds. Only after passed gates publish the one
intended Draft PR and obtain independent review, exact-head CodeQL and explicit
Sonar security_rating/new_security_rating1.0(A) evidence for that PR revision.
The Sonar host is also outside this executor's current allowlist; prior268A is not
this new checkpoint's A. Source mergeability/required checks are not yet a PR fact.

Live testing requires SEPARATE operator approval, fresh authenticated active and
preview version/source/namespace/binding attestation, zero public URLs/routes,
short-lived private runner authorization, existing secret retention without copies,
and verified rollback. After an approved future run revoke the temporary permit,
remove temporary test bindings, confirm both preview URLs remainempty, all five
flagsOFF/expiry1970, and no canonical-state/namespace/secret changes. No live code
upload, Worker creation, secret/binding change or activation is authorized now.
