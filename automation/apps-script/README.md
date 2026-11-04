# Existing Automation Bridge — Apps Script editing capability

Implementation package for the existing PR124 and existing
`archelaos-automation-bridge`. **Not a second Worker, deployed route or proof
that this ChatGPT session has a callable connector.** Current production source
and credentials are not copied into this package.

## Implemented, tested boundaries

- Scoped Admin authorization-code flow: `openid email script.projects`, PKCE-S256,
  nonce, state/browser binding, atomic one-time state consumption, RS256 Google
  issuer/audience/expiry/nonce validation, exact configured verified Admin email.
  Granted scopes come from Google's token response; missing script permission or
  unexpected broader Google scopes fail closed. Data Access settings alone are
  never treated as a grant.
- Existing Google client/state secrets are used only server-side. HKDF-separated
  AES-GCM contexts encrypt state, access/refresh grants and complete private code
  snapshots. No credentials are returned in JSON, logged or placed in public
  artifacts. The existing bridge's other secrets, including its UptimeRobot key,
  are neither queried nor copied.
- Bounded refresh, same-principal verification, original verified scope retention
  only when RFC6749 permits an omitted refresh scope, single durable refresh claim
  and no blind retry after uncertain outcome. Browser sessions last8h; an approved
  executor may use the bound Admin grant for at most30days, then fresh consent is
  required. Revoked/narrowed/foreign grants fail closed.
- Actual Google API transport for `projects.get`, `projects.getContent` and
  `projects.updateContent`. Fixed provider/project binding, private Bearer header,
  bounded responses/timeouts, redirect refusal and no automatic retries.
- Every write/rollback requires verified Admin/executor rights, complete current
  code/manifest, base hash, immutable private encrypted backup with readback,
  reviewed before/after hashes, trusted exclusive-writer lease, verified trigger
  inventory, atomic project/operation lock and exact full-collection readback.
- New `.gs` files are represented as API `SERVER_JS` files without extension.
  Existing `Code`, `MuseumApprovals`, `CloudflareBridge`, `appsscript` and all
  unrelated HTML/other supported files remain present. Ordinary edit requests
  cannot delete files or change the manifest. Explicit rollback restores a known
  complete snapshot and first backs up the full current state too.
- Stable operation IDs, conflict rejection, durable unknown-outcome holds across
  restart, read-only reconciliation and no duplicate PUT on replay. Reconciliation
  only confirms an observed intended result; it does not assume an unobserved
  write failed or retry it under a new ID. Audit records contain opaque IDs/fixed
  codes/statuses, not source, tokens, email or private project IDs.
- Hard journal/backup bounds fail closed instead of silently deleting history:
  1000 operations,64 immutable snapshots,32MiB ciphertext. Archival/retention needs
  an explicitly reviewed private-storage procedure, not an automatic paid upgrade.

## Mount contract — existing Worker only, not yet applied

`configureExistingBridgeScripts` composes the modules for the existing Worker's
**authorized private SQLite coordinator context**. Missing optional integration
configuration fails new routes closed while leaving original health/auth/ping
routes delegated unchanged. No Wrangler entrypoint/config, namespace creation,
subscription or secret deployment is included.

Bindings/configuration must be supplied privately after inspection of current
live source: existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`OAUTH_STATE_SECRET`; private exact `APPS_SCRIPT_PROJECT_ID`,
`APPS_SCRIPT_PROJECT_TITLE`, `APPS_SCRIPT_ADMIN_EMAIL`; verified atomic storage.
No real account/project identifiers or keys belong in public examples.

The existing authorized source maintainer must inspect/preserve its entrypoint,
PKCE/state/session/HMAC conventions and mount this extension before the original
router, delegating `null` responses. Legacy OAuth callbacks remain delegated;
new script-flow state uses `as_`. The registered callback remains the existing
`/oauth/callback`. The scoped login path is `/auth/start?purpose=apps-script`;
**do not send the owner there until actual deployment and callback verification**.

The required `authenticateExecutor` port must independently verify the existing
request signature/identity, exact method/path/body, project/task capability and
least-privilege rights. A global ping key or body-supplied `verified`/Admin claims
is insufficient. Grant scopes/principal are replaced with the actual stored,
verified Admin grant. `editorFor` binds access privately; the supervisor never
needs to copy browser cookies or Google tokens into a work order.

`policy.liveWritesEnabled` defaults OFF. Trusted review/exclusive-writer/trigger
ports cannot be enabled by a submitted JSON body. No live versions of those
ports, authorized deployment identity or ChatGPT connector were available in the
implementing session. This is **not** a claimed ready-to-use ChatGPT tool.

## Narrow HTTP interface after verified mount

| Route | Purpose |
| --- | --- |
| `GET /api/apps-script/content` | Private complete file/manifest read with current hash |
| `POST /api/apps-script/backup`, body `{}` | Complete private snapshot with opaque receipt/hash |
| `POST /api/apps-script/changes` | `{operationId, expectedBaseHash, changes:[{name,source,create?}]}` |
| `GET /api/apps-script/operations/{operationId}` | Actor/project-scoped outcome receipt |
| `POST /api/apps-script/reconcile`, body `{operationId}` | Read-only uncertain-outcome reconciliation |
| `POST /api/apps-script/rollback` | `{operationId,expectedBaseHash,backupId}`; full current backup first |

All responses are `no-store`; mutations require JSON and a verified executor.
The original health, ping and ordinary login routes are not changed by a library
being present in GitHub. No delete-project, arbitrary-URL or trigger API exists.

## Concurrency and backup limitations that must remain explicit

Google's `projects.updateContent` replaces the whole file array and has no
advertised atomic ETag/If-Match precondition. A private project lock and double
read/hash check serialize bridge callers and detect observed external changes;
they cannot exclude a simultaneous Google IDE/other-client edit by themselves.
Live writes therefore require a trusted, unexpired exclusive maintenance/writer
capability covering those other writers. Without it, refuse before PUT. Do not
claim perfect cross-client CAS from a pair of reads.

The full backup covers **all API-returned source files, manifest and available
project/content metadata**. `getContent` does not return Script Properties,
installable-trigger inventory or execution history. Those are not claimed backed
up or functional from a source snapshot. The implementation never invokes their
mutation APIs. A trustworthy existing read-only diagnostic/authorized operator
must verify inventory and actual recent trigger operation; no extra scope,
`scripts.run` deployment, new trigger or rerun of `syncMuseumContributions` is
silently enabled. Synthetic trigger fingerprints are not real trigger evidence.

KV get+put alone cannot supply atomic operation/state claims. An approved SQLite
DO or equivalent actual atomic private store is required; free-plan entitlement,
binding/migration and scoped deployment/log permissions must be verified before
installation. No additional Worker or paid plan is authorized by this package.

## Real rollout acceptance (NOT EXECUTED yet)

1. Obtain authorized existing Worker source/mount and deployment access without
   exporting private code/secrets; audit current deployed version/rollback.
2. Review/mount the tested capability in that Worker and verify actual deployment
   and callback behavior with real provider logs, preserving every original route.
3. Only then provide the scoped login link for one designated Admin consent.
   Verify actual issuer/audience/email/granted scopes and refresh with no secrets
   in logs. Merely enabling the API or configuring a consent-screen scope is not
   successful OAuth.
4. Use exact private project binding to read all live files/manifest. Create and
   privately verify a complete snapshot. Verify Properties/trigger preservation
   via authorized diagnostics; do not publish source/IDs/filenames from the
   private project into GitHub logs.
5. With trusted review and exclusive-writer prerequisites satisfied, create one
   harmless comment-only test file, read it back, then roll back from the verified
   snapshot with a new operation/current base hash. Confirm unchanged trigger
   inventory and actual previous automation success without re-running it.
6. Separately prove the real ChatGPT/approved executor can authenticate, submit
   the bounded operation and read the receipt. A browser session, OpenAPI document
   or Worker health response alone does not establish a callable ChatGPT tool.

## Actual tests

`node --test --test-reporter=tap --test-concurrency=1 tests/apps-script/*.test.mjs`
currently runs39 cases using actual persistent SQLite, actual AES-GCM/HKDF and
RSA signature validation, and explicitly **synthetic** Google transport, sources,
accounts and triggers. Covers full-file preservation, backup/rollback, stale and
concurrent operations, restart/uncertain outcomes, scope/identity rejection,
refresh/replay and private HTTP composition. No real Google script was read,
backed up, edited or restored by these tests.

Existing Python provider/bridge guards and the new fixed source-audit helper run
in the same existing workflow; no extra scheduler is added. Real source audits
keep code in runner memory and emit only fixed presence flags/module hashes.
Literal presence does not prove live request semantics, grants or deployment.
