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
pre-enabled. The Cloudflare API MCP remains disabled pending reviewed,
minimal-scope OAuth, and no credential/token is committed.

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

## CLI, Node 22+

    node automation/agent-kit/cli.mjs list
    node automation/agent-kit/cli.mjs show gemini-api
    node automation/agent-kit/cli.mjs commands github
    node automation/agent-kit/cli.mjs verify
    node --test automation/agent-kit/*.test.mjs
    node automation/agent-kit/mcp-doctor.mjs
    node automation/agent-kit/mcp-doctor.mjs --config /path/to/your/mcp_config.json

The MCP doctor is an **offline** read-only inspector. It prints only two
allowlisted MCP IDs and status: PREPARED_DISABLED, NOT_CONFIGURED,
ENDPOINT_MISMATCH, or CONFIGURED_UNVERIFIED. It never displays config values,
secret strings or OAuth credentials; `CONFIGURED_UNVERIFIED` does NOT imply a
successful installation, authenticated request, provider permissions, or
runtime availability. The default reads only the committed disabled example;
the `--config` option checks an explicitly supplied local Antigravity file.

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
A local lock serializes writers; a disk flush follows append. The verify command
checks the chain. No API keys, freeform prompts or provider payloads are logged.

## Very important limitations

- Local logs ARE NOT centrally synchronized, backed up, externally timestamped
  or cryptographically signed. Hash chains detect many accidental edits but
  cannot stop a host with filesystem write access from replacing the whole log.
- Existing services and all ChatGPT/Codex sessions ARE NOT automatically
  instrumented. Complete observability needs provider webhooks, explicit
  wrappers or connectors, and verified end-to-end ingestion.
- For a centrally accessible event history, add a separately authorized
  private append-only store with server-side auth, timestamps, idempotency,
  retention, integrity proofs and readback. Do not publish raw private logs.
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
