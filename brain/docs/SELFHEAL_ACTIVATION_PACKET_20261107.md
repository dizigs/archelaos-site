# Brain ↔ Self-Heal — προετοιμασία ενεργοποίησης (07/11/2026)

**PREPARED / NO LIVE ACTIVATION.** Canonical task: BRAIN-ACK-SETTLEMENT, συντονισμός Issue #71.
Αυτό το πακέτο δεν κάνει deploy/merge, δεν αλλάζει flags, bindings, secrets ή αποθήκευση.
Χρησιμοποιεί το υπάρχον πρωτόκολλο· δεν προσθέτει δεύτερο HMAC/ACK σύστημα.

## 1. Τι είναι ήδη έτοιμο

- Βασική διόρθωση #278 συγχωνευμένη, source baseline a1d7a7fffb335eb1e396b7eccd5935ee3d6f4da6.
- `brain/src/private_hmac_candidate.mjs`: BrainHmacAcceptancePort.runChallenge(),
  HealerHmacAcceptancePort.answerChallenge(), PrivateHmacNonceStore.
- `brain/src/private_hmac_protocol.mjs`: domain-separated HMAC, ακριβή scalar records,
  session/SHA/peer/nonce/deadline, χωρίς αποκάλυψη κλειδιού.
- `brain/test/private_hmac_acceptance.test.mjs`: υπάρχουσες 11 native δοκιμές.
- `brain/test/selfheal_ack.test.mjs`: πραγματικός production-code ACK/readback έλεγχος,
  12/12 από repo root στο run42362714934, exact source bbf5b465...
- Υπάρχον PRIVATE_HMAC_ACCEPTANCE_PROTOCOL.md και ιστορικά evidence διατηρούνται.
- Τα #273/#277 είναι συμπληρωματικά tests, όχι ξανά η αρχική διόρθωση.

**Διόρθωση αρχικής προετοιμασίας:** το πρωτόκολλο υπήρχε ήδη στο main.
Το αρχικό πείραμα αυτού του PR είχε περιττό δεύτερο QA fixture. Αφαιρέθηκε πριν από
οποιαδήποτε συγχώνευση. Η τελική αλλαγή είναι μόνο planner, regression tests και αυτό
το συγκεκριμένο πακέτο. Η ιστορική επιτυχία169/169 του πρώτου SHA παραμένει ιστορική,
όχι αυτόματη απόδειξη του τελικού HEAD.

## 2. Το πραγματικό μπλοκάρισμα που επιβεβαιώθηκε

Τα δύο υπάρχοντα QA previews διαβάστηκαν ξανά:
- Brain:204965a6ba624184bfdfccb94794aff8 / archelaos-brain-qa-isolated.
- Healer:ac43359770de4a058fd77bd4d5257226 / archelaos-healer-qa-isolated.
- Και τα δύο urls=[], deployed_on=null. Δεν δημιουργήθηκε ή εγκαταστάθηκε κάτι.

Όμως η επίσημη Cloudflare τεκμηρίωση λέει ότι Service Binding από preview προς
άλλον Worker καλεί τον **production/parent Worker**, όχι το αντίστοιχο preview.
Επομένως το προηγούμενο σχέδιο preview→preview ΔΕΝ είναι εφαρμόσιμο ως ιδιωτική
διαδρομή. Το environment field δεν αποτελεί τεκμήριο υποστήριξης preview targeting.

Πηγή:
https://developers.cloudflare.com/workers/previews/resources/#limitations
https://developers.cloudflare.com/workers/previews/configuration/

Ο νέος offline planner `brain/tools/selfheal_activation_plan.mjs` απορρίπτει ρητά
`transport:preview-pair`, ακόμη και αν τα υπόλοιπα metadata δηλώνονται επιτυχημένα.
Δεν παρακάμπτουμε το όριο με public URL ή binding προς ανεπιβεβαίωτο parent endpoint.

## 3. Συγκεκριμένη προτεινόμενη διαδρομή — χωρίς νέο Worker

Επαναχρησιμοποίηση των ήδη υπαρχόντων ΔΥΟ Workers, με ξεχωριστά private named QA
entrypoints, απομονωμένα nonce namespaces και όλα τα operational flags OFF.

| Στοιχείο | Ακριβής πρόταση | Τρέχουσα κατάσταση |
|---|---|---|
| Brain named export | υπάρχον BrainHmacAcceptancePort | Δεν εξάγεται από το operational main |
| Healer named export | υπάρχον HealerHmacAcceptancePort | Δεν εξάγεται από το operational main |
| Brain HMAC_PEER | service archelaos-self-heal, entrypoint HealerHmacAcceptancePort | Δεν είναι εγκατεστημένο |
| QA replay storage | HMAC_NONCES / PrivateHmacNonceStore, διακριτό namespace ανά Worker | Χρειάζεται source/migration/namespace review |
| Ιδιωτικός runner | native binding μόνο προς BrainHmacAcceptancePort, περιορισμένη operator εξουσιοδότηση | Δεν έχει επαληθευτεί διαθέσιμος runner |
| Κλειδιά | διατήρηση sealed HEALER_EVENT_HMAC_KEY σε κάθε υπάρχον Worker | Δεν διαβάζονται/αντιγράφονται τιμές |
| Παράθυρο | existing acceptance permit ≤5 λεπτά, challenge≤10s, RPC timeout1500ms | OFF |

### Source change manifest για ανεξάρτητη αξιολόγηση

Οι αλλαγές αυτές **προτείνονται, δεν εφαρμόζονται από το παρόν PR**:
1. `brain/src/worker.mjs`: narrow re-export του υπάρχοντος BrainHmacAcceptancePort
   και PrivateHmacNonceStore από private_hmac_candidate.mjs. Default fetch και
   BrainCoordinator αμετάβλητα.
2. `automation/self-heal-worker/src/worker.mjs`: narrow re-export του υπάρχοντος
   HealerHmacAcceptancePort και της ίδιας isolated-only DO class, με verified bundle
   import path. Default Healer και recovery methods αμετάβλητα.
3. Τα δύο υπάρχοντα wrangler.toml: πρόσθετο HMAC_NONCES namespace, ξεχωριστό από
   canonical BRAIN/HEALER_MEMORY, migration χωρίς διαγραφή/μετονομασία υπαρχουσών
   κλάσεων. Brain HMAC_PEER στο ακριβές named Healer port. Acceptance permit default
   disabled/expired· κανένα public route, νέο Worker ή schedule.
4. Ξεχωριστή runner source/permission αποδοχή. Δεν επαναχρησιμοποιείται άσχετο job
   ως αυθεντικοποιημένος runner και δεν παρέχεται πρόσβαση σε dispatch/recovery/admin.
5. Native compatibility tests και compile ΚΑΙ ΤΩΝ ΔΥΟ ακριβών bundles πριν από
   approval/deployment. Δεν υποκαθίστανται από το παρόν metadata planner.

Αν ο έλεγχος source isolation ή runner δεν περάσει, μένουμε BLOCKED.
Η προσθήκη private ports αλλάζει εκτελέσιμο κώδικα: δεν καλύπτεται από Pages approval.

## 4. Frozen rollback baseline

| Worker | Version | Deployment |
|---|---|---|
| archelaos-brain-staging | e565910f-bbb4-44f6-b0b5-3463906ce495 | bac07481-10c6-4c82-8251-8dfb2ce8a0a6 |
| archelaos-self-heal |65b729ea-c5c2-4118-8632-9d37e615d0cb | f4ee7e96-c0dd-43d3-bd0b-8034c2db55c8 |

Αυτά είναι το πρόσφατα διαβασμένο baseline· επανελέγχονται ακριβώς πριν από μελλοντική
αλλαγή. Αν διαφέρουν, το change packet θέλει ανανέωση, όχι overwrite αλλαγών άλλου owner.

ΟΛΑ πρέπει να παραμείνουν literal false:
BRAIN_SELFHEAL_RECOVERY_ENABLED, BRAIN_SELFHEAL_BINDING_ATTESTED,
BRAIN_SELFHEAL_DISPATCH_ENABLED, BRAIN_SELFHEAL_DURABLE_ACK_ENABLED,
HEALER_DURABLE_ACK_ENABLED. Brain STAGING_EXPIRES_AT=1970-01-01T00:00:00Z.

## 5. Ακριβής σειρά μέχρι την πραγματική δοκιμή

1. **Code ready:** review και exact-SHA CI/security για το περιορισμένο source manifest
   των QA exports/configs. Φρέσκια απογραφή versions, byte hashes, routes, DO IDs,
   flags, logs και secret *names* χωρίς τιμές.
2. **Dormant code rollout review:** ξεχωριστή operator έγκριση δύο ακριβών bundles,
   namespaces και rollback. Healer named port πριν από Brain caller binding,
   permit OFF. Δεν ενεργοποιείται κανένα operational flag.
3. **Readback:** επαλήθευση exact deployed bytes, named binding target και διαφορετικών
   QA/canonical namespaces. Namespace aliasing απαγορεύεται ακόμη και αν metadata
   boolean λέει attested. HTTP παραμένει404· κανένα public fallback.
4. **Runner permit:** συγκεκριμένος εξουσιοδοτημένος private runner με scoped native
   binding· session UUID, exact source SHA=DEPLOY_SHA, start/end≤5 λεπτά, role και
   PRIVATE_HMAC_ACCEPTANCE_ISOLATED=true. Η λέξη ISOLATED περιγράφει το QA code/storage
   scope, όχι ισχυρισμό ότι πρόκειται για Cloudflare preview.
5. **Μία challenge κλήση:** runChallenge(undefined), HMAC answer, nonce claims και
   key-possession verdict. UNKNOWN/timeout δεν επαναλαμβάνεται αυτόματα.
6. **Αρνητικά:** wrong-key, forged/stale/replay/cross-session, timeout, denied private
   properties, atomic single winner, restart και actionsExecuted=0.
   Τα live negatives σχεδιάζονται μόνο στα QA namespaces/ports, όχι με αλλαγή των
   πραγματικών keys για να δημιουργηθεί σφάλμα.
7. **Ανάκληση και readback:** acceptance permit OFF/expired, κατάργηση προσωρινών runner
   και HMAC_PEER bindings όταν προβλέπει το approved manifest, επιβεβαίωση flagsOFF,
   expiry1970,0AI/provider/repair/CI writes και διατήρηση redacted evidence.
8. **Μετέπειτα ξεχωριστή durable ACK αποδοχή:** HMAC parity ΔΕΝ είναι production
   authenticated ACK/settlement. Χρειάζεται review για genuine eligible CI receipt,
   πραγματικό canonical dispatch/readback/restart και explicit time-bound permission,
   χωρίς fake CI proofs στα canonical ledgers. Αυτό παραμένει manual-review-only,
   όχι αυτόματη επισκευή.

## 6. Rollback χωρίς απώλεια αποθήκευσης

Πρώτα ανάκληση permit και temporary runner capability, μετά binding changes,
και μόνο εφόσον απαιτηθεί επαναφορά των δύο ακριβών approved baseline versions.
Το version rollback ΔΕΝ αναιρεί DO migrations ή διαγράφει namespaces.
Δεν διαγράφουμε/αλλάζουμε ποτέ canonical DO IDs, SQLite, OAuth, source keys ή cron.
Τα isolated QA namespace δεδομένα μένουν σε καθορισμένη retention μέχρι να κλείσει
το evidence review· cleanup μόνο με τη δική του περιορισμένη εξουσιοδότηση.
Η λήξη permit κάνει fail-closed νέες κλήσεις· δεν ισχυριζόμαστε αυτόματη αφαίρεση code.

## 7. Παραδοτέο και επαλήθευση

Ο planner δεν έχει fetch/SDK/deployment operation ούτε δέχεται secret values.
Παράγει μόνο review packet· ακόμη και πλήρης trusted evidence οδηγεί σε
PREPARED_FOR_OPERATOR_REVIEW, liveActionAuthorized:false.
Τρέχον πραγματικό αποτέλεσμα: BLOCKED_FOR_LIVE_ACTIVATION, με συγκεκριμένα missing
ports/source bytes, namespace isolation, runner, binding και rollback review.

```sh
node --test brain/test/selfheal_activation_plan.test.mjs
npm ci --prefix brain --ignore-scripts --no-audit --no-fund
npm test --prefix brain
```

Νέα τοπικά regression tests7/7 PASS. Τα native HMAC11 και production-code ACK12
παραμένουν τα υπάρχοντα tests, όχι δεύτερο QA πρωτόκολλο.
Τελικά hosted αποτελέσματα στο νέο HEAD πρέπει να επιβεβαιωθούν χωριστά.

Πηγές:
- brain/docs/PRIVATE_HMAC_ACCEPTANCE_PROTOCOL.md
- brain/docs/PRIVATE_STAGING_HMAC_QA_GATE.md
- brain/src/private_hmac_candidate.mjs και private_hmac_protocol.mjs
- brain/src/selfheal_signed_outbox.mjs, selfheal_ack.mjs
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/
