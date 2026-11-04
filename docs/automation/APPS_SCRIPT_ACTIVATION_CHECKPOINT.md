# Apps Script final activation checkpoint — 2026-11-04

**LIVE_WRITE_BLOCKED.** The current owner instruction authorizes final activation
after safeguards pass. Additional ordinary owner approval is not the blocker.
Actual provider access, safety evidence and a passing main security gate are
missing. Do not turn the following requirements into unsubstantiated booleans.

## Immutable source and actual evidence

- PR #124 is merged: `1ad1ab30e4333856dfe6dc025654e202a7ead9f1`.
  The previously stale PR head is resolved; do not repeat that diagnosis.
- Its last pre-merge Sonar check `126563350840` at `6454e606...` passed.
- **Main Sonar check `126564622741` fails** at the merge commit:
  **C Security Rating on New Code**, required A. It provides zero annotations;
  exact findings cannot be inferred from this summary. Coordinate remediation
  through #66/#71 without competing with active security branches.
- Main offline job `126563951093`, run
  [41826935248](https://github.com/dizigs/archelaos-site/actions/runs/41826935248),
  succeeded. The merged runtime modules are byte-identical to the already-tested
  `d1167d3` implementation. Do not rerun OAuth/read/backup or baseline tests merely
  to present them as new progress.
- Last **operator-reported**, not freshly queried here, Worker deployment:
  `5f287fa0-cec4-4476-84e4-8a678cc0d64b`, version
  `7a8817c4-efbd-44c5-953d-66f9f4cdbff0`; rollback
  `1316a3b2-b8a1-45be-a5ae-1d7a772033fd`. Ten bindings reported preserved.
  Source: issue #71 comments `6630249035` / `6630328935` and the existing
  `pr124-github-oidc-signed-probe-e2e-20261104.json` evidence.

## Prepared inert source overlay

The companion JSON records exact SHA256/size for the ten runtime modules at the
merged commit. The archive contains **public runtime modules only**: no private
legacy `worker.js`, Worker entrypoint/configuration, bindings, secrets, Google
source, templates to install, CLI runners or live-enabled policy.
**It is not a standalone deployable Worker.** It cannot establish installation
readiness without the existing Worker's private source/settings and safety ports.

Reproduce it from the repository without any provider request:

```sh
git archive --format=tar --prefix=archelaos-bridge-inert/ \
  1ad1ab30e4333856dfe6dc025654e202a7ead9f1 \
  automation/apps-script/cloudflare-mount.mjs \
  automation/apps-script/configure.mjs \
  automation/apps-script/editor.mjs \
  automation/apps-script/files.mjs \
  automation/apps-script/github-oidc.mjs \
  automation/apps-script/github-writer.mjs \
  automation/apps-script/interface.mjs \
  automation/apps-script/oauth.mjs \
  automation/apps-script/security.mjs \
  automation/apps-script/store.mjs > archelaos-bridge-inert-1ad1ab3.tar
sha256sum archelaos-bridge-inert-1ad1ab3.tar
```

Expected archive SHA256:
`3f680eb9b5d7aebaff1fe2824831734d8a7e0dc9d47737dbe2b74a02d9017269`.
Verified: all archive bytes match immutable Git files; complete relative import
closure; ten Node syntax checks pass; packaged default writer returns503 and the
legacy health route delegates unchanged. These are local package checks,
**not Cloudflare deployment or Google API results**.

## Private preflight the authorized connected operator must perform

This executor has no Cloudflare/Google connector, ready credential or outbound
identity. Its enforced network policy excludes the Worker, Cloudflare and Google
API hosts. Do not retry denied endpoints, export encrypted grants, use GitHub as
a generic proxy, or repeat consent/setup. Continue through the existing authorized
provider connection, or provision that connection to the executor through its
supported environment setup.

1. **Current Worker identity and private backup:** privately read the existing
   Worker's current complete module collection/settings and deployment version.
   Preserve the original entrypoint, legacy handlers, every binding and all
   secret values in place. Obtain a recoverable private backup plus verified
   hashes and current rollback version. The public overlay is not that backup.
2. **Actual project review:** use the existing verified Admin grant to inspect
   complete source/manifest and previously verified private backup. Report only
   review outcome, file count, hashes and opaque private references. Identify
   any code/API client that can modify project content or installed triggers;
   do not execute `syncMuseumContributions` or alter its schedule.
3. **Cross-account trigger inventory:** obtain current installed-trigger state
   for every account that can own a trigger on this exact project, with a
   demonstrably complete account population, handler/event/source/duplicate
   counts and latest existing execution outcomes. Keep account names, trigger
   IDs and source details private. Compare a stable fingerprint before/after
   each eventual update. Use existing authorized dashboards/diagnostics; do
   not install the new inventory `.gs` as a prerequisite to proving it is safe
   to install a `.gs`. `projects.getContent` does not list triggers, and
   `ScriptApp.getProjectTriggers()` covers only the executing account.
4. **External writer exclusion:** identify all Google IDE/API writers and a
   genuine maintenance control that excludes them for the full write window.
   The trusted lease must bind the exact private project, cover external
   writers and remain valid at least30seconds ahead at both editor checks.
   Local SQLite locks, Apps Script LockService, an operator promise, two GETs,
   or an empty caller-supplied list do not prove that exclusion. Google
   `updateContent` exposes no advertised atomic If-Match/CAS precondition.
   No existing enforceable control has been verified. If other writers cannot
   be excluded without changing unapproved permissions/automations, **stop**;
   do not revoke access, disable production triggers, or assert readiness.
5. **Independent write authority:** privately configure the exact immutable
   reviewed workflow/source commit and independently approved canonical command
   digests. Never derive approval from the same incoming command, a readonly
   receipt, a shared ping key or its `verified` flags. Configure the existing
   trusted diff reviewer and proven trigger/lease ports. The user authorizes
   this goal; that does not supply missing factual safety proofs. Without
   these ports the existing executor intentionally returns503.
6. **Security and recovery gate:** resolve the genuine current main Sonar
   condition through protected review, refresh the approved commit when main
   changes, and verify protected CI at that exact source. Privately validate
   full backup decrypt/hash readback and rollback availability/capacity.

There is currently **no honest one-click activation action**: steps3–5 need
actual private evidence/configuration, not another owner consent click. The
minimum external next action is for the already-authorized connected operator
to execute this read-only preflight and return its verified private evidence
references or precise failing prerequisites to #71. Never publish raw source,
tokens, email content or private account/project identifiers there.

## Same-Worker installation after all gates pass

The target is only `archelaos-automation-bridge`; preserve its original private
entrypoint, all legacy module exports/routes and ten currently reported bindings.
Compare the freshly downloaded private module collection against the exact
public overlay before upload. Its imports require all ten runtime modules;
do not upload a partial collection or replace the legacy Worker with this TAR.
Retain existing migrations; no new namespace/Worker/trigger/scope is required
or authorized merely to stage this source.

First stage only unarmed/default-off source where authorized. Capture actual
Cloudflare upload/deployment IDs, version/readback, traffic target, complete
module hashes and unchanged binding-name/type inventory. Verify health and
legacy authentication independently; health alone is insufficient. Production
credentials stay inside Cloudflare. No generic deploy command can safely infer
the private wrapper/settings or trusted safety ports from the public TAR.

Only after the security gate, private safety proofs, reviewed command authority,
backup and rollback checks pass may the currently authorized activation be
performed. Record the exact armed implementation/configuration and actual
deployment evidence; do not label an unconfigured/default-off upload as active.

## One bounded real smoke sequence — pending, not performed

Use the **existing** manual `apps-script-writer.yml`; never a second trigger,
unbounded loop, copied Google token or public approval endpoint. Signed tokens
must match its pinned main workflow/source and the distinct write audience.

1. Privately verify the current full content/base hash, backup and trigger
   fingerprint under the real maintenance lease. Independently approve one
   closed-schema `create-smoke` command with a fresh UUID and five-minute expiry.
2. Submit it once through the authorized workflow/executor. It adds only the
   fixed comment-only `ArchelaosBridgeSmoke.gs`; the editor preserves all original
   files/manifest, takes a complete encrypted snapshot and checks provider
   response plus `projects.getContent` readback and unchanged triggers.
3. Approve `rollback-smoke` for that verified operation and exact resulting
   hash, with a fresh UUID/expiry. Dispatch a **separate** authorized workflow
   run: one run attempt is intentionally limited to one new operation. The
   editor backs up the complete current state before restoring the original
   snapshot. This two-operation sequence is one bounded smoke test.
4. Verify final Google readback equals the original hash/file collection and
   trigger fingerprint. Preserve both encrypted snapshots and sanitized signed
   receipts. If the first PUT outcome is uncertain, keep its durable hold and
   reconcile read-only; never repeat PUT automatically. If any proof expires,
   stop and report the exact state rather than removing a gate.

Required real evidence: both workflow run IDs/head SHAs, signed operation IDs,
private snapshot references, Google metadata/content GET and PUT HTTP outcomes
without bodies, complete-file readback comparisons, trigger-before/after proof,
external-writer lease validity, Cloudflare deployment/version/runtime logs and
actual authorized ChatGPT/executor invocation. Do not infer success from131
offline tests, main website Pages deployment or merging #124.

## Current outcome

| Stage | Actual result |
| --- | --- |
| Merged source / existing baseline | Verified; no duplicate implementation |
| Inert public overlay and local package checks | Prepared and passed |
| Main Sonar | FAIL, C on new code; exact findings not in annotations |
| Current provider access in this executor | BLOCKED; no ready identity/connector |
| Full trigger inventory / external writer exclusion | NOT VERIFIED |
| Independent live workflow/digest/safety ports | UNCONFIGURED |
| New Worker upload/deployment/activation | NOT PERFORMED |
| Real Google smoke create/read/restore | NOT PERFORMED |

Overall: **BLOCKED**, not READY_FOR_OWNER_ACTIVATION and not DONE. Follow-up
evidence is in #71; update this checkpoint after actual provider results.
