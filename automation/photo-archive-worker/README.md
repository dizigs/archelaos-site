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


## D1 metadata contract v1 — PROPOSED, NOT MIGRATED

Live inventory (2026-11-06): **existing** D1 \`archelaos-photo-archive\` (UUID \`d9fc6684-5454-4c77-8776-7ced97ab1d85\`, jurisdiction \`eu\`) has **zero application tables**. No D1 binding is present in this Worker, no SQL below has been run remotely, and Photo Archive activation remains **OFF**. This SQL is an **offline acceptance contract** for the existing D1, not an auto-executing migration. It must later be converted to a reviewed, versioned D1 migration by its owner, with independent approval.

### Identity, consistency and ingestion invariants

- **\`photo_id\` is a permanent opaque ID** (example \`ph_550e8400-e29b-41d4-a716-446655440000\`), independent of bytes, filenames, persons or news URLs. Do not reuse or renumber it, including following duplicates, corrections, legal takedowns or deletion. Brain/durable receipt assigns it once; idempotent replays return the same ID. No AI invents canonical person/event IDs.
- **\`photo_versions\` are append-only**, monotonically numbered per photo. Store the real SHA-256 of each immutable byte snapshot and a private R2 key. Never use a photo ID as an R2 key or silently overwrite an existing version. SHA equality is a duplicate **candidate**, not a reason to merge historical photo IDs.
- Never promote a photo from \`pending\` to public based on a suggested link, comment, AI label or EXIF. Only an authenticated human review can verify source, copyright/license, privacy basis and (when needed) lawful guardian authorization. \`photo_public_readonly\` is **a schema-only view, not a public endpoint**.
- Latest rights/consent decision takes precedence. A revocation or deletion tombstone instantly hides a previously reviewed publication from the read-only view; a separate audited R2 purge workflow must follow. No automated R2 deletion is authorized in this PR.
- Transactions must atomically append the version/evidence/moderation/audit/receipt references and enforce optimistic revision checks in the future authorized D1 adapter. On timeout or ambiguous D1/R2 acknowledgement: mark UNKNOWN, quarantine, never repeat a write blindly.
- Only the canonical Brain may propose private, scoped write intents; never connect an independent scheduler or AI publisher. All metadata and evidence references are private. R2 published variants are separately human-approved, EXIF-cleaned outputs only; no URL is granted by this contract.

<!-- PHOTO_D1_CONTRACT_V1_BEGIN -->
\`\`\`sql
PRAGMA foreign_keys = ON;

CREATE TABLE photos (
  photo_id TEXT PRIMARY KEY CHECK (
    length(photo_id) = 39 AND photo_id GLOB 'ph_????????-????-????-????-????????????'
  ),
  created_at TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'pending'
    CHECK(lifecycle_state IN ('pending','active','tombstoned')),
  rights_state TEXT NOT NULL DEFAULT 'unverified'
    CHECK(rights_state IN ('unverified','verified','rejected','revoked')),
  privacy_state TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK(privacy_state IN ('unreviewed','cleared','rejected','revoked')),
  minor_presence TEXT NOT NULL DEFAULT 'unknown'
    CHECK(minor_presence IN ('unknown','yes','no')),
  guardian_state TEXT NOT NULL DEFAULT 'unknown'
    CHECK(guardian_state IN ('unknown','verified','not_applicable','withdrawn'))
);
CREATE TRIGGER photo_id_immutable BEFORE UPDATE OF photo_id ON photos
BEGIN SELECT RAISE(ABORT,'PHOTO_ID_IMMUTABLE'); END;
CREATE TRIGGER photo_identity_never_delete BEFORE DELETE ON photos
BEGIN SELECT RAISE(ABORT,'PHOTO_ID_TOMBSTONE_REQUIRED'); END;

CREATE TABLE photo_versions (
  photo_id TEXT NOT NULL REFERENCES photos(photo_id),
  version_no INTEGER NOT NULL CHECK(version_no >= 1),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 12 AND 8388608),
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  original_key TEXT NOT NULL CHECK(original_key LIKE 'pending/sha256/%'),
  provenance_ref TEXT NOT NULL,
  exif_state TEXT NOT NULL CHECK(exif_state IN ('unreviewed','stripped','none')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(photo_id,version_no)
);
CREATE INDEX photo_versions_by_digest ON photo_versions(sha256);
CREATE TRIGGER photo_version_sequence BEFORE INSERT ON photo_versions
WHEN NEW.version_no != (SELECT COALESCE(MAX(version_no),0)+1
                       FROM photo_versions WHERE photo_id=NEW.photo_id)
BEGIN SELECT RAISE(ABORT,'PHOTO_VERSION_OUT_OF_SEQUENCE'); END;
CREATE TRIGGER photo_version_immutable BEFORE UPDATE ON photo_versions
BEGIN SELECT RAISE(ABORT,'PHOTO_VERSION_IMMUTABLE'); END;
CREATE TRIGGER photo_version_never_delete BEFORE DELETE ON photo_versions
BEGIN SELECT RAISE(ABORT,'PHOTO_VERSION_DELETE_DENIED'); END;

CREATE TABLE photo_evidence (
  evidence_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id TEXT NOT NULL UNIQUE,
  photo_id TEXT NOT NULL REFERENCES photos(photo_id),
  kind TEXT NOT NULL CHECK(kind IN ('copyright','privacy','guardian_consent','source')),
  decision TEXT NOT NULL CHECK(decision IN ('pending','verified','rejected','revoked')),
  private_evidence_ref TEXT NOT NULL,
  reviewer_ref TEXT,
  created_at TEXT NOT NULL,
  CHECK(decision != 'verified' OR reviewer_ref IS NOT NULL)
);
CREATE INDEX photo_evidence_latest ON photo_evidence(photo_id,kind,evidence_seq DESC);
CREATE TRIGGER photo_evidence_immutable BEFORE UPDATE ON photo_evidence
BEGIN SELECT RAISE(ABORT,'PHOTO_EVIDENCE_APPEND_ONLY'); END;
CREATE TRIGGER photo_evidence_never_delete BEFORE DELETE ON photo_evidence
BEGIN SELECT RAISE(ABORT,'PHOTO_EVIDENCE_DELETE_DENIED'); END;

CREATE TABLE photo_links (
  link_id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  target_kind TEXT NOT NULL CHECK(target_kind IN ('news','hall_of_fame','person','historical_event')),
  target_id TEXT NOT NULL,
  review_state TEXT NOT NULL DEFAULT 'suggested'
    CHECK(review_state IN ('suggested','verified','rejected','revoked')),
  source_evidence_ref TEXT NOT NULL,
  reviewer_ref TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(photo_id,version_no) REFERENCES photo_versions(photo_id,version_no),
  CHECK(review_state != 'verified' OR reviewer_ref IS NOT NULL)
);
CREATE INDEX photo_links_target ON photo_links(target_kind,target_id,review_state);

CREATE TABLE photo_comments (
  comment_id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(photo_id),
  body_private TEXT NOT NULL CHECK(length(body_private) BETWEEN 1 AND 2000),
  contributor_private_ref TEXT,
  moderation_state TEXT NOT NULL DEFAULT 'pending'
    CHECK(moderation_state IN ('pending','approved','rejected','removed')),
  moderator_ref TEXT,
  created_at TEXT NOT NULL,
  CHECK(moderation_state != 'approved' OR moderator_ref IS NOT NULL)
);
CREATE TABLE photo_corrections (
  correction_id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(photo_id),
  field_name TEXT NOT NULL
    CHECK(field_name IN ('year','location','sport','caption','people','rights','source')),
  proposed_value_private TEXT NOT NULL CHECK(length(proposed_value_private) BETWEEN 1 AND 1000),
  moderation_state TEXT NOT NULL DEFAULT 'pending'
    CHECK(moderation_state IN ('pending','accepted','rejected')),
  reviewer_ref TEXT,
  created_at TEXT NOT NULL,
  CHECK(moderation_state != 'accepted' OR reviewer_ref IS NOT NULL)
);

CREATE TABLE photo_duplicates (
  candidate_id TEXT PRIMARY KEY,
  left_photo_id TEXT NOT NULL REFERENCES photos(photo_id),
  right_photo_id TEXT NOT NULL REFERENCES photos(photo_id),
  evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('sha256','perceptual','manual')),
  review_state TEXT NOT NULL DEFAULT 'pending'
    CHECK(review_state IN ('pending','same_subject','distinct','rejected')),
  created_at TEXT NOT NULL,
  CHECK(left_photo_id < right_photo_id),
  UNIQUE(left_photo_id,right_photo_id,evidence_kind)
);

CREATE TABLE photo_tombstones (
  photo_id TEXT PRIMARY KEY REFERENCES photos(photo_id),
  reason TEXT NOT NULL CHECK(reason IN ('erasure_request','rights_revoked','retention_expired')),
  purge_state TEXT NOT NULL DEFAULT 'pending'
    CHECK(purge_state IN ('pending','in_progress','verified_complete','unknown')),
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1)),
  delete_after TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE photo_audit (
  audit_id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(photo_id),
  event_kind TEXT NOT NULL,
  actor_private_ref TEXT,
  event_digest TEXT NOT NULL CHECK(length(event_digest)=64),
  occurred_at TEXT NOT NULL
);
CREATE TRIGGER photo_audit_immutable BEFORE UPDATE ON photo_audit
BEGIN SELECT RAISE(ABORT,'PHOTO_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER photo_audit_never_delete BEFORE DELETE ON photo_audit
BEGIN SELECT RAISE(ABORT,'PHOTO_AUDIT_DELETE_DENIED'); END;

CREATE TABLE photo_publications (
  publication_id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  derivative_key TEXT NOT NULL UNIQUE CHECK(derivative_key LIKE 'published/reviewed/%'),
  derivative_sha256 TEXT NOT NULL CHECK(length(derivative_sha256)=64
                                  AND derivative_sha256 NOT GLOB '*[^0-9a-f]*'),
  exif_removed INTEGER NOT NULL CHECK(exif_removed=1),
  human_review_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(photo_id,version_no) REFERENCES photo_versions(photo_id,version_no)
);
CREATE TRIGGER photo_publication_guard BEFORE INSERT ON photo_publications
WHEN NOT EXISTS (
  SELECT 1 FROM photos p WHERE p.photo_id=NEW.photo_id
    AND p.lifecycle_state='active'
    AND p.rights_state='verified' AND p.privacy_state='cleared'
    AND p.minor_presence IN ('yes','no')
    AND ((p.minor_presence='no' AND p.guardian_state='not_applicable')
      OR (p.minor_presence='yes' AND p.guardian_state='verified'))
    AND NOT EXISTS (SELECT 1 FROM photo_tombstones t WHERE t.photo_id=p.photo_id)
    AND (SELECT e.decision FROM photo_evidence e
         WHERE e.photo_id=p.photo_id AND e.kind='copyright'
         ORDER BY e.evidence_seq DESC LIMIT 1)='verified'
    AND (SELECT e.decision FROM photo_evidence e
         WHERE e.photo_id=p.photo_id AND e.kind='privacy'
         ORDER BY e.evidence_seq DESC LIMIT 1)='verified'
    AND (p.minor_presence='no' OR
         (SELECT e.decision FROM photo_evidence e
          WHERE e.photo_id=p.photo_id AND e.kind='guardian_consent'
          ORDER BY e.evidence_seq DESC LIMIT 1)='verified')
)
BEGIN SELECT RAISE(ABORT,'PHOTO_PUBLICATION_REVIEW_REQUIRED'); END;
CREATE TRIGGER photo_publication_immutable BEFORE UPDATE ON photo_publications
BEGIN SELECT RAISE(ABORT,'PHOTO_PUBLICATION_IMMUTABLE'); END;
CREATE TRIGGER photo_publication_never_delete BEFORE DELETE ON photo_publications
BEGIN SELECT RAISE(ABORT,'PHOTO_PUBLICATION_DELETE_DENIED'); END;

-- VIEW IS NOT AN ENDPOINT. Future authenticated delivery must recheck every right.
CREATE VIEW photo_public_readonly AS
SELECT pub.publication_id,p.photo_id,pub.version_no,pub.derivative_key
FROM photo_publications pub JOIN photos p ON p.photo_id=pub.photo_id
WHERE p.lifecycle_state='active' AND p.rights_state='verified'
  AND p.privacy_state='cleared' AND p.minor_presence IN ('yes','no')
  AND ((p.minor_presence='no' AND p.guardian_state='not_applicable')
    OR (p.minor_presence='yes' AND p.guardian_state='verified'))
  AND NOT EXISTS (SELECT 1 FROM photo_tombstones t WHERE t.photo_id=p.photo_id)
  AND (SELECT e.decision FROM photo_evidence e WHERE e.photo_id=p.photo_id
       AND e.kind='copyright' ORDER BY e.evidence_seq DESC LIMIT 1)='verified'
  AND (SELECT e.decision FROM photo_evidence e WHERE e.photo_id=p.photo_id
       AND e.kind='privacy' ORDER BY e.evidence_seq DESC LIMIT 1)='verified'
  AND (p.minor_presence='no' OR
    (SELECT e.decision FROM photo_evidence e WHERE e.photo_id=p.photo_id
     AND e.kind='guardian_consent' ORDER BY e.evidence_seq DESC LIMIT 1)='verified');
\`\`\`
<!-- PHOTO_D1_CONTRACT_V1_END -->

### Stable cross-reference and pop-up contract

A future private \`PhotoRef\` is \`{photoId, versionNo, targetKind, targetId, evidenceRef, reviewState}\` with \`targetKind\` in \`news|hall_of_fame|person|historical_event\`. All incoming suggestions start \`suggested\` and **must not auto-update** \`news.json\`, Hall of Fame records, timelines or person indexes. On human verification, resolve \`targetId\` against the canonical stable ID; never match solely by display name. Reject ambiguous targets as UNKNOWN. Photos may link to multiple people/events, and every assertion retains per-link provenance. Pop-ups may later read **only reviewed links** and **eligible publications**, with no editable R2 keys or private submitter data.

Future \`PhotoComment\` / \`PhotoCorrection\` records use immutable IDs, private author references, a pending moderation queue, bounded text, reviewer identity, provenance and an append-only audit event. The visual pop-up can show approved comments and accepted corrections only after the parent photo is publication-eligible. Human corrections append a new claim/version; original evidence and photo IDs never get replaced. Free-text content is untrusted data: render via text nodes, not HTML, and never treat suggestions as agent instructions.

### Privacy / retention acceptance matrix

| Data or event | Private intake / D1 | Public eligibility | Required action before activation |
| --- | --- | --- | --- |
| Original bytes and R2 key | Pending-only, private, SHA256, immutable version | Never original object | Quarantine, decode/virus checks; separate sanitized variant and human approval |
| Copyright / licensing | Private source and grant references | Only with latest human-verified copyright grant | Track scope, photographer ownership, attribution, revocation |
| Identifiable adults | Private metadata with lawful basis review | Only after explicit clearance / applicable lawful basis | GDPR notice, minimization, subject request handling |
| Minors / teams | \`unknown\` or \`yes\` denies publication by default | Guardian status and verified evidence required for \`yes\` | Child safeguarding review; no facial recognition |
| EXIF GPS/device/time | Private until reviewed, do not trust claims | Only \`exif_removed=1\` derivative | Remove GPS, thumbnails, device metadata; verify actual encoding |
| Comments & corrections | Pending, private, untrusted; no automatic person matching | Moderated output only after approved parent | Abuse protection, consent/privacy handling, text escaping |
| Duplicate image | Digest/perceptual/manual candidate, no silent merge | Never an approval signal | Preserve immutable IDs and both provenance histories |
| Revocation / deletion | Immutable tombstone ID, audit of limited non-sensitive codes | Excluded immediately from read-only view | Audited R2 purge, backups/caches/derivatives, legal-hold decision and verified deletion |
| Retention / backup | Policy not yet approved | No automatic release | Define controller, purpose, specific periods and GDPR process before collecting real data |

No default retention duration is invented. Purge may be blocked by a genuine legal hold, subject to documented lawful basis and separate review. Records for erasure must be minimized; a tombstone is not permission to retain personal data indefinitely. Public URLs must be revocable and short-lived or served via a policy-checking authenticated Worker; do not expose originals.

### Residency and activation gates (verified 2026-11-06)

\`archelaos-photo-originals\` and \`archelaos-photo-published\` both report **\`location=EEUR\` and \`jurisdiction=default\`**; R2 managed domains are disabled, no custom domains, and lifecycle has only the seven-day abandoned multipart abort rule. There is **no EU jurisdiction guarantee** from the location hint; existing bucket jurisdiction cannot be changed in place. No R2 object list or real-photo content was read. The separate D1 database reports \`jurisdiction=eu\`; these are **not equivalent**. Approve EU-resident replacement buckets only by separate explicitly authorized change after privacy assessment. No new buckets were created here.

**NO-GO gates:** missing approved R2 jurisdiction, no deployed D1 schema or reviewed migration, no canonical Brain verifier/durable receipt and binding, no moderator/rights/consent/legal-basis workflow, no independent authenticated E2E including deletion, no signed production release. \`PHOTO_ARCHIVE_ENABLED\`, \`PHOTO_INTAKE_ENABLED\`, \`PHOTO_EU_REVIEW_APPROVED\`, \`PHOTO_PUBLIC_SUBMISSIONS_ENABLED\`, \`PHOTO_PUBLISH_ENABLED\` all remain \`false\`. No new D1, migrations, Worker deployment, publish endpoint or automatic AI writes.
