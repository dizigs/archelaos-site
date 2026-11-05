# Independent AI acceptance — PR #217 (review only)

Only `automation/brain-worker-executors/acceptance/**` and
`.github/workflows/brain-builder-acceptance.yml` are owned here.

## Pin policy

`sources.json` schema v2 pins the **actual merged commit** on `main`
for #209/#214/#211/#212 and preserves the original PR head SHA separately.
The unmerged #213 uses its **exact open head SHA**. The closed-without-merge
#228 is not an accepted or checked-out source: its GitHub readback was
incorporated into the #213 branch, with additional strict outcome validation.
All 6 clean checkouts are verified against Git HEAD. Independent authenticated
read-only GitHub provenance requires a real merge timestamp, exact merge commit
and `main` ancestry for merged sources, or exact open SHA for unmerged sources.
A new merge or changed SHA means FAIL until manually re-pinned.

## Test stages

- `synthetic-contracts`: actual modules from 6 pinned checkouts, each native
  offline suite, existing cross-PR acceptance, new crash/restart and
  signed-invalid-envelope tests, and negative CI evidence contracts.
- `independent-ci-attestation`: live GET-only Github SHA, newest run, attempt,
  job and CodeQL/SonarCloud checks plus active branch ruleset contexts.
  Reports a PASS/FAIL blocker matrix in the workflow summary; returns a
  nonzero exit on any missing/skipped/failed/pending/stale check.
- **Strict acceptance gate**: eight workflows (including rebuild and axe),
  even where they are path-filtered. Never waive them. The current main
  ruleset requires ESLint and JavaScript syntax; those two do not replace the
  stricter independent gate.

## Staging E2E plan — no external billable provider calls

1. Run pinned Node22 suites with fake GitHub REST, synthetic Brain signed
   receipts, in-memory SQLite-shaped storage and injection-only model outputs.
2. Simulate Brain → Build A/B → Testing → Brain acknowledgement with the #213
   coordinator and its incorporated authenticated GitHub readback, without any real provider credential,
   dispatched GitHub write or deployed Cloudflare service.
3. Inject UNKNOWN, restart, lost ack, invalid signature, duplicate task,
   altered task scopes, overbudget, two-build capacity, missing/stale GitHub
   runs, jobs and run attempts; assert fail-closed outcomes.
4. Keep provider transports OFF and leave production unmodified. The result
   is **mock contract coverage only**, never live staging or production E2E.

## Mandatory blockers before live activation

- Real Brain-scoped signed task-intent / durable receipt readback and private
  bindings have not been attested.
- #213 prevents double budget reservations because Gemini/Gemma native adapters
  have their own reservation/settlement; the single EUR20 ledger must be
  reconciled and audited by the Integration/Brain owners.
- #228 was closed without merge; only the #213 integration SHA is canonical
  for acceptance. Its readback is stricter than the earlier #228 snapshot.
- No verified GitHub draft writer and end-to-end exact-SHA 8-workflow proof.
- Provider entitlement, live cost/FX and staging-only Cloudflare binding
  attestation are missing. No paid calls, merges, forced updates or deploys.
