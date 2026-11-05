# Implemented tests and explicit non-claims

Authoritative execution counts come from the actual Node TAP summary/check
annotation, plus the separate Python provider tests. Do not treat this checklist
or a mock return value as a successful live source integration.

| Area | Actual offline/runtime acceptance |
|---|---|
| Intake | HMAC/path/time/body binding; invalid/stale signature, oversized/malformed envelope, source spoofing and private fields rejected before enqueue |
| Durable queue | Native `workerd` SQLite receipts/alarms, ten concurrent duplicate deliveries, content/revision conflicts, retained envelope, restart and one logical job |
| Retry/DLQ | One injected transient failure then success, three-attempt DLQ, quarantine for unsupported event classes |
| Kill switch | Operator/source separation, revision conflict, health-checked explicit resume, persisted global pause across runtime restart, per-source stop, pause while claimed, paid-AI resume denial |
| Drive | Authentic channel/scope/expiry, authoritative cursor, no fake job on channel sync, removal held for review, successful durable receipt before checkpoint, crash after delivery before checkpoint, runtime restart and source lease recovery |
| Gmail | Verified OIDC port and pinned mailbox/subscription/label, history/page-token distinction, covered notifications ignored, history expiry blocked without skipping messages |
| Contributions | Independent committed receipt, consent and clean scan, private review for release; client callback is not authority |
| GitHub | Raw HMAC and immutable repo scope, technical-only metadata, tampering/repo mismatch rejected |
| Content | Authorized read, real byte hash, structured/injected PDF extraction boundary, independently approved facts, canonical identity, organization attribution, provenance/date checks, no prompt-instruction authority |
| Actual PDF text | Real synthetic PDF parsing, nonexecution of embedded scripts, limits/malformed/textless handling, approved exact-quote mapping and independent whole-file privacy approval; no OCR/model/remote call |
| Canonical output | Four target sections, concurrent SQLite draft dedupe, restart, preview→result updates same draft, stale-preview block, existing-event update plan |
| Full prepared workflow | Authenticated synthetic Drive wake-up→actual native queue→retained envelope→verified extraction→SQLite draft/work journal→exactly one explicitly mocked PR, concurrent consumers and replay suppressed |
| AI costs | Shared integer microEUR/month ledger, atomic concurrent multi-provider reservations, 75/90alerts, pricing/model/FX/fees/coverage denial, one-time call claim, settlement, month attribution, timeout reservation hold, alert/storage failure before synthetic call |

## Crash-consistency boundaries from P5-CRASH-CONSISTENCY-v1

- P5C01: injected stop inside receipt transaction before commit returns no ACK;
  rows roll back; restart/redelivery creates one receipt/job.
- P5C02: injected stop after commit before response returns no ACK; fresh runtime
  redelivery recovers the same durable receipt, no second job.
- P5C03: source bridge throws after native queue commit before cursor checkpoint;
  fresh runtime replays the page, gets the same job and then checkpoints.
- P5C04: injected stop after durable RUNNING claim, fresh runtime and explicit
  synthetic lease expiry reach one logical completion with bounded attempts.
- P5C07: real content PR creation is disabled. The synthetic publisher tests
  stable-ID create/reuse only; a real ambiguous GitHub-create outcome remains a
  live integration/reconciliation gate.
- P5C05/06: real private tracker write/readback is BLOCKED, not tested as a live
  Sheet update. No claims that a public handoff updated the private tracker.
- P5C08/09: existing protected GitHub and exact-SHA Cloudflare verifier remain
  unchanged. This PR does not merge/deploy candidates or claim remote staging.
- P5C10: deterministic event keys, SQLite canonical draft dedupe and stale-preview
  handling are tested. Conflicting/unverified identities/facts remain private.
- P5C11: reserved/claimed calls with unknown outcome are not retried or refunded.
- P5C12: removal notifications never silently delete historical content; ambiguous
  provider ordering requires private reconciliation.

Test fault-injection endpoints/flags require private Durable Object access and
`TEST_BUDGET=true`; the checked-in deployment config enables none of them. The
public Worker has no test, budget-execution, PDF-upload or publication endpoint.
Live services have not been activated. AI outputs are digests/private review,
never independent factual evidence. No actual invoice/price/provider is fabricated.
