# Apps Script → Brain: isolated private relay contract

Status: **OFF / CODE-ONLY / NO LIVE INTEGRATION** (05 November 2026).

This package has no entrypoint, DNS route, Worker deployment, cron, external API
call, Google token or write permission. It is a separate ChatGPT-owned lane and
does not alter `automation/apps-script/*` (Gemini-owned inventory/writer safety)
or the open Brain draft PR #111 (`brain/*`).

## Why separate?

The active Brain PR #111 recognizes only source types `staging`, `drive`,
`gmail`, `site`, `github`, and `news`; it **cannot yet accept**
`apps_script` events. Claiming that this code is already connected would be
incorrect. An authorized integration must add a real private `apps_script`
source route/policy in the central Brain with precise event schema and receive
an authenticated Service Binding request, not a public unsigned webhook.

## Contract / future acceptance

1. **Read-only, authoritative Apps Script journal:** a private Worker port
   `readTrustedReceipt(operationId)` returns only a completed Google-provider
   verified source read, full encrypted backup verification or completed smoke
   rollback. Identity, source version, project and evidence must be independently
   checked by the owner of the existing `MuseumScriptCoordinator`; do **not**
   create that proof from a caller-supplied JSON boolean.
2. **Trust boundary:** `readControls()`, `readBrainCapabilities()`,
   `claimDelivery()`, `submitToBrain()`, `finalizeDelivery()` are
   server-owned functions only. Never expose these via an unauthenticated route.
   Disabled is default; before activation, prove private Service Binding and
   source/schema support in a deployed Brain version.
3. **Durable dedupe:** `claimDelivery` atomically records the deterministic
   opaque eventId before transmission. On unknown outcome, record an explicit
   hold and reconcile via real Brain receipt/logs. Do not auto-retry PUT or
   repeat Google writes. Receipt confirms event intake, NOT script modification.
4. **Privacy:** only hashes, stage and UUIDs travel centrally; no script content,
   code manifest, OAuth credentials, private project ID, trigger list, file
   attachments or user/visitor data. No AI model is invoked by this module.
5. **Controlled live proof:** real Admin OAuth/Google source read; complete
   cross-account triggers/writer exclusion; immutable review; encrypted backup
   and readback; narrow signed smoke write; provider readback and rollback;
   independent Brain source enablement; Service Binding event → durable Brain
   receipt → duplicate/replay controls → audit. Only then activate dispatcher.

### Explicit non-goals

No Google Apps Script writer, OAuth grant, external-writer lease,
trigger inventory, Cloudflare production deploy, direct main push or autonomous
publication. External writers cannot be excluded by local LockService alone.
Never interpret synthetic tests as authenticated provider proof.

Run `npm run check` from this directory. CI runs on PR changes only, with no
new scheduled slot. See issues #108 and #71 and merged PR #124.
