# Actual access boundary and minimum future permissions

No permission, DNS, billing, secret, subscription or production change is made
by this package. Cloudflare403 is a separate operational blocker, not a reason
to stop local development or the read-only PR tests.

## Captured evidence (no repeated failed calls)

Read-only inventory: [run41641089600](https://github.com/dizigs/archelaos-site/actions/runs/41641089600),
source `f88f770bc6fa853264ce6086a0ef3e726d3658f3`, check125934579327.
Each of these exact endpoints returned **HTTP403 once**, from the provider:

```text
https://api.cloudflare.com/client/v4/accounts/898359728b3dfe8c3a3f56e3d19eecd1/workers/account-settings
https://api.cloudflare.com/client/v4/accounts/898359728b3dfe8c3a3f56e3d19eecd1/workers/subdomain
https://api.cloudflare.com/client/v4/accounts/898359728b3dfe8c3a3f56e3d19eecd1/subscriptions
https://api.cloudflare.com/client/v4/accounts/898359728b3dfe8c3a3f56e3d19eecd1/workers/durable_objects/namespaces
https://api.cloudflare.com/client/v4/accounts/898359728b3dfe8c3a3f56e3d19eecd1/workers/scripts/archelaos-brain-staging
```

The old probe did not retain the provider JSON error body; no provider error code
or textual reason is invented. Its `existingStagingScript:false` was not evidence
of absence:403 means **unknown**. The future helper now reports unknown for403
and uses the JSON `/settings` endpoint instead of downloading a Worker module.

Separate authentication baseline: [run41642204232](https://github.com/dizigs/archelaos-site/actions/runs/41642204232),
source `778f9274ab310a29ac5df7909f3078cad808d207`, check125938288627:

```text
GET https://api.cloudflare.com/client/v4/accounts/898359728b3dfe8c3a3f56e3d19eecd1/pages/projects/archelaos-site
HTTP200, success:true
```

The same existing binding authenticates to Pages on this account, but does not
authorize the tested Workers/account-metadata operations. These are provider
authorization responses, not a local proxy `CONNECT403`. No blocked local
Cloudflare destination was retried or bypassed. No deployment was performed.

The temporary probe addition to the existing Cloudflare workflow was removed
from the final PR diff. Production workflow files and schedules remain unchanged;
only the new read-only `brain-core.yml` PR/main test workflow is added.

## Exact permission groups, verified against official OpenAPI

Source: [Cloudflare official API schema](https://github.com/cloudflare/api-schemas/blob/main/openapi.json),
downloaded2026-11-03. These names are its `x-api-token-group` values, not guessed
permission names. Dashboard labels may use **Edit** for **Write**.

| Operation | Sufficient relevant permission | Notes |
|---|---|---|
| Workers settings/subdomain read | `Workers Scripts Read` or `Workers Scripts Write` | Account Settings Write is unnecessary |
| Durable Object namespace listing | `Workers Scripts Read` or `Workers Scripts Write` | Current implementation uses SQLite DO, not D1/Queues |
| Upload Worker module and its DO migration | `Workers Scripts Write` | Existing token does not establish this access |
| Worker tail inspection/start | `Workers Tail Read` or `Workers Scripts Write` | Required for actual provider-log proof, not inferred from a green job |
| Read account subscriptions for free-plan evidence | `Billing Read` | **Billing Write is not requested or used** |

Scope any future authorization to the approved account and staging Worker where
supported. Do not change the existing token automatically, request global keys,
enable Workers Paid, create a subscription, change account subdomains or add DNS.
Free Workers/SQLite DO eligibility must be confirmed before deployment; supported
free-tier features alone do not prove this account's entitlement or current plan.

## Source ports awaiting separate authorization

- Drive: approved Shared Drive membership plus least-privilege read access for
  changes/content, initial authoritative cursor, actual `changes.watch` channel
  and private channel token. Code pins the approved Drive/channel/resource and
  supports renewal-needed status; a notification is not a file revision.
- Gmail: approved mailbox/label read/history/watch permissions and a Pub/Sub
  push subscription with cryptographically verified Google OIDC, fixed audience
  and service identity. Do not create a topic, subscription or new billing path
  merely to exercise fixtures. Expired history requires reconciliation.
- Contributions: committed upload/scan/consent backend receipt; browser callback
  and raw submitted personal fields are insufficient.
- GitHub: approved webhook or later reviewed bridge from existing event workflow;
  repository ID/HMAC/fork checks apply. No modification of existing automations
  occurs in this PR.
- Tracker: no authorized Sheet connector exists in this execution environment.
  `TRACKER_SYNC_BLOCKED`; Issue71 handoffs are not proof of a Sheet write.
- AI: provider/model/billing coverage/price/FX evidence and bounded usage are
  unverified. Charged execution remains OFF; no credential or paid API is added.

After authorized access changes, rerun a **new-condition** readiness check, normal
CI/protected review, bounded staging deployment and the prepared HTTP proof.
Require exact SHA, provider deployment/version, actual terminal runtime logs,
independent health and source-event/rollback evidence. Local `workerd`, dry-run
compilation, mocked providers and PR previews never substitute for remote proof.
