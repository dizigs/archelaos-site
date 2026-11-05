# Apps Script safety inventory (isolated, non-production)

**Status:** Source-only proposal in its own PR. No Worker mount, OAuth change,
script edit, trigger execution, production deployment, or additional schedule.

## Design / existing PR #124

The merged PR #124 already implements the ONLY approved Google Apps Script
write and rollback path in \`../editor.mjs\` (\`ScriptEditor.mutate()\`):
verified actor/project, existing SQLite operation locks, exact full source
content hash, immutable encrypted readback backup, external-writer exclusion
port, trigger verification port, review gate, controlled update and
post-write reconciliation. **Never use this module to write Google source.**

This supplement provides (a) read-only project inventory using the EXISTING
GoogleProjects project binding; (b) source-drift discovery with the EXACT
existing \`contentHash(projectId, normalizeFiles(...))\` algorithm; (c) limited,
non-authoritative *advisory* lease for read-only bridge work; and (d) secret-
redacted metadata audit entries.

All new paths are confined to \`automation/apps-script/safety/\` and are
intentionally NOT mounted in the existing Worker. Proposed integrations
must be separately reviewed before any production mount. Existing PR #124
files, Cloudflare source, secrets, binding names, OAuth scopes and web routes
remain unchanged.

## Limitations that must not be hidden

- Google Apps Script Projects REST does **not** return a complete inventory of
  installable triggers or an authoritative list of all active external editors.
- A \`webapp\` section in \`appsscript.json\` is deployment configuration, NOT
  an installable trigger. Only \`WEBAPP_CONFIGURATION\` / optional macro metadata
  is collected here, not a claim that any scheduled trigger exists.
- A SQLite Durable Object lease synchronizes only cooperating bridge callers;
  it cannot lock Google's Web IDE, independent Google OAuth clients, other
  Google accounts or another unrelated Worker. No code in this module uses
  advisory leases to authorize edits.
- Projects \`get\` metadata is not Drive \`lastModifyingUser\` data; we persist
  \`lastModifyUser=null\` rather than pretending it is verified.
- The snapshot contains NO source text or tokens. Deployment/version metadata
  is optional. If an authorized provider lacks these ports, arrays are empty
  rather than falsely declaring the underlying Google inventory complete.
- This is not a replacement for complete authorized trigger introspection,
  actual Admin OAuth grant, Google source read, private backup, or real
  external-writer exclusion. Those remain prerequisites for live writes.
- An advisory lease has an expiry and can be reacquired after TTL. Never treat
  this as a general scheduler or a guarantee of safety for remote edits.

## Trusted integration (future; intentionally not wired)

Run the safety store inside the ALREADY EXISTING \`MuseumScriptCoordinator\`
Durable Object, using its actual \`storage\` and \`transactionSync\`/SQL port:

\`\`\`js
import { SQLiteSafetyStore } from './safety/store.mjs';
import { AuditLogger, AppsScriptInventoryService, LeaseManager } from './safety/index.mjs';

// Inside the existing DO's authorized private code path, after verifying caller:
// const store = new SQLiteSafetyStore(this.ctx.storage);
// const auditLogger = new AuditLogger({ store });
// const inventory = new AppsScriptInventoryService({
//   projectId: configuredExactProjectId,
//   projectTitle: configuredExactProjectTitle,
//   provider: authorizedGoogleProjects, // PR124 GoogleProjects; fixed exact ID
//   store, auditLogger
// });
// const snapshot = await inventory.sync(); // READ ONLY
// const leaseManager = new LeaseManager({ store, auditLogger });
\`\`\`

Never accept a project ID or Google URL supplied by an untrusted request.
Use PR #124's authenticated authorizer and single-project binding; do NOT
create a public inventory endpoint. Do not attach this module to
\`/api/apps-script/changes\` or replace \`ScriptEditor\`. The exported
\`executeGuardedWrite()\` is a deliberate fail-closed tripwire that always
throws \`WRITE_MUST_USE_PR124_SCRIPT_EDITOR\`.

## Security checklist prior to eventual integration

1. Verify exact existing Worker source version, DO binding and production
   source preservation using real Cloudflare readback/logs.
2. Reuse the existing Admin OAuth scopes and exact Google project binding.
3. Privately prove source read, real complete trigger inventory and independent
   external-writer exclusion where required; don't use an unverified
   \`exclusivityAttestation\` boolean as proof.
4. Keep \`liveWritesEnabled=false\`. Only the existing ScriptEditor may edit
   after all of its separate hard gates pass.
5. Retain all regression tests for PR #124. Do not open extra Workers or
   schedules or merge until branch protection / CI / Sonar reviews finish.

## Tests

\`\`\`bash
node --test automation/apps-script/safety/*.test.mjs
node --test --test-reporter=tap --test-concurrency=1 tests/apps-script/*.test.mjs
\`\`\`

Tests use synthetic source and fake Google transport. Their passing is NOT
proof of live Google execution, Cloudflare deployment or Google-trigger
completeness. The schema file is for explicit review/migration only:
\`SQLiteSafetyStore\` initializes its own tables on the existing DO; never
run it on a different KV store or a second Durable Object.

## Next handoff

- See [Issue #71](https://github.com/dizigs/archelaos-site/issues/71) and
  [Issue #108](https://github.com/dizigs/archelaos-site/issues/108).
- Gemini's separate trigger-audit research must be reviewed in its own scope
  and must not mutate the safety directory or PR #124.
