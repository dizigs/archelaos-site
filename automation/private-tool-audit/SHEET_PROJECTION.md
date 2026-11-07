# Private Sheet LOG projection — source-only recovery contract

**State: OFFLINE / NOT DEPLOYED / NO GOOGLE SHEETS CREDENTIALS / NO SCHEDULE.**
Related to #282 source-scoped signed SQLite receipts and canonical task `S04-011`.
This is a new isolated addition: do not edit the original #282 owner's branch by hand, change Brain/Self-Heal, or enable Cloudflare bindings.

## Only one operational work journal

The existing private Google Sheet, tab `LOG` (A:R), remains the **only canonical operational journal** for task/event status. The separately authenticated SQLite receipt store is a durable **ingress spool and proof-chain source**, not another work queue, dashboard or source of task truth.

A trusted, authorized service-side caller must provide these interfaces:
- `source.list({after,limit})` returns consecutive, ascending `listAuthorized`-style receipt metadata from the authenticated private receiver, with no raw prompts or secrets.
- `sheet.findByEventKeys(keys)` performs **fresh complete H/N column readback** of the entire used canonical LOG range, returning every matching `{eventKey,receiptHash}`, including duplicates. It must not return a stale or partial cache.
- `sheet.appendRows(rows)` uses the authorized private Sheets API, only on `LOG`, appending 18 values matching A:R. It must never overwrite computed row indexes or rewrite unrelated entries.
- `checkpoint.read()` and `checkpoint.compareAndSet(before,next)` are **durable atomic** cursor+tail-hash operations, surviving restarts.
- `gate.runExclusive(fn)` provides a **durable, cross-process, fenced single-writer**. A process-local mutex is insufficient for real deployment.

The projector checks source sequence and predecessor hash, looks up every event key, appends only missing rows, then **re-reads every key and receipt hash** before advancing the checkpoint. Duplicate keys, altered hashes, missing events, gaps, failed CAS, invalid metadata or provider read failures stop the cycle **without acknowledging progress**. On a network error **after** an actual append, the next run re-reads and safely avoids re-appending that event.

## Google Sheets v4 adapter — source-only implementation

`google-sheets-adapter.mjs` now supplies the `sheet` interface above using an
**injected** authenticated Google Sheets v4 client. No credentials, scopes,
OAuth flows, service account keys, deployment bindings or live calls are in
this source tree. The trusted owner must provide `client.spreadsheets.get`,
`client.spreadsheets.values.get` and `client.spreadsheets.values.append`.

The adapter verifies the **existing private** `LOG` sheet's tab ID (default
1005), expected H/N headers and bounded grid size. For deduplication it
scans *every used bounded H:N page* and returns all matching source:event IDs
including duplicates. For writes it accepts only validated 18-column rows,
uses Google `valueInputOption=RAW` and `insertDataOption=INSERT_ROWS` in
`'LOG'!A:R`, and fails closed if provider acknowledgement is missing.
A timeout after a provider commit is **not** treated as failure-free: the
projector retries with fresh H/N readback before advancing its checkpoint.

Tests `google-sheets-adapter.test.mjs` exercise a strict synthetic provider
(client API shape and response patterns), wrong tab/schema, malformed keys,
formula-like cells, duplicate IDs, service failures and a full replay with
an intentionally lost append acknowledgement. They do **not** verify a
real Google API token, rate limits, account permissions or actual Sheets
concurrency. No real Google writes were made by these tests.

Before staging, verify sheet owner/grants, choose an authorized service
identity and minimum `spreadsheets` scope, prove there is no other writer,
and perform end-to-end **synthetic** private staging Sheet tests. Do not
send tokens or private spreadsheet rows to public GitHub logs.

## Important security limitations

- No automatic ChatGPT message interception, local shell hooks, Gemini/Antigravity producer integrations, Google credential wiring, Worker entrypoint, callback URL or live cron exists.
- The signed receiver currently accepts minimal command metadata only. Its `outcome` does not prove external deployment or operation success. Do not infer success from a PASS receipt without provider evidence.
- Every producer needs verified source-scoped identity/authorization; unknown producers are missing coverage, **not assumed OK**.
- This generic projector does **not** prove an implementation of the fencing lock, OAuth/Google Service Account ACL, true Sheet API semantics, secure checkpoint persistence or live staging. Those are independent gates; do not claim production delivery based on offline fixtures.
- The Sheet currently contains historical rows with human event IDs; the new projection IDs are namespaced `source:UUID` in column H, and the receipt hash is kept in column N. Before activation, assess H/N search efficiency, access controls, rate/quotas, target sheet validation, existing legacy writers and all concurrent append sources.
- Avoid a private-log backdoor: do not copy private Sheet rows into GitHub or external providers. Export only approved sanitized evidence; keep source secrets in provider-managed stores and never in the repo.

## Acceptance tests

`node --check automation/private-tool-audit/sheet-projector.mjs`

`node --test automation/private-tool-audit/sheet-projector.test.mjs`

Offline regression cases: replay after write-success/timeout, partial writes, duplicate keys, mismatched hash, source chain/sequence gap, formula injection, checkpoint CAS failure, overlapping writer denial, invalid adapters.

## Before authorized staging

1. Have a trusted service owner implement and independently review the production `gate`, `checkpoint`, `source` and private Google Sheets adapter with account and permission boundaries, no duplicate cron.
2. Use only synthetic receipts on a **separate private staging Sheet**, and prove dual-process concurrency, timeout-after-commit, missing receipt, stale read, restart, backup/restore and failure alerts against real provider readback.
3. Reconcile existing producers: no shared Sheet writers outside the gated single-writer route. Unknown producers -> `SYNC_PENDING` with IDs only, not silent success.
4. After explicit release/security acceptance, connect authenticated producer by producer; verify costs, retention, GDPR, audit exports, readback coverage. Production remains OFF until all gates pass.

Neither this document nor a green GitHub CI authorizes merge into `main` or Cloudflare deployment.
