# Antigravity / MCP onboarding — staged, disabled

This document is a source-only handoff for the existing Antigravity owner.
It does not change local Antigravity settings, install MCP servers, grant
permissions, or prove that any MCP connection is authenticated.

Official docs:
- https://antigravity.google/docs/mcp
- https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/
- https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md
- https://github.com/SonarSource/sonarqube-mcp-server
- https://developers.google.com/workspace/guides/configure-mcp-servers

## Ready for authorized installation

The peer file mcp_config.example.json is intentionally **not** in the active
workspace .agents/mcp_config.json. Both entries have disabled: true and contain
NO credentials. This ensures simply merging the PR cannot silently connect
an AI agent to a sensitive remote service.

Antigravity IDE: Agent panel -> MCP Servers -> Manage MCP Servers.
Antigravity CLI: enter /mcp or edit global ~/.gemini/config/mcp_config.json;
a checked-out project can use .agents/mcp_config.json as a local config.
Remote MCP entries use the serverUrl field, not the retired httpUrl key.
OAuth takes place in the user's local client, not in GitHub Actions.

The sample provides:
- github-readonly: GitHub's remote read-only toolset path. Its own
  read-only mode blocks write tools, but token permissions still matter.
- cloudflare-api: current Cloudflare API MCP endpoint. Provider toolsets
  can propose writes, so use only a verified scoped OAuth identity and
  restrict exposed/approved tools to read-only before enabling.

Do not copy sample verbatim into an active installation until scopes and
host runtime are checked; keeping disabled: true is the deliberate default.

## Additional MCPs to install through the Antigravity MCP Store

- SonarQube: official store integration, using existing organization and
  a reviewed read-only credential. Check existing GitHub Sonar setup first.
- Google Workspace: official Google-hosted servers for authorized Docs,
  Sheets, Drive, Gmail, Calendar and People, with OAuth per account. This
  does NOT inherit ChatGPT connector authentication. Start with minimal
  scopes and avoid private archive ingestion into outside models.
- Google Developer Knowledge: official Google documentation MCP endpoint;
  separately authorize its project/account before connecting.
- Playwright: local CLI/browser QA, not necessarily a remote MCP endpoint.
- Firecrawl: public web research only after checking plan, privacy and
  duplicate data sources; do not put unreviewed scraped text into news.

## Evidence checklist for EACH connection

1. Known tool ID, provider/release URL and owner entered in registry.json.
2. Runtime and available authentication method independently verified.
3. Least-privilege scopes and non-production resource selection checked.
4. No secret values, auth codes, private document text or email payloads
   placed in GitHub, PR artifacts, screenshot attachments or agent prompts.
5. Actual one-shot read-only request; record exact outcome and provider logs.
6. Real token/model usage and paid charges reconciled, if applicable.
7. Log successful and blocked attempts in the private task tracker and
   existing tool registry; record public-safe GitHub evidence when possible.
8. Upgrade from candidate only after a real verified readback.

Do not use a green GitHub unit test or enabled local config as proof that
OAuth succeeded. Any unresolved status remains UNKNOWN.

## Separation from the Canonical Brain

The Brain remains the sole authority for AI routing, cost reservations,
write permissions and self-healing safety. Existing PR #270 managed
Antigravity calls remain frozen pending reconciliation of their uncertain
billed usage. No managed-agent API invocation or new schedule is part
of this onboarding.
