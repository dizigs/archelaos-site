# Antigravity / MCP onboarding — workspace configuration, OAuth pending

This document is a source-only handoff for the existing Antigravity owner.
The PR now contains a project-scoped `.agents/mcp_config.json`; when checked
out into an Antigravity workspace, the client can discover configured MCP
endpoints. This does NOT install software on the user's device, grant OAuth
consent, prove any live MCP connection, or change Cloudflare production.

Official docs:
- https://antigravity.google/docs/mcp
- https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/
- https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md
- https://github.com/SonarSource/sonarqube-mcp-server
- https://developers.google.com/workspace/guides/configure-mcp-servers

## Workspace MCP configuration (added to this PR)

The project-scoped `.agents/mcp_config.json` includes exactly four
reviewed remote endpoint declarations, with **no credentials**:

- `github-readonly` → `https://api.githubcopilot.com/mcp/x/all/readonly`:
  `disabled: false`. Read-only GitHub operations only, with runtime OAuth
  authorization still required on the client. Only authorize the required
  repository.
- `cloudflare-docs` → `https://docs.mcp.cloudflare.com/mcp`:
  `disabled: false`. Public Cloudflare documentation, no account write access.
- `cloudflare-api` → `https://mcp.cloudflare.com/mcp`:
  `disabled: true`. Remains OFF until the user completes a reviewed,
  least-privilege Cloudflare OAuth flow. Start from Minimal/read-only scopes
  and do not enable deployment permissions or automatic approvals.
- `firecrawl-search` → `https://mcp.firecrawl.dev/v2/mcp-search`:
  `disabled: true`. Its dedicated search-only surface requires its own OAuth
  identity and client consent. Do not confuse this with the limited keyless
  `https://mcp.firecrawl.dev/v2/mcp` endpoint, which has a different toolset.
  Never claim keyless authenticated search-only operation without proof.

**These settings exist ONLY on PR #280 until the branch is actually checked
out or merged.** No local Antigravity client, desktop profile or global
configuration was modified by GitHub, and no OAuth handshake was performed.
An enabled `serverUrl` is CONFIGURED_UNVERIFIED, not CONNECTED or INSTALLED.

The separate `automation/agent-kit/mcp_config.example.json` remains
disabled for both GitHub and Cloudflare API so it cannot accidentally be
pasted into a sensitive global client and appear already authenticated.

Antigravity IDE: Agent panel → MCP Servers → Manage MCP Servers.
Antigravity CLI: `/mcp`; global config at
`~/.gemini/config/mcp_config.json`. For this project use
`.agents/mcp_config.json` and do not commit OAuth tokens.
Run `node automation/agent-kit/mcp-doctor.mjs --config .agents/mcp_config.json`
for an offline assessment. Use the live client /mcp panel for actual
OAuth/server-tool status and then a scoped read-only smoke test.
See https://antigravity.google/docs/mcp for the supported client setup.

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
- Firecrawl: project-declared search-only MCP is disabled pending OAuth;
  public web research only after checking plan, privacy and duplicate data
  sources; do not put unreviewed scraped text into news.

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

For actual Worker tooling readiness (real paths, pinned Wrangler version,
local Explorer and five evidence gates), see CLOUDFLARE_WORKER_TOOLING.md.
