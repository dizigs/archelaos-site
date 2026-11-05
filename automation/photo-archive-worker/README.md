# ARCHELAOS Photo Archive Worker — future Brain + R2 integration

**Status: CODE-ONLY, OFF, DRAFT. No Cloudflare Worker deployment or runtime connection.** This module is independent of other agents' owned files. The approved original HTML prototype stays unchanged in the ChatGPT Library at:
`/Archelaos.club/Photo Archive - approved prototype/archelaos_photo_archive_mockup.html`.

## Why this exists

The archive is a **crowdsourced historical photo catalog**, not a simple image gallery. A visitor may suggest a year, location, sport, team, people, or a memory. Suggestions stay **unverified** until reviewed; avoid automated facial identification or automatic assertions about real people.

Existing **private R2 buckets** (created/verified by the Cloudflare connector):
- `archelaos-photo-originals` — originals / future moderated submissions.
- `archelaos-photo-published` — future, separately approved delivery variants.

Readback showed both buckets in the EEUR region, Standard storage, R2 managed public access OFF and no custom domains. **Their jurisdiction is `default`, NOT an EU-only residency guarantee.** Data residency and GDPR suitability must be reviewed **before any real photo is uploaded**; if EU jurisdiction is required, use EU-jurisdiction buckets instead of assuming EEUR suffices. Do not silently migrate private/user data.

## Worker isolation

- Worker target name: `archelaos-photo-archive-staging`, **not created or deployed**.
- Wrangler file declares both real private R2 buckets; bindings will exist **only if an authorized future deployment occurs**. No public R2 domains/website route/cron/workers.dev/preview URL.
- Public `fetch()` returns 404. Private WorkerEntrypoint RPC only.
- Photo upload/intake, archive and EU review flags are all **false** by default. No publish operation exists.
- `stageOriginal` accepts only bytes of JPEG/PNG/WebP <=8MB with verified magic bytes. Uses SHA-256, deterministic pending-only object keys; never user-supplied filenames, comments or identities in keys.
- Before R2 put, it calls `env.BRAIN.verifyPhotoArchiveIntent({receiptId,scope,sha256,byteLength,mimeType})`. **This is a proposed interface only, not currently implemented in canonical Brain.** Missing method/binding, expired/mismatched proof, invalid data and unapproved residency all fail closed.
- An ambiguous R2 acknowledgement yields `PHOTO_R2_ACK_UNKNOWN` and no automatic retry. Future Brain owner must reconcile durable receipts and audit status before any repeat.
- No access to the public gallery; no auto-publish; no moderation override; no independent dispatcher or AI ledger.

## Future operator-controlled rollout (sequence)

1. Owner of canonical Brain (#234 and merged Brain) reviews a **new isolated** `photo_archive` capability and signed/photo-specific authorization and durable receipts. The Brain's own SQLite/DO remains sole decision state and AI budget authority (20 €/month). Align actual staging deployment SHA and Service Binding identity first; no fallback public endpoint.
2. Data protection review: rights/consent (including minors and third-party copyright), GDPR privacy notice, EU jurisdiction choice, retention/deletion requests. Verify all R2 bucket settings; establish audit/backup policy. Keep private originals private.
3. Photo worker deploy to staging **only after separate approval** and exact-head CI. Install the two R2 bucket bindings plus a scoped **private** Service Binding `BRAIN` to the one canonical Brain, with authorization scoped to `photo.original.stage`. No additional public routes, no cron, no autonomous AI calls. Verify health/readback.
4. Test with an approved non-personal synthetic image: one signed Brain intent -> private stage -> R2 pending key -> Brain durable receipt and readback -> duplicate and UNKNOWN failure recovery. Do not claim E2E until real remote evidence exists and independent acceptance passes.
5. Only after data protection and moderation controls: approved image validation/scanning, EXIF removal for public derivatives, separate human publication gate and provenance/source license logging. Create real public delivery endpoint in a **separate reviewed** change; published bucket must not accept automatic copies from pending originals.
6. Connect the approved HTML UX: Turnstile, abuse protection, rate limits, time-limited upload authorizations, accessibility, secure submit/comment routes, privacy consent, GDPR deletion and user notifications. Public suggestions must be stored **pending** with an authoritative ID and vetted before linking to HOF, Stories, News or person index.
7. Stage tests, performance/usage budget alerts, access and rollback checks, Release Captain decision, then explicit production activation approval.

## Owner coordination and boundaries

- `automation/photo-archive-worker/**` is this worker's exclusive ownership.
- Do not edit ongoing #213/#217/#233/#234/#235 integrations, the Brain runtime, Pages deployment settings, the approved HTML prototype, or existing service-worker configurations.
- Record binding inventories and ingress plans in Cloudflare integration owner #233.
- Record pending-only `photo_archive` capability proposal in Brain owner #234, not as a second coordinator.
- Photo archive storage should later integrate with already existing news/HOF/person references through reviewed, canonical IDs only.

Tests: `node --test automation/photo-archive-worker/test/*.test.mjs` or from directory `npm test`.
