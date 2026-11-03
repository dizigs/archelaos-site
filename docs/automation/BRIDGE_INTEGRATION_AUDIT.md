# Existing automation bridge — integration evidence and remaining gates

This audits the existing `archelaos-automation-bridge` and Museum Automation
Apps Script. It does not create another Worker, collector, trigger, paid service,
OAuth client or publication engine. The existing `syncMuseumContributions`
10-minute trigger must be inspected, not recreated.

## Evidence boundaries

The operator supplied prior successful logs for health/protected HTTP 200,
invalid key HTTP 401, HMAC-SHA256, sequential replay 200→401 and expired
signature HTTP 401. These are retained as historical operator results, not
claimed as newly executed by Codex or as proof of all integrations.

A fresh local GET to
`https://archelaos-automation-bridge.dimitriszgalanis.workers.dev/health`
failed before origin TLS: `curl: (56) CONNECT tunnel failed, response 403`,
origin HTTP 000, proxy `server: envoy` (3 November 2026, 22:51 Athens).
This is a destination-network restriction, not a Worker HTTP 401 or proof that
Google OAuth is broken. No unchanged failing call was repeated. The existing
network draft now includes this exact host and preserves the earlier Sonar
addition/current destinations; saving the draft did not apply/publish it.

No live Worker source, Apps Script project source/manifest or Script ID was
found in current main `86c6c1b9385c96eb82567cf3327060db3fb85507`, the relevant
issues or the available connectors. The runtime exposes no Google/Cloudflare
connector or bridge signing-key binding. An account name or secret name is not
an executable authorized connection. Existing credentials are not extracted.

| Link | What is established | What is not yet verified |
|---|---|---|
| Apps Script ↔ Worker | Operator's earlier authentication tests | Current source/version, signing contract and effective access |
| Gmail → Museum Automation → Drive/Sheets | Existing trigger is declared; offline intake/queue already implemented | Real authorized collector execution, outputs, OAuth scopes/approval and safe retry behavior |
| Worker ↔ GitHub | GitHub repository/PR/issue access works in Codex | Actual Worker credential/route and an approved, deduplicated handoff |
| GitHub Actions ↔ Cloudflare | Existing Pages evidence workflow works and reads real deployment logs | Workers-specific scope; checked separately by the new metadata preflight |
| Apps Script API | Supported project-source/deployment/execution mechanisms exist | Authorized project identity, API access, deployment and a proven read-only diagnostic function |
| Codex work intake | Existing issue #71/normal PR process | No public direct Codex-task creation API is assumed |

## Implemented read-only control-plane preflight

`tools/automation_bridge_preflight.py` reuses the existing Cloudflare transport
and the repository's configured credential. It makes at most two fixed GETs:

1. Pages deployment metadata (`per_page=1`) as a same-account credential control.
2. Settings of the one named existing Worker, retaining only known binding
   presence/type and a durable-storage-presence flag.

It never reads Worker secret values, KV keys/values, OAuth tokens, Google
messages/documents or unrelated bindings. No POST/PUT/PATCH/DELETE, HMAC bridge
action, Apps Script execution or resource creation is performed. Unexpected
schemas/errors disclose no raw response. Proxy denial is separate from a
provider authorization denial; a known same-host transport denial skips the
second request. A successful Pages control plus provider Workers 403 isolates
permission/resource scope, not a missing general login.

`METADATA_OBSERVED` only means the required declared bindings were observed.
`fullIntegrationVerified` and `atomicActionExecutionVerified` always remain
false in this probe. An AUTH_KV binding does not prove nonce atomicity, and a
Durable Object/D1 binding does not prove correct use. Namespace identity/data
access, HMAC, OAuth and actual side effects remain unverified.

Use the **existing** Cloudflare status workflow, manually, with
`inspect_bridge=true`. Its normal Pages runs and six-hour schedule are
unchanged; this adds no scheduled or Apps Script trigger. The manual probe
returns nonzero when access/configuration is blocked or incomplete and emits a
sanitized annotation so actual failures remain visible without downloading raw
logs. Offline tests run on relevant PR/main changes without live credentials.

```sh
python -m unittest discover -s tests -p test_automation_bridge_preflight.py -v
python -m unittest discover -s tests -p test_cloudflare_deployment_evidence.py -v
# After normal PR review and the branch is pushed:
gh workflow run cloudflare-pages-status.yml --ref codex/automation-bridge-integration -f inspect_bridge=true
```

Local validation: **16 preflight tests + 30 existing provider/transport tests
PASS**, actionlint/compilation PASS. Existing private intake **11 tests** and
private queue **4 tests** PASS with synthetic fixtures only. None is represented
as a live Gmail/Drive/Apps Script integration result. Actual remote probe/CI and
permissions are recorded in issue #71 after execution, not inferred here.

## Exact access/source prerequisites

1. Review/save/publish the narrow network change for the declared Worker host
   to permit a new direct health check; recheck only after runtime policy changes.
2. Allow **Workers Scripts: Read** for the configured Cloudflare account if the
   real settings probe reports a permissions denial. Preserve the existing
   Pages read scope. DNS/billing/Workers Edit are not needed merely to audit.
3. Provide a sanitized, versioned export of the current Worker modules/config
   (binding names only) and Apps Script files plus `appsscript.json`. Do not put
   Script Properties, client secrets, keys, tokens or original private documents
   in the public repository. Preserve private originals in the approved archive.
4. Supply the Apps Script project identity through authorized configuration and
   a read-only Apps Script API connection as the designated Workspace operator,
   or an operator-reviewed export. Use project-content/deployment reads first;
   do not execute `syncMuseumContributions` just to test access. No connector or
   usable Google authorization is available in this Codex session yet.
5. Inspect the existing trigger count/handler and its configured interval in
   the project/console. A CLOCK trigger listing alone does not prove its interval.
   Do not create a second trigger. Before any execution, identify a source-reviewed
   read-only diagnostic function and its supported execution deployment.

These are specific external blockers, not requests for secret values in chat.

## Security/reliability acceptance before real actions

- Read the existing HMAC byte/canonicalization contract; test exact body/method/
  path/timestamp/nonce handling, constant-time verification, invalid/missing key,
  expiry/clock skew and failure-closed parsing. Do not invent a new wire protocol
  or rotate a key without updating the existing caller safely.
- Separate a transport nonce from a stable business operation ID. Sequential
  replay tests do not prove concurrent exclusion. In the existing implementation,
  use its proven atomic storage/lock if adequate; otherwise gate the actual
  action with a suitable atomic mechanism (e.g. a SQLite Durable Object), after
  access/plan review. KV alone is not a cross-request compare-and-set primitive.
- Test many simultaneous identical signed requests AND different valid nonces
  with the same operation ID. A synthetic/staging downstream action must occur
  once. Inject crashes/restarts before/after claim and downstream response.
- A timeout after a downstream create is an uncertain outcome: reconcile the
  existing receipt/task before retrying, keep the same operation ID, and never
  create a new ID to bypass deduplication. Use bounded backoff for eligible
  429/5xx only after idempotency is proven; unchanged 401/403 is not retried.
- Existing private intake already has hash/revision receipts and private queue
  matching against the canonical public Hall. Reuse it; do not upload private
  excerpts, Gmail/Drive IDs or filenames into public issues or Actions artifacts.
- GitHub work packages must be public-safe and source-verified before a normal
  draft/review PR. Reconcile prior open tasks and opaque receipt markers before
  creating another issue. Existing issue #71 is the supported coordination inbox;
  an issue or repository dispatch does not itself create a Codex task.
- Keep live email sending, file mutations and unverified publication disabled
  until these gates have actual evidence. This audit did not enable them.

## OAuth scopes, Google verification and rotation

The actual manifest/caller scopes and Google consent-screen state are missing;
compliance/verification is **NOT VERIFIED**. Review the existing internal/
external/testing status, users, Google Cloud project and exact granted scopes.
Gmail read access can involve restricted scopes; Google verification/security
assessment obligations depend on the app's audience and storage/transmission
of restricted data, including applicable exemptions. Do not certify compliance
from one successful administrator login. Use Google's current official scope,
verification and Apps Script API documentation during that review:

- https://developers.google.com/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/apps-script/api/how-tos/execute

Request only needed read scopes and approved Drive resources. Do not add send,
modify or broad account permissions for a health check. Keep OAuth state bounded,
principal-bound and single-use; never log state/code/token values.

No rotation was executed. First inventory the actual caller/server key versions
and supported rollover behavior from source, then validate a controlled rollover
on read-only diagnostics, retain replay/action receipts, and retire the old key
only after its bounded validity/retry horizon. Google client-secret and OAuth
state-secret changes can disrupt existing authorizations; do not clear AUTH_KV
or change the trigger as a shortcut. GitHub handoff should use an existing
repository-scoped credential/App with the minimum supported permissions, not a
new broad classic token or an assumed Codex API.

## Real metadata probe — 3 November 2026, 23:18 Athens

[Actions run 41720580206](https://github.com/dizigs/archelaos-site/actions/runs/41720580206),
head `c6306d7324cb62873da31ed4ff2f2985edf11e18`, job/check `126211968100`:
all 16 offline tests passed; the actual read-only probe exited 1 (**BLOCKED**).
Its `Automation bridge access evidence` annotation records:

- `GET https://api.cloudflare.com/client/v4/accounts/898359728b3dfe8c3a3f56e3d19eecd1/pages/projects/archelaos-site/deployments?per_page=1`: **HTTP 200**.
- `GET https://api.cloudflare.com/client/v4/accounts/898359728b3dfe8c3a3f56e3d19eecd1/workers/scripts/archelaos-automation-bridge/settings`: **HTTP 403**, response layer `provider_http`, no structured numeric error codes observed.

The same existing credential reaches Cloudflare and reads Pages, but cannot
read this Worker's settings. This establishes Workers permission/resource-scope
denial, distinct from the local proxy CONNECT 403. It does not establish a
specific missing token policy or that Google credentials are invalid. An
account administrator must inspect the account/resource scope and grant only
Workers Scripts Read needed for this audit. No failed call was repeated.
No secret values, private Google content, configuration mutation or deployment
were performed. The prior production Pages evidence for main `86c6c1b` is
separate and does not prove this bridge works.
