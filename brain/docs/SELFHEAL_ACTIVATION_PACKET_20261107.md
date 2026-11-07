# Brain ↔ Self-Heal — πακέτο προετοιμασίας ενεργοποίησης, 07/11/2026

**Κατάσταση: SOURCE-ONLY / PREPARATION. Δεν ενεργοποιεί κανένα εγκατεστημένο Worker.**
Canonical task: BRAIN-ACK-SETTLEMENT · Συντονισμός: Issue #71.
Δεν απαιτεί δεύτερο λειτουργικό Brain, queue, ledger ή scheduler.

## Τι έχει ήδη τελειώσει

- Η βασική διόρθωση #278 έχει συγχωνευθεί στο main (8882f9ea...).
- Source baseline αυτού του πακέτου: a1d7a7fffb335eb1e396b7eccd5935ee3d6f4da6.
- Το #277 root-CWD native ACK suite πέρασε 12/12 στο πραγματικό run42362714934.
- Τα #273/#277 είναι συμπληρωματικά tests· δεν ξανανοίγουμε τη βασική διόρθωση.
- Παραγωγική αυθεντικοποιημένη επικοινωνία/ενεργοποίηση δεν έχει αποδειχθεί.
- Τα παλιά γενικά operator runbooks και `prove_staging.mjs` δεν είναι αυτός ο έλεγχος:
  το τελευταίο αφορά general event/control flow και workers.dev/local URL, όχι private selfheal QA.

## Πραγματικό κενό και λύση προετοιμασίας

Το `requireStaging` του πραγματικού outbox ζητά recovery/dispatch/binding flags,
approved SHA, ενεργό staging παράθυρο και πραγματική αποθηκευμένη CI_FAILURE proof.
Δεν τα ανοίγουμε για να αποδείξουμε συνθετικά HMAC ή ACK.

Το νέο `brain/qa/selfheal/` είναι **μη εγκατεστημένο fixture** αποκλειστικά για τα ήδη
υπάρχοντα απομονωμένα previews. Δεν εισάγεται από `brain/src/worker.mjs` ή το πραγματικό
Healer. Δεν συνοδεύεται από ενεργό Wrangler deployment configuration.

| Δοκιμή | Τι αποδεικνύει | Τι δεν αποδεικνύει |
|---|---|---|
| Domain-separated HMAC challenge | Συμφωνία των συγκεκριμένων keys του ζεύγους QA κατά τη δοκιμή | Συμφωνία keys άλλου deployment χωρίς ανεξάρτητη key-lineage attestation |
| Private RPC + isolated SQLite ACK/readback | Συνθετικό συμβόλαιο, επιμονή μετά restart, μία απόπειρα, UNKNOWN χωρίς redelivery | Εκτέλεση του production dispatch ή πραγματική ανάκτηση |
| Υπάρχον native production-code suite | Production-code λογική σε workerd/Miniflare | Αυθεντικοποιημένη κλήση μεταξύ εγκατεστημένων live εκδόσεων |
| Μελλοντικό πραγματικό staging acceptance | Εγκατεστημένο ακριβές code/key/binding ζεύγος και μία νόμιμη ροή | Άδεια αυτόματης επισκευής ή production deployment |

**Ακόμη και ACKNOWLEDGED του QA επιστρέφει productionAuthenticated:false και
recoveryExecuted:false.** Δεν βαφτίζουμε το QA ως CONNECTED.

## Επιτρεπόμενοι στόχοι — διαβασμένοι ξανά 07/11/2026

| Parent Worker | Υπάρχον QA preview | Αμετάβλητο preview ID | Τρέχον baseline |
|---|---|---|---|
| archelaos-brain-staging | archelaos-brain-qa-isolated | 204965a6ba624184bfdfccb94794aff8 | urls=[], deployed_on=null |
| archelaos-self-heal | archelaos-healer-qa-isolated | ac43359770de4a058fd77bd4d5257226 | urls=[], deployed_on=null |

Δεν δημιουργήθηκε preview ή deployment από αυτή την προετοιμασία.
Οι παρακάτω installed baseline εκδόσεις πρέπει να μείνουν αμετάβλητες στη φάση QA:
- Brain e565910f-bbb4-44f6-b0b5-3463906ce495, deployment bac07481-10c6-4c82-8251-8dfb2ce8a0a6.
- Healer65b729ea-c5c2-4118-8632-9d37e615d0cb, deployment f4ee7e96-c0dd-43d3-bd0b-8034c2db55c8.
Επανέλεγχος αυτών ακριβώς πριν και μετά από οποιαδήποτε μελλοντική αλλαγή.

## Ακριβές συμβόλαιο του μη εγκατεστημένου QA fixture

- Κοινό `QA_RUN_ID` UUIDv4, `QA_SOURCE_SHA` ακριβές reviewed SHA, διάρκεια ≤30 λεπτά.
- Role `brain`/`healer` και ακριβή QA_PREVIEW_ID/QA_PEER_PREVIEW_ID.
- `QA_ENABLED` επιτρέπεται μόνο στο απομονωμένο preview. Όλα τα ΠΡΑΓΜΑΤΙΚΑ
  BRAIN_SELFHEAL_* permission flags και HEALER_DURABLE_ACK_ENABLED παραμένουν literal false.
- `QA_MEMORY`: μόνο ξεχωριστό απομονωμένο QA SQLite namespace. Απαγορεύεται alias σε
  υπάρχοντα BRAIN/HEALER_MEMORY. Έλεγχος namespace ID από provider inventory πριν deployment.
- `QA_PEER`: αποκλειστικά το αντίστοιχο QA preview και ακριβές approved version.
  Η δυνατότητα αυτής της ακριβούς preview-to-preview στόχευσης πρέπει να αποδειχθεί
  από provider schema/readback· κανένα fallback στον parent Worker ή public URL.
- Τα BRAIN/HEALER_MEMORY/HEALER/BRAIN_RECOVERY/AI και provider/operator capabilities
  απαγορεύονται στα QA env. Μόνο QA_MEMORY, scoped QA_PEER, metadata και δύο sealed keys.
- `HEALER_EVENT_HMAC_KEY`: parity key στο QA, όχι plaintext σε packet/CI/log.
  `QA_RUNNER_KEY`: διαφορετικό sealed operator key. Καμία αυτόματη αντιγραφή secret.
  Χωρίς εγκεκριμένη σύνδεση/lineage του QA key προς το πραγματικό key,
  το αποτέλεσμα αφορά μόνο το QA key και καταγράφεται έτσι.
- start/status/reconcile απαιτούν φρέσκο exact-schema runner HMAC με 60s freshness και nonce.
- accept/read δέχονται μόνο domain-separated QA HMAC, ίδιο run/SHA, freshness και αυστηρά πεδία.
  Παραγωγικά scopes selfheal.command.v1/selfheal.recover δεν γίνονται δεκτά.
- start αποθηκεύει UNKNOWN/attempts=1 πριν από RPC. Δεύτερο start απορρίπτεται.
- Αποθήκευση ACK στον παραλήπτη και ανεξάρτητο υπογεγραμμένο readback πριν ACKNOWLEDGED.
  Lost/forged ACK ή timeout μένει UNKNOWN· reconcile κάνει μόνο read, ποτέ redelivery.
- 2s όριο αναμονής RPC· ≤32 control/read nonces, ένα challenge/receipt ανά run.
- HTTP fetch πάντα404. Κανένα alarm, cron, AI, CI mutation, repair ή εξωτερικό fetch.

## Σειρά εκτέλεσης μετά από ανεξάρτητη αποδοχή

1. **Freeze:** exact candidate SHA και artifact SHA256, όλα τα required CI/security checks,
   reviewer, δύο parent versions/deployment IDs, previews/URLs/bindings/DO namespaces.
2. **Isolation manifest:** εγκρίνουμε ακριβώς τα δύο υπάρχοντα preview IDs, μηδενικά URLs,
   preview-only namespaces διαφορετικά από τα πραγματικά και σωστό QA_PEER target.
   Αν ο provider δεν αποδεικνύει αυτή τη στόχευση: BLOCKED, όχι νέο public route.
3. **Runner/key authority:** δηλωμένη ιδιωτική native-RPC πρόσβαση, scoped sealed runner
   credential, parity-key provenance και ασφαλής receipt destination. Δεν υπάρχει
   έτοιμος εξουσιοδοτημένος private cloud runner στο παρόν πακέτο: πρέπει να κατονομαστεί
   και να ελεγχθεί πριν την πρώτη live κλήση. Δεν παρακάμπτουμε την απουσία του με workers.dev.
4. **Operator review:** συγκεκριμένο change manifest για preview deployment/bindings/DO/keys,
   ακριβές ≤30min window και rollback. Αυτή η φάση είναι η πρώτη που αλλάζει Cloudflare,
   και ΔΕΝ εκτελείται από την προετοιμασία.
5. **Parity & ACK:** start μία φορά, signed ACK και ανεξάρτητο readback, restart του
   απομονωμένου runtime χωρίς διαγραφή namespace, reconcile και attempts=1.
6. **Negatives:** wrong key, bad signature/scope/SHA/run, stale/replay, lost/forged ACK,
   failed/forged readback, timeout, no redelivery, no capability handles.
7. **Stop/rollback & readback:** QA off/expiry, αφαίρεση μόνο των συγκεκριμένων νέων
   preview deployment IDs, προσωρινών QA bindings/keys και μελλοντική ελεγχόμενη
   διαγραφή μόνο των QA δεδομένων. Τα δύο previews υπήρχαν ήδη: ΔΕΝ διαγράφονται.
   Parent versions/flags/DO/keys παραμένουν όπως πριν· urls=[]· no egress/AI/repair.
8. **Χωριστή απόφαση για πραγματικό staging:** μόνο αν περάσουν τα παραπάνω, ο release
   owner αξιολογεί προώθηση reviewed production-code SHA με flags OFF και νέα
   βραχύβια εξουσιοδότηση πραγματικού dispatch με γνήσιο επιλέξιμο CI receipt.
   Καμία εικονική CI_FAILURE εγγραφή στα πραγματικά ledgers. Recovery παραμένει
   manual-review-only· η αυτόματη επισκευή χρειάζεται δική της αποδοχή.

## Όρια rollback και λήξης

- Η λήξη κάνει fail-closed κάθε νέα RPC μέθοδο· ΔΕΝ αποδεικνύει αυτόματη διαγραφή deployment.
- Ο operator πρέπει να διακόψει/αφαιρέσει τα προσωρινά deployments και να κάνει GET readback.
- Cloudflare endpoint αναφοράς: DELETE
  /accounts/{account}/workers/workers/{parent}/previews/{preview}/deployments/{created_deployment_id}.
  Μόνο μετά από έλεγχο ότι το ID δημιουργήθηκε από αυτό το εγκεκριμένο run.
- Το baseline των previews είναι μη εγκατεστημένο· ο σωστός rollback στόχος είναι πάλι
  μηδέν preview deployments, όχι redeploy ή rollback των parent Workers.
- UNKNOWN διατηρείται ως receipt για αξιολόγηση μέχρι να κλείσει η υπόθεση· δεν ξαναστέλνουμε start.

## Αναπαραγωγή offline

Από checked-out candidate:
```sh
npm ci --prefix brain --ignore-scripts --no-audit --no-fund
cd brain
node --test --test-reporter=tap test/selfheal_qa_isolated.test.mjs
```

Το υπάρχον brain-core workflow τρέχει το test μαζί με τα άλλα brain tests.
Δεν προστίθεται workflow ή schedule. Native workerd/SQLite results και CI SHA
καταγράφονται στο υπάρχον PR και στο ένα ιδιωτικό canonical LOG, χωρίς keys.

Πηγές:
- brain/docs/PRIVATE_STAGING_HMAC_QA_GATE.md
- brain/src/selfheal_signed_outbox.mjs και selfheal_ack.mjs
- automation/self-heal-worker/src/durable_ack.mjs
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/
- https://developers.cloudflare.com/durable-objects/api/storage-api/
