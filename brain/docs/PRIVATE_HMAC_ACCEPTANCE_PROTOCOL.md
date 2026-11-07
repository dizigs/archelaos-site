# Private HMAC acceptance — RPC test repair

**Current code status: READY_FOR_INDEPENDENT_REVIEW (OFFLINE ONLY). Live activation: NO-GO.**

The original local checkpoint `0b8df424d82fa53206846db448a862ee37634076`
was recovered unchanged on `codex/private-hmac-acceptance`; the original tests were
not reconstructed from GitHub. Its historical failed TAP remains preserved below.

## Confirmed cause and safe correction

The exact original native suite reproduced **10/11**, including original line116.
Name/descriptor-only diagnostics in an isolated archive identified only these
non-null reads on both Service Bindings:

| Property | Actual descriptor/identity | Correct test requirement |
| --- | --- | --- |
| constructor | inherited depth1 data-function of the local SDK stub | Exact descriptor/data/constructor/prototype identity against an independent local Service Binding |
| __proto__ | inherited depth2 Object.prototype accessor; returns the local stub prototype | Exact intrinsic accessor/prototype identity, no own or prototype shadowing |
| env, ctx, nonceStore, coordinator, memory | Not local own/inherited properties; RPC access rejects | Continue to require denial on the actual remote boundary |

The earlier aggregate assertion conflated local JavaScript SDK properties with
remote RPC capabilities. This was a test-harness assumption, not a reproduced
leaked coordinator or a protocol/HMAC failure. No paid Antigravity was invoked.

Only the existing test harness changes relative to the checkpoint. Both HMAC
runtime modules remain byte-for-byte identical, as do the real Worker entrypoints,
Wrangler configs, existing ACK tests, five OFF flags and1970expiry.

The original every(Boolean) assertion remains. Its probe still checks all five
private names. It additionally verifies the exact SDK prototype/constructor shape
against an independent binding, rejecting own constructor/prototype overrides,
accessor constructors and changed prototype chains without invoking malicious
getters. This is not an unconditional name exemption or an application-data
prototype allowlist. The existing protocol's hostile input/prototype/getter checks
and HMAC mismatch/replay/timeout assertions remain unchanged.

Native negative controls prove the detector remains effective: a test-only
computed getter returns a real harmless RpcTarget, and an inherited remote getter
returns fixture data. The SAME probe rejects both exposures. Six synthetic local
shadow/prototype/getter mutations are rejected with getterCalls0. Only safe
name/own-inherited/descriptor-category diagnostics are retained; no object,
secret value or capability is printed. These controls are test strings only,
never imported into either real Worker.

## Verified local gates, in required order

1. Original unchanged checkpoint reproduced10/11; targeted descriptor diagnostics
   confirm the two local SDK intrinsics. These are expected pre-fix reproductions,
   not failures of the corrected gate.
2. Corrected dedicated native suite FIRST: **11/11 PASS**,0fail/skip/cancelled,
   31420.44ms. Public404 paths, invalid-run rejection and positive restart assertions
   that were previously unreachable now execute and pass.
3. Only after11/11: full Brain **154/154 PASS**, Healer/integration
   **117/117**, Python **17/17**, syntax **46Brain modules +Healer worker/protocol**
   PASS; runtime audit **0vulnerabilities**; Brain, Healer AND isolated-candidate
   Wrangler4.157.0 dry-runs PASS. No upload. Native tests use real workerd Service
   Bindings and SQLite, synthetic keys/data and0provider egress.

Actual before/after TAP, full regression and build logs, runtime module/test hashes
and local bundle SHA256 hashes are in `../evidence/private-hmac-final-repair/`.
The initial10/11evidence is unchanged. The candidate dry-run uses a temporary local
validation config only, not a new tracked namespace/migration/configuration.

Current main observed `edb817f5077caec5a1495be11f0f90ba66d91e02` includes the independent
#271 preflight fix; this branch preserves the supplied checkpoint ancestry.
All35open PR file lists are complete and disjoint from our files; #273's prototype
guard and #277's ACK-CWD fix remain untouched. Exact-head PR CI and its temporary
GitHub merge-tree must be identified separately from local-source evidence.
No merge, rebase, foreign-branch change or main push is performed by this repair.

## Remaining separate acceptance

The intended Draft PR is for review of source/tests only. Hosted CI/security
results and exact SHA are recorded in Issue71/PR after observing them; no prior
head or PR273 result substitutes for this gate. Numeric SonarA requires actual
corresponding-revision evidence, not inference from a passing summary. Independent
review and any strict base-freshness requirement remain release-owner checks.

No live challenge/deployment, real HMAC readback, secrets/bindings mutation, flag
activation, repair, production write or paid AI invocation is authorized. This
candidate is still NOT wired into active Workers. Live key equality/communication
is NOT VERIFIED; Service Bindings alone do not prove it. A later private staging
acceptance needs separately authorized exact-version/private-binding/isolated
namespace/rollback attestation and a short-lived private operator permit.

---

# Historical blocked checkpoint — 0b8df424 (6 November 2026)

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
