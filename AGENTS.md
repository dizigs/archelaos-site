# ARCHELAOS — shared task tracking (ChatGPT, Codex and contributors)

This is the public repository for `https://archelaos.club`. **Before any work**, consult [docs/LIVE_TASK_TRACKING.md](docs/LIVE_TASK_TRACKING.md), [docs/AUTOMATION_PLAN.md](docs/AUTOMATION_PLAN.md), [docs/WORK_LOG.md](docs/WORK_LOG.md) and [GitHub issue #71](https://github.com/dizigs/archelaos-site/issues/71). The live task tracker is a **private, editable Google Sheet** linked from the tracking guide.

## One journal, multiple evidence sources

The **private LIVE Google Sheet** referenced in `docs/LIVE_TASK_TRACKING.md` is the **only canonical shared operational task/event journal** (task tabs + `LOG`). `docs/WORK_LOG.md`, `brain/WORK_LOG.md`, historical issue comments, provider logs and the reviewed Self-Heal solution playbook are preserved *source evidence*, not competing active task lists. Issue #71 is the public-safe coordination and ownership channel; do not paste private Sheet rows into public GitHub. Refer to the complete [source-of-truth and single-writer rules](docs/LIVE_TASK_TRACKING.md#one-canonical-operational-journal-7-november-2026) before any update.

The dedicated tool-inventory/audit agent owns Draft PR #280 and #282 with its **own hourly scheduled run**; it remains active while the separate Brain/Self-Heal agent addresses security lifecycle. Avoid touching the same files, branches or PR ownership, but reconcile all progress back to the same canonical Sheet.

## Mandatory task lifecycle
1. Identify an existing canonical task (same event/feature/bug); reuse its ID rather than opening a duplicate. New work should be recorded in the Live Sheet by an agent with authorized Sheets access, including tasks that originate in another ChatGPT conversation or a Codex handoff.
2. Record source context (chat, issue, PR, research reference), description, owner, priority, status, date, and evidence link. Never invent a chat URL, source ID or completed action. Protect sensitive source data.
3. Update status as work progresses. **Check the completed box only when verified**, not for a proposal, passed PR preview, pending PR, or scheduled automation alone. For deployed website changes verify merge to the correct `main` commit and the associated Cloudflare production deployment logs.
4. Add a dated audit entry to the Live Sheet `LOG` and, for repository operations, preserve technical evidence in `docs/WORK_LOG.md` as appropriate.
5. Keep single-owner PR boundaries and branch protection. Never direct-push to `main`, bypass required checks, or create a competing PR for the same Codex work. Use [issue #71](https://github.com/dizigs/archelaos-site/issues/71) for `[CODEX-HANDOFF]` and blockers.

## Accessibility and limitations
- This repository **does not automatically receive events from all ChatGPT conversations**. A repository document or GitHub workflow cannot read another private ChatGPT thread.
- When a connected agent is working on an Archelaos task in **any conversation**, it should update the Sheet at that point if the connector is available and authorized; otherwise leave a concise structured handoff in issue #71 or the corresponding task thread without private data.
- The existing daily ChatGPT automation can periodically reconcile available PRs/issues/handoffs and accessible research records. That is **periodic reconciliation**, not a universal event-driven cross-chat sync.
- The sheet is not the website's public content source. Do not expose private research sources, contributors' data, tokens, or Google Sheet values in public commits.

For task IDs, sheet tabs, idempotent upsert rules, and closure evidence, follow [docs/LIVE_TASK_TRACKING.md](docs/LIVE_TASK_TRACKING.md).
