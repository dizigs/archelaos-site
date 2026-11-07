# Durable ACK / readback / settlement — local root-cause recovery

**Current status: READY_FOR_INDEPENDENT_REVIEW (LOCAL ONLY). Runtime activation: NO-GO.**
Recovery starts exclusively from local checkpoint `f70d645af33b7674f00fe514d42010be64bf882d`
on `codex/selfheal-durable-ack-settlement`. No push, PR, merge, upload or deployment.
The earlier failed gate is retained below as historical evidence, not the current result.

## Confirmed cause and narrow correction

The original first native assertion was reproduced in an isolated export of f70d645.
`expectedCommand` succeeds. The valid immediate ACK has nine signed own string fields,
but workerd also adds one non-enumerable function-valued `Symbol.dispose`. The exact
`Reflect.ownKeys` count therefore sees ten keys and rejects the record **before HMAC**.
The signed readback reply has the same transport decoration. This is not a demonstrated
HMAC, command-correlation, SQLite-persistence or canonical-settlement failure.

Reason-only diagnostics in the isolated temporary copy identify record shape, HMAC,
correlation, readback RPC, stored ACK authentication and settlement stages. The actual
before/after TAP is in `../evidence/durable-ack-rootcause-20261106/`. No secrets or payload
values were logged, and no diagnostic logger/error-code change is shipped in the Worker.

`selfheal_ack.mjs` now normalizes RPC transport metadata before existing authentication.
It copies only the exact signed own data fields. Unknown string fields/symbols,
accessors, altered prototypes and enumerable/accessor disposal properties still fail
closed. Only the observed non-enumerable function-valued native disposal descriptor is
permitted, then discarded from protocol data; raw RPC resources are explicitly released.
Outer ACK, readback and nested stored ACK are covered. HMAC verification, command ID,
digest, nonce/challenge/time correlation, immutable receipts, transactional settlement,
UNKNOWN on ambiguity and no-redelivery behavior are unchanged. No public RPC method,
getter, binding, migration tag or secret is added by this recovery.

## Actual recovery gates, in required order

1. Reproduced original assertion: UNKNOWN instead of ACKNOWLEDGED, before HMAC.
2. Corrected-tree dedicated native suite: **11/11 PASS**, zero failures/skips/cancellations.
   Existing assertions retained; strict metadata/accessor/prototype mutations added.
3. Only after that pass: full Brain **142/142 PASS**, Healer/integration **117/117 PASS**,
   Python **17/17 PASS**, syntax **43 Brain modules + Healer worker/protocol PASS**,
   production-dependency npm audit **0 vulnerabilities** and both Wrangler4.157.0
   **dry-run builds PASS**. `git diff --check` PASS. Native tests use real workerd
   Service Bindings and SQLite, synthetic keys/data and zero permitted provider egress.

Native coverage includes authenticated ACK plus independent stored readback, restart
persistence, exactly-once settlement/concurrency, legacy UNKNOWN migration, tampering,
forged ACK, stale/replayed readback, conflicting/duplicate commands, timeout/lost ACK,
readback error, explicit readback-only reconciliation and no automatic redelivery.
Full counts, actual TAP and source/bundle/log SHA256 hashes are in the results manifest.
The original failed TAP remains unchanged in `../evidence/durable-ack-initial-native.tap`.
An application command initially used an incorrect relative path and failed before
editing source; its subsequent run still tested the old baseline. It is not the fixed-tree
gate. The correctly applied tree is identified by hashes and the separate 11/11 TAP.

## Remaining acceptance and operational boundaries

Hosted exact-head CI, CodeQL and SonarCloud for the new local commit are **NOT RUN**:
this phase forbids push/new PR. Older main/PR results are not reused as new-head evidence.
Next: independently review this local checkpoint and unchanged security assertions;
complete separately authorized hosted CI/security gates before any publication decision.
No runtime readiness is inferred from compilation or local native tests.

All inherited activation/ACK flags remain OFF, expiry1970 and configuration files are
unchanged relative to f70d645. No Cloudflare API call, upload, version creation, deployment,
secret/binding change, production write, AI/recovery or autonomous repair activation.
Fresh authorized live inventory/attestation, namespace/rollback verification and separate
runtime acceptance remain necessary. Shared-key HMAC authenticates within the trusted
peer boundary; it does not prove physical durability against a compromised key holder.

---

# Historical stopped checkpoint — f70d645

**Status: TEST_FAILED / BLOCKED. This implementation is incomplete.**
Base main: a9072b07f981cbfddc22294efdf12015b3c9a552, after merged262/263/264.
The owner's instruction is: stop if build or security gate fails. The first new
native ACK acceptance gate completed11 tests:3PASS/8FAIL. No implementation fixes
or test reruns were made after observing that failure. No push/PR/hosted CI or
Wrangler build is attempted after the stop condition. This is a local recoverable
checkpoint, not an approved release or completed durable ACK implementation.

## Intended protocol in this checkpoint (NOT accepted)

- Existing BrainCoordinator canonical outbox remains the sole sender ledger.
- Existing HealerMemory/RecoveryLedger SQLite stores a command-receipt table;
  no new Worker, Durable Object namespace or independent dispatcher is created.
- V2 command identity is the canonical CI receipt UUID, bound to exact command
  JSON SHA256, original delivery nonce and authenticated finding metadata.
- Domain-separated HMAC scopes: selfheal.command.v1, selfheal.ack.v1,
  selfheal.ack.read.v1 and selfheal.ack.readback.v1. Existing secret material is
  referenced; no real secret is created/copied/revealed. V1 remains compatible.
- Healer writes nonce and immutable receipt together before returning an ACK.
  Exact duplicates are intended to return the same stored ACK; ID/digest/nonce
  conflicts fail closed. Receipt status is RECEIVED_NOT_EXECUTED, never repair.
- Independent fresh-challenge readback uses the existing recoveryStatus RPC;
  no additional HealerService public method/getter and no additional
  BrainRecoveryPort public method is added. Aggregate no-argument status remains.
- Canonical settlement is intended to require matching authenticated immediate
  ACK plus separately read stored ACK. Explicit mode:readback on the existing
  github-authenticated dispatch path can inspect a prior UNKNOWN command without
  redelivery; it never requests an execution retry.
- Canonical outbox schema extends UNKNOWN to ACKNOWLEDGED transactionally,
  preserving old UNKNOWN rows and leaving legacy deliveries unreconciled. Receipt
  acknowledgment is not recovery completion. Transaction rollback, unknown-schema
  refusal and concurrency are part of the proposed design.
- BRAIN_SELFHEAL_DURABLE_ACK_ENABLED and HEALER_DURABLE_ACK_ENABLED defaultfalse;
  all previous flags remainfalse, expiry1970, zero SHA and private bindings remain.

## Actual verification and blocker

Syntax: Brain43modules PASS; Healer worker/protocol node --check PASS. Initial
Healer syntax invocation used the wrong working directory; corrected invocation
passed, with no source change. This was not reported as a source build failure.

New acceptance gate:3/11PASS,8/11FAIL,0skips/cancelled. Full TAP:
brain/evidence/durable-ack-initial-native.tap.

Passed: real SQLite transactional legacy migration/idempotence/rollback unit
case; native forged/tampered command/nonce/ID conflict receipt protection case;
tracked OFF-default assertion. These do not establish end-to-end settlement.

Failed: normal native ACK path returns UNKNOWN instead of ACKNOWLEDGED;
reconciliation after restart also remains UNKNOWN in forged-ACK, altered-readback,
readback-error, lost-ACK and timeout cases; replay-readback scenario and concurrent
settlement positive assertions fail. The native legacy-upgrade subcase is not
reached after its preceding concurrency assertion fails, so native migration is
NOT verified. The Node SQLite migration test alone is not native persistence proof.

Primary observed failure: brain/test/selfheal_ack.test.mjs normal acceptance
assertion. Relevant implementation paths to inspect are
brain/src/selfheal_ack.mjs expectedCommand/verifyAck/settleDurableReadback,
automation/self-heal-worker/src/durable_ack.mjs readDurableCommand, and the
sender's fail-closed catch. The precise rejecting stage/root cause is NOT confirmed;
no unsupported diagnosis is substituted for the observed UNKNOWN result.

No broad catch was removed, no HMAC check weakened, and no expectation changed to
make the gate green. Further implementation/testing requires a follow-up after
this explicit stop. Keep all flags OFF. No Cloudflare upload/deploy/secret/binding
change, paid AI, production write or autonomous repair was performed.

## Risks requiring later independent acceptance

- HMAC proves possession within the trusted Brain/Healer shared-key boundary; it
  does not prove physical durability against a compromised authorized key holder.
  Native binding/source attestation and honest peer storage are prerequisites.
- The SQLite outbox table migration needs independent review and rollback/backup
  acceptance before any eventual runtime rollout. No DO migration tag is changed.
- Independent settlement, timeout reconciliation, restart and duplicate behavior
  remain unaccepted despite proposed fail-closed code. Do not deploy this checkpoint.
- Hosted exact-head CI, CodeQL, SonarCloud, full regressions and both Wrangler
  dry-runs are NOT RUN for this checkpoint following the failed security gate.

Brain–Self-Heal runtime activation remains NO-GO. No merge is authorized.
