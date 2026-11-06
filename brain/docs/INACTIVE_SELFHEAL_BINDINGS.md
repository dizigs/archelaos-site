# Inactive Brain ↔ Self-Heal candidate preparation

This follow-up starts at merged main `263b116cd6647d41ccf68d591377de55453b41f6`
(PR #262). It prepares source configuration only. It does not upload, publish,
connect, activate, migrate, rotate secrets, call AI or authorize a repair.

## Changes and preservation

| Existing Worker | Added private service binding | Preserved resources |
| --- | --- | --- |
| `archelaos-brain-staging` | `HEALER` → `archelaos-self-heal`, default entrypoint | `BRAIN` / `BrainCoordinator`, existing SQLite migration, `AI`, public GitHub App identifiers, limits and private access settings |
| `archelaos-self-heal` | `BRAIN_RECOVERY` → `archelaos-brain-staging`, **`BrainRecoveryPort`** | `HEALER_MEMORY` / `HealerMemory`, existing SQLite migration, private access and log settings |

PR #261 already preserved the Brain AI binding. No second AI binding is added.
`STAGING_EXPIRES_AT` remains `1970-01-01T00:00:00Z`; `DEPLOY_SHA` remains zero;
recovery, binding-attested and dispatch flags are explicitly `false`.
Both Workers retain workers.dev/preview OFF and no route or cron. The AI binding
is a resource declaration, not permission to invoke a model. Existing gates keep
AI, autonomous repairs and production writes OFF. Secret values are never put
in Wrangler files or this document.

The merged RPC fix is unchanged: `brain/src/worker.mjs` Git blob
`1fe5b1c57d0016657c2bda82c96eabddbedb23fd`. Only the three approved review RPC
methods are on `BrainRecoveryPort`; coordinator/staging helpers stay private.

## A reproduced local runtime blocker

Miniflare `4.20260730.0` originally used workerd `1.20260730.1`, which rejected
the Healer's unchanged compatibility date `2026-11-01` (newest supported date
reported as `2026-08-06`). The real two-Worker test failed at startup.
Miniflare 5 has a different configuration API and is not a drop-in replacement.
Keep the existing stable Miniflare API and pin its workerd dependency to
`1.20261103.1`, the **same binary version already locked by Wrangler 4.157.0**.
The lockfile deduplicates the old binaries; no unrelated package version changes
were introduced. Do not lower the Worker's compatibility date to hide the error.
The pair test now starts both Workers at their actual configured dates.

## Preventing silent binding loss

Static tests preserve the known DO names/classes/migration tags, AI, targets and
inactive defaults. They cannot prove the current private Cloudflare inventory.
Wrangler treats service/DO/AI configuration as authoritative; a partial or stale
configuration can omit additional live bindings. The pinned Wrangler's upload
implementation preserves encrypted secrets (`keepSecrets: true`), but that does
not preserve arbitrary undeclared non-secret bindings or authorize an upload.

Run the offline guard from the repository root:

```sh
python3 brain/tools/check_inactive_bindings.py --config-only
python3 brain/tools/check_inactive_bindings.py < /private/sanitized-live-inventory.json
```

The first command validates source and explicitly reports live preservation as
`NOT_VERIFIED`. The second compares an operator-supplied, authenticated,
privately retained inventory captured within 15 minutes. The JSON shape is:

```json
{
  "capturedAt": "<actual UTC readback timestamp>",
  "workers": [
    {"name": "archelaos-brain-staging", "bindings": ["<complete metadata objects>"]},
    {"name": "archelaos-self-heal", "bindings": ["<complete metadata objects>"]}
  ]
}
```

Use the full settings binding lists, not a filtered subset. DO metadata needs
`name`, `type`, `class_name`, `namespace_id` and any cross-script/environment
target. Plain-text bindings include their private `text` value for comparison;
the tool never prints values. Secret entries must contain **only** `name` and
`type: "secret_text"`: never secret values. Strip other secret metadata fields.
Provider metadata stays outside the public repository. Unknown or retyped live
bindings, duplicate names, missing namespace identity, cross-environment links,
missing baseline AI/DOs, secret-to-var conversion, and stale/incomplete input
fail closed. Explicit zero-SHA / disabled recovery overrides are intentional.

This is an offline comparison, not provider authentication, a universal wrapper
around arbitrary Wrangler commands, or permission to deploy. The offline
`offlineBindingComparison: PASS` only means the supplied rows match the source;
`bindingPreservation` and `inventoryCompleteness` remain `NOT_VERIFIED` until
independent authenticated provider completeness is proven. A baseline-only
DO/AI filtered inventory is NOT sufficient. The CLI deliberately exits nonzero
with `AUTHENTICATED_COMPLETE_PROVIDER_INVENTORY_REQUIRED`, even for a consistent
synthetic fixture. No unknown top-level resource category (such as KV/R2/D1)
may be added to these Wrangler configs: this prevents collisions with retained
secret names. `uploadAuthorized: false` and `liveConnectivityVerified: false`
remain unconditional.
Keep the inventory and its original namespace IDs for a separate post-upload
readback; source TOML cannot prove that a remote namespace was preserved.

## Validation and remaining runtime gates

Both builds are local `wrangler deploy --dry-run` only. Their "Total Upload"
line describes bundle size; it does not mean anything was uploaded. The local
Brain bundle contains the hardened `BrainRecoveryPort` and private helpers.
Local bundle hashes and real test results are recorded in `brain/WORK_LOG.md`
and the exact-head PR / Issue #71 handoff. Build bytes are not live attestation.

The new native Service Binding regression runs the two real Worker modules with
synthetic SQLite and a synthetic HMAC key. An unsigned event is denied, a signed
event reaches the expired named Brain port and is denied, and its nonce cannot
be replayed, including after restarting workerd on the same persisted storage.
No provider egress is permitted. Existing tests cover signed byte integrity,
source isolation, signed receipt readback, UNKNOWN/no automatic retry, RPC
coordinator denial and unchanged Brain SQLite after denial/restart.

**Remaining source-contract blocker for later activation:** signed source-event
ACK/readback is not a completed Self-Heal delivery ACK. The current
`attemptOneSignedSelfHealDelivery` intentionally leaves every delivery in the
existing canonical outbox as `UNKNOWN`, including a successful RPC response
(`HEALER_DURABLE_ACK_NOT_ATTESTED`). An independently authenticated, incident-bound
durable Healer readback and canonical settlement contract is still missing.
Secrets or a successful binding alone cannot close that gap. Keep UNKNOWN
non-retryable; do not accept a plain RPC response as proof or create another
ledger. A separately reviewed follow-up must use the existing ledgers/approved
RPC boundaries. This blocks operational acceptance, not offline compilation of
inactive candidates. Independent live health provenance is also unimplemented
and remains fail-closed.

**Actual inactive-version creation remains BLOCKED** until the existing release
owners review the exact final code/CI, obtain a fresh complete authenticated
Cloudflare inventory, pin current rollback versions and namespace IDs, and
approve the separate upload operation. This assignment forbids that operation.
Codex has no ready Cloudflare identity/secret binding in this environment, so
it cannot certify live settings, secret metadata or provider authorization.
No unchanged denied provider calls are repeated.

For the later integration phase, the operator must independently establish:

- `HEALER_EVENT_HMAC_KEY` metadata on both Workers and equality through a sealed
  challenge; never copy/display its value. It is distinct from other source keys.
- Approved `BRAIN_GITHUB_APP_PRIVATE_KEY` metadata and actual short-lived,
  repo-only actions/checks/metadata READ scope; source public IDs are insufficient.
- Existing source-specific GitHub intake and capability receipt signing keys,
  plus their isolation/attestation, where required by the signed dispatch path.
- Deployed executable-byte provenance including #262, the two exact named/default
  targets, preserved BRAIN/HEALER_MEMORY namespace IDs and every existing binding.
- Independent receipt readback, required-CI chain halt, UNKNOWN/replay/restart,
  rollback and zero-AI/no-production-write evidence before any future bounded
  staging approval. Health proof is still deliberately unavailable/fail-closed.

Release Captain's earlier #71 report of Brain v7 and Healer v2 is historical
operator evidence, not a new live read here. Pre-fix v8/v3 candidates must not be
promoted. **Brain–Self-Heal activation remains a separate NO-GO.**
