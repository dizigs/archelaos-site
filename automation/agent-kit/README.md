# ARCHELAOS Agent Kit — tools, commands, evidence

Status: SOURCE-ONLY / REVIEW REQUIRED. No MCP service, external agent, API call,
new credential, schedule, deployment or Self-Heal executor is enabled by this
directory. The inventory is public-safe metadata, not a private credential store.

## Always accessible index

- Source repository: https://github.com/dizigs/archelaos-site
- Public snapshot: automation/agent-kit/registry.json
- Read-only CLI: automation/agent-kit/cli.mjs
- Private authoritative tool/access registry: existing admin Google Doc
- Work tracker: docs/LIVE_TASK_TRACKING.md; coordination issue #71

The private Google Doc remains the human-owned source for access decisions.
This repository contains a REDACTED projection only. VERIFIED means evidence of
a specific previous operation, not proof of unrestricted live API access.

## Antigravity workspace skills (discoverable after checkout)

The repository includes three **source-level** workspace skills under
`.agents/skills/`: `archelaos-tool-registry`, `archelaos-site-qa`, and
`archelaos-source-research`. Antigravity can discover these when the
merged/checked-out workspace contains them. They supply safe operating
instructions for tool selection, browser QA and evidence-first research,
not live GitHub/Cloudflare MCP authentication, Gemini credits or runtime
installations. No desktop app or OAuth setup is performed by this PR.

## Project-scoped MCP endpoints (OAuth not performed)

The PR includes `.agents/mcp_config.json` for Antigravity. Only the
GitHub **read-only** MCP endpoint and the public Cloudflare docs MCP are
pre-enabled. Both the Cloudflare API and Firecrawl search-only MCP remain
**disabled** pending reviewed, least-privilege OAuth. No tokens are committed.

This config is available to Antigravity only when this branch is checked out
(or later merged). No local desktop setting, global profile, client installation,
OAuth authentication, full provider access or production state is proved by
the commit alone.

Run the safe preflight:

    node automation/agent-kit/mcp-doctor.mjs --config .agents/mcp_config.json

Then use the Antigravity `/mcp` manager or IDE MCP panel for **real** connection
and read-only repo/Worker smoke validation. The GitHub/Cloudflare connectors
available inside ChatGPT are distinct from these Antigravity MCP sessions.
Official setup: https://antigravity.google/docs/mcp

## CLI, Node 22+, Linux filesystem safety

File-based commands require Linux with `O_NOFOLLOW`, `/proc/self/fd` and
`/usr/bin/flock`. The Worker source inspector additionally uses the fixed
`/usr/bin/python3` interpreter (3.11+) and standard-library `tomllib` in isolated
mode. An untrusted `PATH` cannot substitute it; no package or provider call.
Unsupported filesystems/platforms fail closed with `FILESYSTEM_SAFETY_UNAVAILABLE`
rather than silently following private symlinks. This includes Windows; native
Windows file inspection is not claimed supported. Pure configuration/registry
validation functions remain usable without filesystem access.

    node automation/agent-kit/cli.mjs list
    node automation/agent-kit/cli.mjs show gemini-api
    node automation/agent-kit/cli.mjs commands github
    node automation/agent-kit/cli.mjs verify
    node --test automation/agent-kit/*.test.mjs
    node automation/agent-kit/mcp-doctor.mjs
    node automation/agent-kit/mcp-doctor.mjs --config /path/to/your/mcp_config.json
    node automation/agent-kit/worker-gates.mjs

The MCP doctor is an **offline** read-only inspector. It checks four
allowlisted MCP IDs and status: PREPARED_DISABLED, NOT_CONFIGURED,
ENDPOINT_MISMATCH, ENTRY_INVALID, or CONFIGURED_UNVERIFIED. An omitted `disabled`
means configured/enabled according to the client default, still UNVERIFIED;
only explicit boolean `true` means disabled. It never displays config values,
secret strings or OAuth credentials; `CONFIGURED_UNVERIFIED` does NOT imply a
successful installation, authenticated request, provider permissions, or
runtime availability. The default reads only the committed disabled example;
the `--config` option checks an explicitly supplied local Antigravity file.

The Worker Gate inspector parses actual TOML tables, including comments, quoted
values and multiline arrays. It checks the exact Worker names, five OFF flags,
1970 expiry, private service targets/entrypoints and SQLite declarations; comments
or unrelated tables cannot satisfy those requirements. It reads only repository
TOML/package metadata and never infers authenticated RPC, deployments or CI.
See `CLOUDFLARE_WORKER_TOOLING.md` for the five-stage roadmap and commands.

The commands operation prints registered commands but never runs them. External
commands may consume credits or trigger workflows; check permission/budget first.

After a REAL action, record the genuine evidence, for example:

    node automation/agent-kit/cli.mjs record github checks PASS --evidence https://github.com/dizigs/archelaos-site/actions/runs/42284982522

Use --ref followed by an actual 40-character commit SHA when available. A PASS
must be proven by the referenced log, not inferred from a proposal or a screenshot.
Use UNKNOWN for unresolved provider outcomes.

The tool stores local JSONL in automation/agent-kit/.private/activity.jsonl
(excluded from Git). Records have time, registered tool/command IDs, outcome,
a canonical GitHub evidence link, optional SHA, previous SHA-256 and event hash.
Held directory descriptors and final-component `O_NOFOLLOW` protect both verify
and record from `.private`/log symlink redirection. Owner-only permissions,
regular single-link files, bounded reads and metadata consistency checks are
required; config reads are capped at64KiB and the audit log at8MiB. Valid receipts
without their final newline retain a separator before the next append.
Descriptor magic-link availability and inode identity are checked before child
lookups and again on `ENOENT`. If `/proc/self/fd` is unavailable, verification
fails as `DESCRIPTOR_PATHS_UNAVAILABLE`; it cannot report a lost log as empty.

A persistent version-marked lock file is protected by a kernel `flock` held
through the open descriptor. Writers wait at most2seconds and report
`AUDIT_LOCK_BUSY`; process death releases the kernel lock without guessing a
PID is stale or unlinking another writer's lock. Append still uses the same
read/validated descriptor and is fsynced before success is returned.

An unmarked legacy wx-only lock or interrupted first-time lock initialization
fails closed as `AUDIT_LOCK_PROTOCOL_UNVERIFIED`. It is not automatically removed.
For migration, first stop all old and new writers using that checkout, confirm
they have exited and back up the private receipts privately; only the operator
may then remove an unmarked lock and re-run verify/record. Never remove an active
or version-marked lock to bypass contention. No private backup/log is committed.
The verify command checks the chain. No API keys, prompts or provider payloads
are logged. These receipts are technical local evidence; the existing LIVE Sheet
and Issue71 remain the canonical task/status journal, not this local file.

## Very important limitations

- Local logs ARE NOT centrally synchronized, backed up, externally timestamped
  or cryptographically signed. Hash chains detect many accidental edits but
  cannot stop a host with filesystem write access from replacing the whole log.
- Existing services and all ChatGPT/Codex sessions ARE NOT automatically
  instrumented. Complete observability needs provider webhooks, explicit
  wrappers or connectors, and verified end-to-end ingestion.
- For central technical command receipts, coordinate with the existing Tool
  Audit work in PR #282: server-side auth, timestamps, idempotency, retention,
  integrity proofs and readback need separate acceptance. Do not duplicate that
  pipeline, create another task journal, or publish raw private logs. Task status
  and operational LOG entries remain in the existing canonical LIVE Sheet.
- A code-only PR, green unit test and stored secret name DO NOT prove
  successful live connectivity, deployment or API billing.

## Agent guardrails (Gemini, Antigravity, Codex and MCP clients)

1. Read the canonical task tracker, public registry and private access
   registry (only when authorized) before starting work.
2. Reuse installed Workers and GitHub workflows. Preserve owners and avoid
   duplicate PRs or concurrent edits in the same files.
3. Pin the exact source SHA, command scope and permissions before any action.
4. Brain owns task routing, durable authorization, private access decisions
   and the shared EUR 20/month AI budget; no bypasses from an MCP client.
5. Record real execution logs with outcome and immutable evidence. Separate
   CODE_READY, CI_PASS, DEPLOYED, CONNECTED and AUTHENTICATED. Missing data
   always means UNKNOWN.
6. Never expose credentials, private documents, contributor details or minors'
   personal information to a third-party model without separate approval.
7. For candidate MCPs, verify vendor/release, permitted installation,
   least-privilege access, read-only smoke and audit readback before marking
   them as installed.
8. No automatic merge, production deployment, repeated billable Antigravity
   calls, new schedule or live Self-Heal activation by this Agent Kit.

## Prioritized integration plan

1. GitHub MCP: review current release, read-only repo-scoped permissions,
   real code/PR readback.
2. Cloudflare MCP: Worker-specific read/observability only; no deploy.
3. SonarQube MCP: reuse existing account and security evidence.
4. Playwright CLI: real browser QA of public pages without credentials.
5. Firecrawl: public sports news discovery with budget, dedupe and provenance.
6. Gemini / Antigravity: only through approved Brain contracts and documented
   billing controls. Source-only managed-agent PR #270 remains paused.

Do not label candidates INSTALLED until their live test is independently proven.
For private registry updates use the existing connected Google Workspace
authorization; never commit private inventory rows to this public repository.
