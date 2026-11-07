# Live task tracker — archelaos.club

_Last baseline: 3 November 2026 (Europe/Athens)._

## Canonical links

- **Live Google Sheet (private; access controlled by Google Drive permissions):** https://docs.google.com/spreadsheets/d/1sAIkAe_YSy_Wci7UyIMbXIlsYsfJLqGwIWWUu8EdNMs/edit
- **Codex ↔ ChatGPT handoff / ownership:** https://github.com/dizigs/archelaos-site/issues/71
- **Work logs:** [WORK_LOG.md](WORK_LOG.md)
- **Automation plan:** [AUTOMATION_PLAN.md](AUTOMATION_PLAN.md)
- **Private research backlog:** https://docs.google.com/document/d/1XJOwH9iiFfYbeFwx0HL_9TDVh4jbVV0338KitYlVorg/edit
- **Private historic True/False research bank:** https://docs.google.com/document/d/144UUZPkvzIV-uAdSls_YOHg4nCHFUGNYeDkjQzzJeSA/edit

**Important:** This repository is public. A link does *not* grant permission to open the private Sheet. Do not commit the Sheet's rows, private research attachments or contributor correspondence into GitHub.

## One canonical operational journal (7 November 2026)

**SINGLE SOURCE OF TRUTH:** The existing private Google Sheet linked above is the only writable, shared **task-status and work-event journal** for all ChatGPT sessions, Codex, scheduled tasks, the Agent Kit owner and other agents. Its `ΕΡΓΑΣΙΕΣ`, `PR & ISSUES`, `ΑΥΤΟΜΑΤΙΣΜΟΙ` and `CHATGPT INBOX` tabs hold canonical task IDs/status; the **`LOG` tab is the sole canonical chronological operational journal**. The additional `ΠΗΓΕΣ ΚΑΤΑΓΡΑΦΗΣ` tab, where present, is an index of evidence locations, **not** another activity log.

| Source | Canonical role | Retention / update rule |
| --- | --- | --- |
| Private LIVE Google Sheet / `LOG` | **Only shared operational journal / current task state** | Stable task ID + UTC/date + source URL/SHA/run ID + actual result + owner + next action; deduplicate and independently read back every write |
| [Issue #71](https://github.com/dizigs/archelaos-site/issues/71) | Public-safe cross-agent ownership and technical handoff | Link the same task ID and exact evidence, but never publish private Google Sheet rows, credentials or private documents |
| [docs/WORK_LOG.md](WORK_LOG.md) | Historical engineering evidence (large, append-only legacy record) | Preserve historical observations; link relevant exact sections/evidence from LIVE LOG; not a separate task queue |
| [brain/WORK_LOG.md](../brain/WORK_LOG.md) | Brain-specific technical investigation and checkpoint history | Preserve SHA-specific native evidence; task state lives in LIVE Sheet |
| [docs/self-heal/ERROR_SOLUTION_PLAYBOOK.md](self-heal/ERROR_SOLUTION_PLAYBOOK.md) | Curated failure diagnosis and safe recovery policy | Reference reviewed solutions only; not a task journal, credential store or executable new allowlist |
| Github PRs, workflows and provider logs | Immutable *evidence* of real operations | Preserve exact PR/commit/run/deployment IDs; CI != deployment != authenticated connection |
| Private tool/access registry | Authoritative inventory of integrations, scopes, owners and commands | Not a second task log; no secrets in public repo; tool agent owns review and controlled additions |

**Do not concatenate, delete or overwrite old engineering logs** as a purported "merge". Their timestamps and source identity remain evidence. Instead make the private LIVE Sheet's LOG a single event index with source pointers, importing only deduplicated task-level facts. An old proof remains old and should not be promoted into a current verification.

### Single-writer coordination

1. Before accepting work, fetch the live Sheet task and latest Issue #71/PR state; acquire ownership by existing stable ID and exact branch/path. One owner per writable file/PR at a time. If the private Sheet is inaccessible, emit a sanitized Issue #71 handoff labeled `SYNC_PENDING` and explicitly report reconciliation is incomplete.
2. For actual updates, locate by **stable ID**, not historical row number; validate matching title/source/owner, append an evidence-bearing row to `LOG`, then re-read to confirm. For concurrent changes use a unique source-event ID or run/PR/commit fingerprint and skip duplicates. Never toggle a verified-complete checkbox from CI alone.
3. The hourly Brain/Self-Heal schedule retains ownership of the security lifecycle. A **separate active hourly Agent Kit and tool-audit schedule** (Automation ID `6aeec0ded6a88191a0a598d99875f49a`) owns the existing source-only PRs [#280](https://github.com/dizigs/archelaos-site/pull/280) and [#282](https://github.com/dizigs/archelaos-site/pull/282). Do **not pause this owner, overwrite its branch, duplicate its registry or delay it behind unrelated Brain work**. Daily QA, news and morning report schedules keep their individual domains and all reconcile to the same Sheet.
4. Public technical changes, if any, pass distinct code-review/CI gates. No automatic merge, main push, deployment, paid API usage or live Self-Heal authorization arises from a row or this documentation.
5. Verify any historical import against the source's original immutable evidence; retain original links and never infer successful production state from historical logs or a draft PR.

## Existing sheet tabs

| Tab | Purpose | Completed checkbox |
| --- | --- | --- |
| `ΕΠΙΣΚΟΠΗΣΗ` | Live counts and progress formulas | Derived |
| `ΕΡΓΑΣΙΕΣ` | Functional site tasks, priority, owner, evidence | Column B |
| `ΙΣΤΟΡΙΚΟ 106` | Historic findings (A/B/C canonical IDs) | Column B |
| `PR & ISSUES` | GitHub technical work and release gates | Column B |
| `ΑΥΤΟΜΑΤΙΣΜΟΙ` | Enabled schedule vs proven end-to-end completion | Column B (complete); C (enabled) |
| `LOG` | Ordered, dated trace of real operations | No checkbox |
| `CHATGPT INBOX` | New task intake from separate chats when accessible | Column B |

The last tab was introduced with this coordination change and is intentionally separate from already categorized tasks. A collected chat lead is not automatically a verified completion.

## Upsert rules across conversations

- Apply this workflow only to **Archelaos project work**; not all of a user's unrelated ChatGPT conversations.
- Search the existing canonical task ID, same event/feature, repository issue or PR before creating a new row. If it exists, update the existing row/status; **do not duplicate** it in the Inbox. An Inbox row may reference an existing task ID while awaiting reconciliation.
- For new work, use a stable ID such as `CHAT-YYYYMMDD-001`; preserve the ID on every later update. Do not assign a new ID just because the task is discussed in another chat.
- Record a concise, factual summary; origin (ChatGPT chat URL only if actually available, GitHub issue, research document, etc.); date; owner; next action; current status; link to evidence. **Never invent identifiers, sources, dates or successful tests.**
- Suggested states: `Νέο`, `Σε εξέλιξη`, `Σε PR`, `Blocked`, `Merged / προς παραγωγή`, `Ολοκληρώθηκε – επαληθευμένο`.
- Complete the checkbox only when the closure criterion for that *specific task* is met. For a deployment task: required CI results, merged main SHA and **actual** Cloudflare production logs. For research: verified source, cross-checked identity/event dedupe, and an explicit accepted resolution. Draft, PR preview success, merge awaiting deploy, or just an automation schedule **is not sufficient**.
- When writing via Google Sheets connector, read tab names/IDs from metadata, use bounded ranges, and verify a readback. Never clear/overwrite the entire sheet. Preserve manually checked entries and notes.
- Each change logs actual timestamp, canonical ID, action, evidence, result, and any blocker in `LOG`. Do not claim a change when no authorized write succeeded.

## GitHub PR and issue reconciliation

- Use GitHub live state rather than remembered PR numbers. Record the exact PR number, head SHA, draft/ready status, required checks, review threads, mergeability and blockers.
- A GitHub merge is not proof of production publication. Production is confirmed only with Cloudflare Pages deployment status/**logs** for the corresponding SHA.
- Do not silently tick a row if tests failed, status is missing/expected, or the owner has requested a hold.
- Codex retains ownership of its active workstreams. Use issue #71 for `[CODEX-HANDOFF]` with head SHA and results. Avoid competing PRs/direct pushes and protect canonical `hall-of-fame-people.json` (760) against an older rebuild snapshot (682).

## What is / is not automatic

**Supported now:** Any ChatGPT session with authorized access to the connected Google Sheet can read, update and verify tasks during that session. A scheduled audit can periodically reconcile GitHub PRs/issues, issue #71 and accessible Drive/research records into the private tracker.

**Not supported by merely committing this file:** automatic event-triggered ingestion of every new ChatGPT conversation, retroactive complete coverage of private chats or direct GitHub→Google Sheets sync without an authorized integration. Never claim these work unless an actual end-to-end test and appropriate event source have been verified.

**Schedule ownership update (7 November 2026):** Existing daily site/Drive QA, news and morning report schedules retain their respective cadences; an independent hourly Agent Kit/tool-audit ChatGPT schedule now covers the distinct PR #280/#282 workstream. They all reconcile to the same private Sheet. This source-only guide introduces no new GitHub cron, secrets, webhook, Cloudflare deployment or unattended `main` pushes.
