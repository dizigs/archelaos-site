# Deployment evidence gate — master self-heal, stage 1

Owner: Codex. Coordination: [Issue #71](https://github.com/dizigs/archelaos-site/issues/71).
Branch: `codex/self-heal-deployment-evidence`. Starting main:
`0b19941dbf668dc7ca0670fc31d164fd2adc5060` (includes history #97).
Implementation `44ae87c47ccfae4f75c2f68a10877be0eef0fb9f`; compatibility
`d160f7392b9c05e9239fa49b16c03110e444e143`.

## Implemented verification, not a deployment operation

The existing Cloudflare collector previously returned deployment metadata only.
That output is useful inventory, but cannot establish exact production commit,
real build-log completion or post-deployment health. This stage adds a strict
read-only gate for the later multisport incident controller. It does not claim
the complete monitor-to-repair lifecycle is already active. Draft #90's registry,
policy, pure preview repair and launch gates remain untouched and will be reused.

`VERIFIED` requires every condition:

1. Read the current protected-main full SHA through the existing GitHub identity.
2. Select the newest **production** deployment; never substitute a newer preview
   or fall back to an older success when the newest production SHA differs.
3. Read its detail from the configured existing Pages project and match commit,
   environment and deployment ID. All five known stages must succeed.
4. Retrieve the actual `/deployments/{id}/history/logs` response. An explicit
   terminal `Your site was deployed!` milestone must be present; metadata or
   `Assets published!` alone is insufficient. A later failure rejects the proof.
5. Independently GET the official homepage, accepting only bounded official
   apex/www HTTPS redirects, HTTP 200, and main/shared-shell/HTML landmarks.
6. Read main again. An intervening main change invalidates this current-main proof.

HTTP evidence covers one public page and static landmarks, not browser execution,
all routes, JS exceptions or accessibility. Existing browser/live-health workflows
retain those roles. The control plane must not treat this one gate as completion
of every release condition, or treat a green PR as Security A on main.

## Existing workflow integration and limits

`.github/workflows/cloudflare-pages-status.yml` retains its single original
`23 */6 * * *` schedule. No scheduler, DNS record, Pages configuration, dependency,
secret or permission expansion is introduced. After all main `Rebuild validation` integrity/browser/release jobs succeed, a
local reusable-workflow call verifies production. Its caller is restricted to
same-repository main pushes and passes only the existing provider secret.
`contents: read` stays in force; it never checks out external event-head code.
PRs and source pushes run only offline tests, without the provider secret.
Existing manual dispatch remains available for real read-only validation.

Requests are bounded: at most two GitHub ref reads, one Pages listing, one detail,
one build-log GET, and one public homepage check with at most two official
redirects. Failed requests are not retried. Provider HTTP, proxy CONNECT, unknown
layers and GitHub integration-permission failures are kept distinct, with exact
endpoints when observed. HTTP 403 by itself is not an authentication diagnosis.
A pending deployment or missing evidence yields `NOT_VERIFIED`, not an asserted
site outage or a reason to roll back production. The normal later schedule or
changed provider/main state can provide new evidence.

Provider responses are capped at 8 MiB, logs at 10,000 bounded records, homepage
at 2 MiB. Authenticated provider redirects are refused before forwarding headers.
Raw build lines, tokens, signed queries and personal data are never retained.
Only known milestone text/timestamps, a normalized-response SHA-256, stage states,
commit/deployment IDs and bounded HTTP metadata are published.

The existing `cloudflare-pages-status.json` report and legacy deployment metadata
field names are preserved. Unsafe/signed URLs are omitted. The report now uses
the existing shared no-follow atomic writer, with one added fixed approved
filename. Symlink/hardlink guards and temporary cleanup are inherited; arbitrary
CLI output paths are not introduced. Artifact retention remains 14 days. Safe
notices and the Actions summary expose results without requiring archive access.

## Actual executed offline validation

- **30/30** provider/collector/transport/real-CLI fixture tests PASS. Cases include
  wrong SHA, preview, stale main, missing/failed/duplicate stages, absent terminal
  logs, error-after-success, HTTP failure, forbidden redirects, redaction, bounded
  error reporting, missing credentials and output symlink rejection.
- **34/34** existing CLI security tests PASS with the additional fixed report slot.
- **24/24** observer tests PASS; the original cron/policy coverage is preserved.
- Build and independent release verification PASS: **15 pages / 763 profiles**.
- Python compilation, workflow YAML/read-only/main-trigger/cron checks and diff PASS.

Captured output: [local evidence](evidence/deployment-gate-local-20261103.log).
All fault fixtures are synthetic and offline. Their simulated 403s are not real
provider access results. Remote CI, real provider permission/log shape and actual
HTTP success still require the existing workflow run; no such success is inferred
from the unit tests at this documentation commit.

## Remaining master work and access boundaries

After real verification, continue the incident state/cooldown/retry-cap controller
and controlled fault → allowed repair → regression → deduplicated draft PR,
reusing #90 rather than duplicating its repair. Existing site-watch already
repairs one known escaped-HTML class; it must be reconciled rather than replaced
with a competing cron. No auto-merge, deploy, rollback or production mutation is
performed here. Unreleased sport hosts remain gated by #90's ten launch gates.
Archery's palette is not assigned to other departments; canonical identities and
history stay central and unchanged.

This runtime has no Cloudflare credential/connector locally. The existing Actions
secret is used only inside its current read-only provider job. Previously denied
GitHub administration and direct Sonar routes were not repeated unchanged. No
Sheets connector is available; the private Live Sheet is NOT UPDATED here.
#71 remains the authorized handoff/reconciliation inbox. Full ecosystem readiness
and main Security A remain separate uncompleted goals.

## Real provider execution — first successful attestation

The existing workflow was actually dispatched at verifier head
`96393c2b6db78b77ed18f556eadf1bac750c35c7`:
[41622405981](https://github.com/dizigs/archelaos-site/actions/runs/41622405981),
check/job **125871159545 SUCCESS**. The configured Actions identity successfully
read the provider and log endpoints; no permission expansion was made.

Verified production main **65f7e34ea692436d16ddeac395a9a1dbcc7fd3d8**, deployment
**60cc4e0e-9eb4-4bc7-a7f1-b85a8d283a56**. Actual sanitized provider milestones:
`Assets published!` at 2026-11-03T10:47:46.572313Z, and `Your site was deployed!`
at 2026-11-03T10:47:47.671656Z. Independent official HTTP check: **200**, final
https://www.archelaos.club/, **23,060 bytes**, body SHA256
`3da97671b3b0c275b2b549fc4666c5f994776d3e25b7e79506d637ef3a6a837f`.
The code accepted all five required stages before returning VERIFIED. Notice
output is further extended to expose their individual states and log-response
hash directly, avoiding inaccessible archives.

[Sanitized actual annotation](evidence/deployment-gate-live-20261103.json),
[handoff](https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6601802224).
This verifies the reported production main, **not deployment of the unmerged
verifier branch**. It is HTTP/static-landmark evidence, not a browser/all-route
audit. PR Sonar125871130588 PASS; main65f7e34 Sonar125870971530 still C/FAILURE.
Full final-head checks and master controller/draft-repair demonstration remain
open; this component success does not close #66 or the master assignment.

## Real scanner finding and corrective wiring

The first integration used `workflow_run`. Actual zizmor annotation
**125870780098**, cloudflare-pages-status.yml:11, reports failure-level
**dangerous-triggers**: `use of fundamentally insecure workflow trigger:
workflow_run is almost always used insecurely`. The scanner job itself was
successful under the existing repository policy; Codex read the annotations and
did not treat that green job as a clean scan.

Correction **cfb555f3631cf39c5a4d54772d5b035858043de2** removes workflow_run.
The existing Rebuild calls the local reusable verifier only on protected-main
pushes, after `integrity`, `browser` and `release-build` all succeed. The child
uses a typed boolean input to distinguish this call from ordinary source pushes;
PRs remain offline only. Existing manual/scheduled read-only operation remains.
Fresh all-open-PR ownership checks confirmed the Rebuild workflow had no other
active owner before adding the small caller job. No scanner exception, permission
expansion, new cron or release operation.

Source/YAML dependency/permission/unchanged-cron checks, **30/30** fault tests and
**24/24** observer tests PASS after correction. New remote scanner annotations
and exact final-head checks still require observation. First real provider
evidence above remains valid for its reported SHA and does not waive this
security gate. [Finding handoff](https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6601886450).
