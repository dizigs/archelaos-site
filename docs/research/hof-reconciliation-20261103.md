# Issue #57 — canonical Hall reconciliation, 3 November 2026

Base: `2b0a7a3394ef68c33e938d65ca6d54d947b7fd21`. Functional commit: `e433af4038ea5b0b29ac3cab4e1990e97a2a8a1b`.

## Scope and verified inventory

Issue #57 and all eight available comments, Issues #71 coordination, and merged PRs #76, #84, #85 and #103 were read before editing. All nine open PR file lists were checked; no active PR owned these Hall paths. No historical source file, retired identity, private source or active PR implementation was modified.

The current canonical feed contains **771** unique people; the historical staged archive contains **680**. All 680 historical IDs remain canonical; 91 additional canonical IDs are preserved. The earlier 763/682 snapshot predates the ten additions in #37 and the two deliberate identity consolidations in #76. Neither snapshot is a public limit.

Initial differences: **57 Greek biographies, 32 English biographies, one name**, across **57 people** (90 fields, overlapping categories). All 75 literally retained fields and the 15 non-containment fields were reviewed. The resulting inventory has 57/33/1 differences (91 fields): the additional English difference is the restored sourced Marinopoulos team paragraph. Making the historical snapshot equal to the canonical feed is not the objective.

Final dispositions: 77 fields retain the legacy text, four retain the same facts in revised prose, two preserve the approved spelling, two preserve explicit archive qualifications, two retain conflicting ranks with a qualification, and four fields on three people require additional primary evidence. Manual decisions are tied to exact before/after SHA-256 values; future edits invalidate the review rather than silently inheriting it.

## Fixes and remaining evidence

| Person ID / component | Confirmed problem and action | Status |
|---|---|---|
| `arch-3fe6e9ae9b29` — Χρήστος Τορτοπίδης | Restored neutral club/event/1994/74 kg participation in EL/EN. Retained both first/second-place claims as disputed and the team placing; removed the unqualified English champion assertion. The independent bilingual source profile already records this conflict. | DONE wording; BLOCKED original individual results |
| `arch-f6152b60c43f` — Βαγγέλης Μαρινόπουλος | Restored the named 5 July 2025 OAKA winning trio in EL/EN from the already approved `news.json` article `archery-national-oaka-team-title-2025`; added its public source citation and a standalone-profile addendum. All richer canonical facts remain. | DONE roster; BLOCKED 2024/2026 team Cup claims and exact 2026 roster |
| `arch-f56820c52e55` — Χρήστος Λιμπανοβνός | Corrected legacy Greek/English spelling only in generated public profiles, titles and Person metadata; the canonical name and original archived HTML remain preserved. The production standalone page still has the old spelling in the readback below. | DONE locally; production change NOT VERIFIED |
| `arch-e6b31b31c3a9` — Άγγελος Παρούσης | Same established coach-surname correction propagates into the generated biography without deleting competition details. | DONE locally |
| `arch-af9470c5745f` — Σάββας Τσεντίδης | Richer coaching chronology, 1994 placings and Soulis result retained. Legacy 88/115 kg and U15 coaching years 2024–25 lack corroborating original results/rosters in available records; no automatic restoration. | BLOCKED primary evidence |
| `arch-999730e06982` — Σταματία Κυπαρίσση | Officially attributed career chronology and 2022 honour retained. The older starting-national-team/position claim is not confirmed by the available approved news; an evaluative ambassador phrase is not treated as an independently verified fact. | BLOCKED primary evidence |
| `arch-7a113e11ae86` — Βασίλης Ευκαρπίδης | All donation dates/amounts and roles remain, together with the existing original-minutes caveat. No private minutes published and no caveat removed. | Preserved; original-minutes verification remains qualified |
| Release biography projection | Reversed canonical/archive mapping could preserve or reintroduce older summaries. Projection now expands text only when every original character/fact is contained in the canonical text, allowing whitespace/entities and the established spelling correction. Independent richer/contradictory prose remains intact. **45 Greek and 22 English expansions on 46 distinct IDs**; identity sets unchanged. | DONE |
| Addenda / swimming fact deduplication | Canonical expansion and independently appended results could repeat the same paragraph, including when apostrophe escaping differed. Compare normalized text before appending; the restored roster occurs exactly once in each language. | DONE |
| Event graph command | Standalone `build_event_graph.py` still read the historical snapshot although the release builder already used canonical data. The command now reads the root master; a synthetic canonical ID beyond 682 survives an approved event edge. | DONE |

Primary third-party sources were not freshly fetched in this session. The restored roster is supported by an already approved repository article and its explicit public reference. Unconfirmed ranks/weights/cup claims are not promoted to verified facts. Historical staged JSON and all `source-profiles` HTML remain byte-for-byte unchanged in Git.

## Reproduction and tests

```sh
python rebuild/tools/build_release.py
python rebuild/tools/verify_release.py
python rebuild/tools/hof_reconcile.py --check
python -m unittest discover -s rebuild/tests -p hof_reconciliation_test.py -v
python tools/validate_site.py
python rebuild/tests/check.py
python rebuild/tests/event_graph.py
python -m unittest discover -s rebuild/tests -p canonical_archive_index_test.py -v
python -m unittest discover -s rebuild/tests -p archive_relationships_test.py -v
python -m unittest discover -s rebuild/tests -p security_workflows_test.py -v
python rebuild/tools/guard_html_escaped_text.py --dist
python -m compileall -q rebuild/tools
```

Confirmed: 19 new Python tests, six existing archive-index tests, five existing archive-relationship tests, three workflow-security tests, event graph QA, build/release QA, root/rebuild validation, escaped-text guard, ESLint and actionlint pass. New real Chromium regression: **15 cases** on desktop 1365px, tablet 820px and mobile 390px, four sampled canonical IDs, both Hall/global viewers, both languages and the full runtime search identity set. Local browser uses pinned Playwright 1.58.0 with the installed system Chromium; CI installs its pinned browser.

The new Python tests run in existing Release integrity after the build. The browser cases run in existing Site stability regressions. No scheduled workflow, production automation, permission or required check was changed. Development test failures (wrong search fixture path/query parsing, selecting the global viewer as the Hall viewer, reading hidden English text as visible, and duplicate escaped swimming results) were corrected and retested; these are not reported as production outages. Broader real Chromium checks also pass: 49 stability cases / 72 page-viewports / 608 card surfaces; 32 accessibility page-viewports with zero axe findings or interaction errors; full desktop/mobile release smoke including profile navigation. Remote CI results are recorded in the linked PR and handoff after completion.

## Actual production observation, distinct from this branch

At 17:33 UTC, read-only `curl` requests through the configured proxy returned HTTP 200 for the canonical JSON, biography index and people sitemap, each with **771** entries/URLs. Three sampled profile `.html` requests returned legitimate **308** redirects to extensionless paths, then **200**. The Limpanovnos standalone profile still spells both names incorrectly; Tortopidis standalone already contains the English uncertainty caveat, which the canonical English summary lacked. Full response hashes/statuses are in `hof-production-readback-20261103.json`.

Initial Python urllib calls to those six exact paths returned HTTP 403. Changing to the configured-proxy curl client succeeded; no credentials or GitHub permissions were changed. This is not evidence of a GitHub authorization failure. No unchanged failed API endpoint was retried. Cloudflare deployment commit/logs for this branch: **NOT VERIFIED**. No merge or production publication is claimed. Private Sheet access is unavailable; Issue #71 is the authorized coordination fallback.

## Complete ID-by-ID audit

Every divergent person is listed below; field hashes and the manual evidence notes are in `hof-canonical-reconciliation-20261103.json` and `hof-reconciliation-decisions.json`. Canonical-only IDs are listed in the machine-readable report. Generated profile expansion/spelling IDs and preserved archival HTML hashes are listed separately in `hof-profile-projection-20261103.json`.

| Person ID | Name | Fields and decisions |
|---|---|---|
| `arch-23f5b3ca37c0` | Μιχάλης Κουκλής | bio: SEMANTICALLY_RETAINED |
| `arch-25923c326d62` | Λαμπριανή Σωτηρίου | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-2616694d9908` | Νίκος Ζινίσα | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-292b7871cf5b` | Καλλιάνθη Γκιμπή | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-2ec2798d39bb` | Μαρία Κεσενλή | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-39914cf713cf` | Ευστάθιος Δαμπολιάς | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-3c99e241b6d5` | Απόστολος Σαμαλής | bio: LEGACY_TEXT_RETAINED |
| `arch-3fe6e9ae9b29` | Χρήστος Τορτοπίδης | bio: QUALIFIED_CONFLICT; bio_en: QUALIFIED_CONFLICT |
| `arch-44ef21dfb9b7` | Ιωάννης (Γιάννης) Χαρίσης | bio: SEMANTICALLY_RETAINED; bio_en: SEMANTICALLY_RETAINED |
| `arch-4c82271a2365` | Γεώργιος Ευθυμίου | bio: LEGACY_TEXT_RETAINED |
| `arch-510626a0ca62` | Ιωάννης Καραδήμος | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-534d52034523` | Βαγγέλης Λάιος | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-56dd134e165f` | Τάκης Παρασκευόπουλος | bio: LEGACY_TEXT_RETAINED |
| `arch-5de1e130d776` | Μαρκέλα Παπαζήση | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-61d8d097f601` | Αλκίνοος Τασόπουλος | bio: LEGACY_TEXT_RETAINED |
| `arch-64dbf198bfd6` | Ένερι Χασανλάρι | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-64ee11fec8d6` | Αικατερίνη Χατζηβασιλείου | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-660b315e89cf` | Στέφανος Παυλίδης | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-6a4b08bec058` | Ιωάννης Πέτκος | bio: LEGACY_TEXT_RETAINED |
| `arch-73968afa517e` | Σωκράτης Κωνσταντινίδης | bio: LEGACY_TEXT_RETAINED |
| `arch-73fcffd7e0b7` | Γιώργος Καρατζούλας (Γκαρατζούλιας) | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-74c0ecf6103f` | Ελευθέριος Χαριτίδης | bio: LEGACY_TEXT_RETAINED |
| `arch-7653fcf042c0` | Κατερίνα Δαλάκα | bio: LEGACY_TEXT_RETAINED |
| `arch-7a113e11ae86` | Βασίλης (Βασίλειος) Ευκαρπίδης | bio: QUALIFIED_ARCHIVE; bio_en: QUALIFIED_ARCHIVE |
| `arch-7d2d2d8bf363` | Άγγελος Νικολαΐδης | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-85fcb478d724` | Παναγιώτης Διαμαντόπουλος | bio: LEGACY_TEXT_RETAINED |
| `arch-8d1a258f0b09` | Καλλιόπη Γεωργαντά | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-955a386f547f` | Ευάγγελος Χαρίσης | bio: LEGACY_TEXT_RETAINED |
| `arch-96ddd7ba9e4d` | Γεώργιος Μιχαηλίδης | bio: LEGACY_TEXT_RETAINED |
| `arch-999730e06982` | Σταματία Κυπαρίσση | bio: BLOCKED_SOURCE; bio_en: BLOCKED_SOURCE |
| `arch-ae0647a0c701` | Γεώργιος Πόδας | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-af5bad82fe57` | Θεόδωρος Πασαχίδης | bio: LEGACY_TEXT_RETAINED |
| `arch-af9470c5745f` | Σάββας Τσεντίδης | bio: BLOCKED_SOURCE |
| `arch-b1e10ae2cfc0` | Κωνσταντίνος Μυρωτής | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-b48656c62600` | Παύλος Τσεντίδης | bio: SEMANTICALLY_RETAINED |
| `arch-ba8233d165aa` | Θανάσης Ευθυμιάδης | bio: LEGACY_TEXT_RETAINED |
| `arch-baba93550267` | Ζήσης Γαλάνης | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-bc7079f252cc` | Χαράλαμπος Σαββίδης | bio: LEGACY_TEXT_RETAINED |
| `arch-bdcef56af524` | Κυριάκος Τσεντίδης | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-bde5b8a0f677` | Φανή Τσάλου | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-be8668380721` | Γρηγόρης Ευθυμιάδης | bio: LEGACY_TEXT_RETAINED |
| `arch-c51b66db9180` | Κωνσταντίνος Ζάρας | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-cc84a40c4504` | Δήμητρα Δαμπολιά | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-cf53c375664e` | Ιωάννης-Μάριος Τερζόγλου | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-cf55874ef67a` | Νικόλαος Ζαμάνης | bio: LEGACY_TEXT_RETAINED |
| `arch-d25677ab9f72` | Αντώνης Παπαδημητρίου | bio: LEGACY_TEXT_RETAINED |
| `arch-db2ed4303837` | Αλέξανδρος Κατσικάκης | bio: LEGACY_TEXT_RETAINED |
| `arch-e6b31b31c3a9` | Άγγελος Παρούσης | bio: LEGACY_TEXT_RETAINED |
| `arch-e9fc7408640c` | Νικολέτα Τσαρουχά | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-ec55ccba275f` | Θεόδωρος Διαμαντόπουλος | bio: LEGACY_TEXT_RETAINED |
| `arch-edb75edd624b` | Εμμανουήλ Ζάρας | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-f02298025e5c` | Θεοδώρα Αμεξιζίδου | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-f3d93442851f` | Δημήτρης Σουλής | bio: LEGACY_TEXT_RETAINED |
| `arch-f56820c52e55` | Χρήστος Λιμπανοβνός | name: SPELLING_CORRECTION; bio: LEGACY_TEXT_RETAINED; bio_en: SPELLING_CORRECTION |
| `arch-f6152b60c43f` | Βαγγέλης Μαρινόπουλος | bio: BLOCKED_SOURCE; bio_en: LEGACY_TEXT_RETAINED |
| `arch-fbf9bcb00de7` | Χριστίνα Μαυρίδου | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |
| `arch-georgios-athanas-athletics-board-2026` | Γεώργιος Αθανασίου | bio: LEGACY_TEXT_RETAINED; bio_en: LEGACY_TEXT_RETAINED |

## Next

Keep Issue #57 open until the listed original-result/roster claims are resolved and the protected PR is reviewed. Merge only with current required checks and no owner conflicts. After any authorized merge, verify the exact main deployment with real Cloudflare logs and repeat public readback. A green local build or PR check does not establish production deployment.


## Final review / post-merge technical follow-up

PR #119 was merged by ChatGPT at `d5e475d42c20f5b5ad144f90d81287a244c03e2c` while the final validation was running. Its three review fixes are retained. An independent production readback then confirmed duplicate English sections on a sampled page; the merged adapter reproduces this on 52 profiles. The follow-up preserves existing English prose, scopes the legacy root layout once and adds only the 39 missing English sections. Original root/archive files and all canonical IDs/content stay intact.

Functional follow-up: `f073151bacf6a7f6fd01e7a7aa3fa98a6347b410`. Validation is now **36 reconciliation tests and 18 real-browser cases**, including a deliberate HTTP 404 with a shared header, complete language coverage across all 771 profiles, malformed classification rejection, nested/overlapping addenda, repeated-batch idempotence and citation preservation. The 49 stability and 32 accessibility page/viewports and full release smoke also pass.

The existing main Sonar C rating is recorded separately under #66; it also existed before #119. No gate was changed. Final exact-head CI, protected merge and Cloudflare-log evidence: [permanent completion record](https://github.com/dizigs/archelaos-site/issues/71#issuecomment-6612059604). No production success for the follow-up is claimed before that record is verified. The four original-source research cases above remain open.
