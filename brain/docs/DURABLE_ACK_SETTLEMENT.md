# Durable ACK / readback / settlement — STOPPED CHECKPOINT

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
