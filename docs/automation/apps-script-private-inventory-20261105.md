# Apps Script — private Admin inventory (05 November 2026)

**Status: SOURCE-ONLY PR, OFF / NO CLOUDFLARE DEPLOYMENT / NO GOOGLE WRITE.**

This incremental change brings the previously merged PR #203 metadata inventory
into the existing PR #124 same-Worker composition, without new scopes, OAuth
grants, Worker services, triggers, keys, or any modifications to Google code.

## Behavior after separately reviewed deployment

`GET /api/apps-script/inventory` on the existing
`archelaos-automation-bridge` Worker:

1. Requires the exact **existing** HttpOnly Admin OAuth browser session via
   `oauth.access(cookie)`, then the verified `script.projects` grant and
   configured Admin account in `requireGrant`.
2. Uses existing fixed `APPS_SCRIPT_PROJECT_ID/TITLE` and the original
   `GoogleProjects.metadata()/content()` read-only provider. The caller cannot
   choose an alternative project, filename, access token or API host.
3. In the **same** project-scoped `MuseumScriptCoordinator` Durable Object,
   instantiates PR #203 `SQLiteSafetyStore` / `AuditLogger` /
   `AppsScriptInventoryService` and stores **only internal project metadata**,
   source content hash, file count, manifest configuration and conservative
   `NOT_VERIFIED` trigger visibility. Private raw source stays in Google.
4. Returns only `status`, `fileCount`, boolean read-only proof flags and
   **explicit** `installableTriggersComplete:false`,
   `externalWriterExclusionVerified:false`, `liveWritesEnabled:false`.
   No code, credentials, Google project ID, source hash, filename list or
   raw trigger details leave the private service.
5. Strict GET/no-query only, `Cache-Control: no-store`, no public inventory,
   no new executor or editor permissions. Without a valid Admin session, it
   fails closed. All existing `/health`, OAuth, backup and editor routes
   preserve their own behaviors.

## Security limitations

- Google Apps Script Projects API **cannot enumerate all installable triggers
  across multiple editors/accounts**. The inventory is source/manifest only.
- Google full-collection updateContent has no cross-client atomic CAS. A local
  SQLite lock **cannot** exclude Google IDE or an independently authorized
  API writer. No Google writes are authorized by this PR.
- Prior encrypted-backup count 1 and signed read-only OIDC probe were
  confirmed in prior provider-backed PR #124 evidence from 04 November;
  that is not today's fresh authenticated source read or trigger proof.
- No real private Admin browser GET or Worker deployment has been performed
  in this source-only PR. Keep production untouched until exact-head CI,
  source version review and verified Cloudflare deployment/rollback logs.

## Validation

```bash
node --test tests/apps-script/inventory-browser-route.test.mjs
node --test --test-reporter=tap --test-concurrency=1 tests/apps-script/*.test.mjs
node --test automation/apps-script/safety/*.test.mjs
```

## Next steps

1. Pass GitHub CI/Sonar/CodeQL and independent review with branch protection.
2. Separately deploy the **approved exact code** to the *existing* Worker
   preserving all existing bindings/modules and known rollback version.
3. In the Admin's already authenticated browser, use the private GET inventory
   route to verify a **fresh** full Google source read and metadata-only storage.
   Record only fixed audit statuses/counts. Do not export code/tokens/IDs.
4. Independently verify trigger inventory and cross-account writer exclusion,
   complete a fresh encrypted backup and signed command authorization before
   any *separate* comment-only smoke write/readback/rollback.
5. Link only independently verified metadata to central Brain PR #201, after
   genuine private `apps_script` intake support in PR #111.

Issues: #71, #108. Existing merged PRs: #124, #203.
Related isolated draft PRs: #201, #205.
