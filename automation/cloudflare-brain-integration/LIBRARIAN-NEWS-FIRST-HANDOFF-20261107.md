# Brain → Librarian: published-news command readiness review

**SOURCE ONLY / FAIL-CLOSED / NOT CONNECTED / NO PROVIDER CALL / NO LIVE IMPORT.**
Updated 7 November 2026 after the independent advisory and direct public-source inspection.

## Corrected contract (version 2)

The existing #194 source is a COMMAND CONSUMER. Its default WorkerEntrypoint exposes
`importPublishedNews({newsId,authorization})` and separately `importApprovedPdf`.
It does not prove a `news.search.completed` publisher implementation.

This PR proposes a future `LIBRARIAN_PRIVATE` service binding on the CALLER
`archelaos-brain-staging`, targeting existing `archelaos-librarian-staging`.
The name is a proposal, not evidence of an installed binding. No reverse
`BRAIN_PRIVATE` binding on Librarian is required for this command direction.

Directly inspected #194 HEAD: `634a6b2059b27e95c6fe77329320d3b9c17ab1f9`:
- `automation/librarian/src/index.mjs`: `importPublishedNews`, `#authorize`,
  `#submit`, `LibrarianLedger`.
- `automation/librarian/src/core.mjs`: `verifyCaller`, `consumeCallerNonce`.
- `verifyCaller` uses key ID `librarian-news-v1`, scope `news` and
  `LIBRARIAN_NEWS_CALLER_KEY`; HMAC covers
  `scope + "\\n" + subject + "\\n" + requestId + "\\n" + timestamp`.
- `consumeCallerNonce` reserves a requestId-derived key in the EXISTING Ledger
  before provider operations. Its private transport uses `LEDGER_INTERNAL_KEY`.
- These are source observations, not proof the installed Worker runs these bytes.

## Pure review checker

`assessLibrarianNewsReadiness` retains its export for the existing test entrypoint,
but accepts only explicit v2 Brain→Librarian command evidence. Legacy publisher
fields and reverse caller binding cannot qualify. This intentional fail-closed
input change must be reflected by future consumers.

The checker requires:
1. Existing canonical Brain and Librarian Ledger preservation.
2. Exactly one proposed caller-side binding; reject duplicate names/aliases.
3. Actual command signer/verifier and Ledger secret METADATA, never secret values.
4. Independently attested exact source/executable identities for BOTH services.
5. Trusted command authorization, durable nonce and audit proofs.
6. Separate signed result/readback and command-vs-receipt trust-domain evidence.
7. A finite staging window ≤60 minutes and explicit owner/operator approvals.
8. All news/archive/probe flags remain literal false during this review.

The #194 inspected source does NOT demonstrate the required signed command result
and source-scoped durable readback contract. This remains an explicit BLOCKER;
the checker does not implement it or invent a receipt key/API.
Metadata attestations are trusted reviewer inputs, never authorization from HTTP.

Even a fully synthetic passing fixture always returns:
`connected:false`, `authenticatedE2EVerified:false`,
`runtimeActivationAuthorized:false`, `privatePdfReadAuthorized:false`,
`notebookWriteAuthorized:false`, `liveImportEnabled:false`.
A passing preflight is not an import capability. A real import would call
NotebookLM; do NOT invoke one merely to prove the contract.

## Historical provider evidence — not remeasured by this patch

Earlier read-only audit reported Librarian version
`d291424c-05fd-42df-b5b3-0891339ef658`, existing LEDGER only, import/probe flags OFF.
Brain version `e565910f-bbb4-44f6-b0b5-3463906ce495`, configured SHA
`5c5401d57fda3a3d1a815c48b43f55a2741a8ded` (not executable proof), expiry 1970.
No new Cloudflare read/write or private Drive/PDF/Notebook operation occurred here.

## Evidence and next gate

7 Nov 2026 local Node v24.22.1:
`node --test librarian-news-readiness.test.mjs` — 12 PASS, 0 FAIL.
Includes rejecting the old event-producer contract and consumer-side reverse binding,
wrong command scope/method/principal, duplicate bindings, absent auth/nonce/readback,
missing source identities, expired windows and enabled import flags.
The suite remains imported by existing `binding-plan.test.mjs`; no new workflow.

Hosted CI must pass on the NEW exact PR head before independent review.
#281 lineage → #272 integration remain separate prerequisites in the agreed rollout;
#194 owner must reconcile source and implement missing receipt/readback proof before
future authenticated staging acceptance. Keep provider imports OFF.
No merge, deployment, secret provisioning, production flag or new scheduler is authorized.
