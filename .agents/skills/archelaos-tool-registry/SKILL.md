---
name: archelaos-tool-registry
description: Use when the Archelaos workspace agent needs to select a connected tool, verify Gemini or Antigravity MCP readiness, inspect commands, record genuine action evidence, or troubleshoot an integration without creating duplicate Workers.
---

# Archelaos Tool Registry — Antigravity workspace skill

This skill lives in `.agents/skills/` so Antigravity can discover it in
the checked-out `dizigs/archelaos-site` workspace. It is **not** a credential,
MCP server, automatically granted permission, or live Brain integration.

## Before choosing any tool

1. Read root `AGENTS.md`, `docs/LIVE_TASK_TRACKING.md`, the existing Issue #71
   coordination record, and `automation/agent-kit/README.md`.
2. Read the public-safe machine registry with:
   `node automation/agent-kit/cli.mjs list`.
3. Inspect the specific tool: `node automation/agent-kit/cli.mjs show <tool-id>`
   and its available commands:
   `node automation/agent-kit/cli.mjs commands <tool-id>`.
4. Distinguish `verified`, `reported`, `paused` and `candidate`.
   These are **inventory** statuses, not proof of live authentication.
5. When using a tool with budget or external effects, check the private
   authoritative registry through authorized access. Never assume the
   ChatGPT connector credentials work inside Antigravity.

## Antigravity MCP readiness

Run `node automation/agent-kit/mcp-doctor.mjs` to inspect the committed
DISABLED example configuration. For a separately supplied local config,
run `node automation/agent-kit/mcp-doctor.mjs --config <absolute-path>`.
This inspector does not call vendors, inspect billing or authenticate.
`CONFIGURED_UNVERIFIED` is explicitly **not** `INSTALLED` or `CONNECTED`.

Available staged examples: `github-readonly` and `cloudflare-api`.
To activate any MCP, separately verify its exact current official endpoint,
owner, OAuth account, read-only scope, provider readback, logs, security
review and budget. Never activate, alter or leak OAuth/tokens based only
on this skill. See `automation/agent-kit/ANTIGRAVITY_MCP.md`.

## Evidence and command lifecycle

After a **real** completed action, record its task ID in the canonical
private Google Sheet through an authorized connector, attach an exact
commit/run URL and actual outcome, and update the access registry if a
tool's installation, permission, billing or capability changed.

The CLI has an optional **local** receipt command:

`node automation/agent-kit/cli.mjs record github checks PASS --evidence https://github.com/dizigs/archelaos-site/actions/runs/<actual-run-id>`

Do this only when the referenced result actually proves the claim.
`node automation/agent-kit/cli.mjs verify` only checks local receipts;
it does NOT sync them to the Brain or a remote audit database. Preserve
`UNKNOWN` when a provider call or readback cannot be verified.

## Guardrails

- Never expose API keys, secrets, private Drive content or contributor
  personal information in prompts, public GitHub files or logs.
- Do not merge, deploy, execute paid models, register new schedules or
  activate Self-Heal through this skill.
- Reuse existing workflows and Workers; do not invent competing resources.
- Keep exact source SHA and failure evidence; a passed unit test cannot
  establish a successful Cloudflare deployment or provider authentication.
- The separate private audit proposal PR #282 is source-only until
  independently accepted and connected through approved Brain authority.
- If the intended tool is unavailable, return `NOT_CONNECTED` or `UNKNOWN`
  rather than creating an undocumented fallback.
