# Existing Automation Bridge — Apps Script editing capability

Implementation package for the existing PR124 and existing
`archelaos-automation-bridge`. **No second Worker. A guarded mount is now deployed to the original Worker, but this is NOT proof that Google Apps Script editing or a ChatGPT executor is available.** Current production source
and credentials are not copied into this package.


## Live guarded infrastructure status — 2026-11-04

Cloudflare deployment **b7779fd1-79d5-4e63-a89f-fda6063b8e40** / version
**ac855fe8-298b-46aa-bcef-b83bc213731d** installed the eight reviewed PR
modules plus a small entrypoint wrapper alongside the unchanged private legacy
`worker.js` inside the SAME Worker. SQLite Durable Object migration
`pr124-apps-script-sqlite-v1` created `MuseumScriptCoordinator` and binding
`APPS_SCRIPT_COORDINATOR`; the existing KV and all preexisting secret binding
names were preserved. The prior Worker version remains available for deployment
rollback. Fresh external GET `/health` HTTP 200; new GET
`/api/apps-script/content` HTTP 503 with
`SCRIPT_PRIVATE_CONFIGURATION_REQUIRED` intentionally fails closed.

**Private project bindings configured (2026-11-04):** The connected
Admin Google Drive metadata verified the designated Apps Script project
(MIME `application/vnd.google-apps.script`) and ownership, without exposing the
Script ID in this repository. `APPS_SCRIPT_PROJECT_ID`,
`APPS_SCRIPT_PROJECT_TITLE`, and `APPS_SCRIPT_ADMIN_EMAIL` were added as
Cloudflare secrets by one bulk patch. Version
`d95999ce-f3cc-45f4-b7c5-ae390824d477`, deployment
`fefbf0ef-0505-4d77-8b37-6c44f51104d7`. Legacy secrets and bindings were
retained. External `GET /health` returned 200, protected
`GET /api/apps-script/content` returned 503
(`EXECUTOR_INTERFACE_UNCONFIGURED`), and a synthetic invalid state callback
returned 401 (`OAUTH_STATE_EXPIRED_OR_REPLAYED`). These are guarded runtime
checks, **not successful Google OAuth or Apps Script API access**.

**Still blocked / not verified:** reviewed project-scoped executor, actual
Google Admin consent/refresh grant, Google project-source read and backup,
real trigger inventory, writer exclusion, Google edits and rollback,
ChatGPT executor callability. `liveWritesEnabled` is still false. Do not issue
a Google consent URL until the trusted executor/callback prerequisites are
reviewed. No Google project was edited, no additional Worker or trigger was
created, and no paid-plan upgrade occurred.

Detailed operator evidence: `docs/automation/evidence/pr124-cloudflare-guarded-deployment-20261104.json` and `docs/automation/evidence/pr124-private-script-binding-20261104.json`.

## Google OAuth exchange compatibility repair — 2026-11-04

After the designated Admin attempted consent, the real callback returned
`GOOGLE_TOKEN_EXCHANGE_UNCERTAIN`. Source review and current Cloudflare docs
confirmed that Workers does **not** implement `redirect: 'error'`; it throws a
`TypeError` before the outbound provider call. Native ambient `fetch` also
rejects invocation with an arbitrary instance receiver. The three private
Google transport modules were corrected to use `redirect: 'manual'`, explicit
fail-closed rejection of all 3xx statuses, and receiver-safe fetch closures.
Synthetic regression tests cover Google token exchange and project transport.
No redirect is followed or Google token/secret exposed.

Reviewed source head: `48b0dfbd30258ec362286353e45dd1fb3edbad16`.
Cloudflare deployed the repaired modules to the same Worker as
deployment `258b87f7-409c-42ff-a11f-48768e7b6aba`, version
`c2a77e6b-ab1f-4f56-8dd7-9f239a707902`; the previous version
`d95999ce-f3cc-45f4-b7c5-ae390824d477` is retained for rollback.
Worker metadata readback verified existing bindings and 10 deployed modules.
Fresh tests: `GET /health` HTTP 200, unauthenticated content GET HTTP 503
(`EXECUTOR_INTERFACE_UNCONFIGURED`), synthetic invalid OAuth state HTTP 401
(`OAUTH_STATE_EXPIRED_OR_REPLAYED`). The prior Google auth-code was consumed
on the first attempt; **do not replay it**. A new user-driven consent is needed
to verify the actual Google token exchange and scopes.

This is a verified deployment of the transport **fix**, not verified successful
Google Admin OAuth or project-source access. Live Google writes remain OFF, and
the trusted scoped executor port is still absent. Evidence:
`docs/automation/evidence/pr124-oauth-exchange-fix-20261104.json`.

## Verified Admin grant and browser-only project read probe — 2026-11-04

The designated Admin's browser callback returned `ADMIN_SCRIPT_GRANT_VERIFIED` with
`openid`, `https://www.googleapis.com/auth/script.projects`, and
`https://www.googleapis.com/auth/userinfo.email`. A read-only Cloudflare
SQLite Durable Object query confirmed **one** grant row, **one** encrypted
session row, and **zero** Google edit operation or private backup rows. No
token, cookie, Google source, or ciphertext was exported.

A narrow `GET /api/apps-script/verify` route is deployed on the SAME Worker:
it requires the existing Admin's `__Host-` session cookie; validates the
stored Admin identity/scope; calls Google projects.get and getContent **GET
only**; verifies the exact configured project identity and complete file
collection; and returns only `status`, boolean checks and `fileCount`.
It never returns token, project ID, source or private metadata. This route
does not authorize any editor action or bypass the separate signed executor.
Any missing/invalid cookie is rejected; all Google writes remain OFF.

Deployed Cloudflare version `1b5a504e-66c7-411a-8ac6-e7f774362599`,
deployment `14c450f7-b168-4a10-8ffb-0b8be5cbb116`, with previous
version `c2a77e6b-ab1f-4f56-8dd7-9f239a707902` preserved for rollback.
External checks: health GET200; anonymous verify GET401
`OAUTH_COOKIE_REQUIRED`; regular private content GET503
`EXECUTOR_INTERFACE_UNCONFIGURED`. **A real authenticated Google GET has
not been exercised yet**: the user must open the verify URL in the same
browser where Admin consent succeeded. No successful Apps Script source read
is claimed until its status is confirmed.

Evidence:
`docs/automation/evidence/pr124-admin-grant-readonly-verifier-20261104.json`.

## Browser link tracking-query compatibility — 2026-11-04

The owner received `UNSUPPORTED_SCRIPT_QUERY` on the read-only
`/api/apps-script/verify` endpoint. The prior interface refused **every**
query string; some link surfaces add a benign `utm_source` parameter. The
actual browser query was not directly observed, so this is a source-grounded,
consistent diagnosis rather than evidence of a captured request.

A narrow fix allows only up to five unique, short and safe
`utm_source`/`utm_medium`/`utm_campaign`/`utm_content`/`utm_term`
parameters **on the browser-only GET verify endpoint**, never on editor APIs.
All other query names, duplicate or oversized values remain rejected.
Authorization still requires the Admin's HttpOnly OAuth session, verified Admin
identity and grant scope. The endpoint still returns only a sanitized project
verification result without revealing Google source/tokens; live writes stay OFF.

Current production deployment: `cac0985f-dfd4-4a61-a14f-b31ae9b4d1c5`,
version `5c40f6f3-be4e-4bbf-ad48-fbc36020b6b3`, previous rollback
version `1b5a504e-66c7-411a-8ac6-e7f774362599`. Cloudflare readback
verified all ten binding names and ten modules. Fresh external GETs:
`/health` 200, `/api/apps-script/verify?utm_source=chatgpt.com` without
cookie 401 (`OAUTH_COOKIE_REQUIRED`),
`/api/apps-script/verify?code=bogus` 404
(`UNSUPPORTED_SCRIPT_QUERY`), normal editor content GET 503
(`EXECUTOR_INTERFACE_UNCONFIGURED`). Read-only SQLite inspection showed one
grant, one OAuth session, zero operations, zero backups; no SQL rows changed.

**An authenticated browser verification still must be performed by the user**
in the same browser as the Google Admin OAuth grant; no successful Google API
getContent is claimed until then. Evidence:
`docs/automation/evidence/pr124-verifier-utm-allowlist-20261104.json`.

## Browser backup form Origin compatibility — 2026-11-04

The Admin's actual browser POST to `/api/apps-script/private-backup` returned
`BACKUP_ORIGIN_REQUIRED` before creating any encrypted backup. Source review
found a strict check requiring the `Origin` header on every POST, although
some browsers or privacy modes may omit it. The precise request headers were
not logged, so the missing-header diagnosis is plausible, not proven.

The corrected POST guard now accepts an omitted Origin **only if**
`Sec-Fetch-Site: same-origin` proves a same-origin browser form submission.
An Origin supplied by the client must still match the Worker's exact origin;
`Origin: null`, cross-origin Fetch Metadata, or absence of both headers
remain denied. The Admin's encrypted OAuth session, one-use SQLite
confirmation and matching HttpOnly cookie/form nonce are still required.
No exception was added to the Google edit interface.

Reviewed source head `7457d51fd65bf023401c0ac14e41745b2500714b`,
deployed on the existing Worker as Cloudflare deployment
`a9d5c577-55ee-489e-9789-3bcd205d2d09`, version
`0570c7f1-c868-45c7-a9d2-ef95c539b1e6`. Previous version
`6b2185cd-8d03-4b93-bdb7-db7b7cb984c0` remains available.
Cloudflare readback verified preservation of all 10 module parts and 10
binding names. Node/SQLite offline CI passed. External HTTP GET checks:
`/health` 200; anonymous backup GET 401; editor GET 503.

A read-only SQLite check performed before this deployment showed
**0 encrypted backups, 0 edit operations, 1 Admin grant**, and one
outstanding browser confirmation; no partial backup was created.
Authenticated browser POST success is not yet established. Reopen the backup
page in the *same browser* and click the confirmation again once.
All Google writes remain OFF.

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
  1000 operations,64 immutable snapshots,32MiB ciphertext; OAuth starts30/minute
  and256 pending states with expired-state cleanup. No IP/email rate keys are kept. Archival/retention needs
  an explicitly reviewed private-storage procedure, not an automatic paid upgrade.

## Mount contract — existing Worker only (guarded infrastructure mounted; activation pending)

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

The guarded deployment imported the current private `worker.js` unchanged and
wrapped its default fetch handler; the original router receives delegated requests.
Actual legacy Google OAuth/HMAC execution must still be verified independently. Legacy OAuth callbacks remain delegated;
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
ports cannot be enabled by a submitted JSON body. The Cloudflare deployment identity was verified in the connected operator session,
but those trusted executor/review/writer/trigger ports and any ChatGPT-callable
executor remain unconfigured and unverified. This is **not** a claimed ready-to-use ChatGPT tool.

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
A library merely being present in GitHub does not change legacy routes. The guarded
mount is now live: a fresh external `/health` GET returned HTTP 200; a legacy
`/api/ping` GET returned 405 (POST-only). Neither test proves the original HMAC
or OAuth callback end-to-end. No delete-project, arbitrary-URL or trigger API exists.

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

## Real rollout acceptance (only infrastructure stage executed)

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
currently runs40 cases using actual persistent SQLite, actual AES-GCM/HKDF and
RSA signature validation, and explicitly **synthetic** Google transport, sources,
accounts and triggers. Covers full-file preservation, backup/rollback, stale and
concurrent operations, restart/uncertain outcomes, scope/identity rejection,
refresh/replay and private HTTP composition. No real Google script was read,
backed up, edited or restored by these tests.

Existing Python provider/bridge guards and the new fixed source-audit helper run
in the same existing workflow; no extra scheduler is added. Real source audits
keep code in runner memory and emit only fixed presence flags/module hashes.
Literal presence does not prove live request semantics, grants or deployment.
