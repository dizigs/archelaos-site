# ARCHELAOS — Ενιαίος Εγκέφαλος, Workers & AI

**Owner decision: 2026-11-05.** All new scheduled implementation work is **ChatGPT only; no Codex**. This records the intended architecture, not a claim that every connection is already deployed. Canonical GitHub [#108](https://github.com/dizigs/archelaos-site/issues/108), [#71](https://github.com/dizigs/archelaos-site/issues/71), [#193](https://github.com/dizigs/archelaos-site/issues/193). Existing automation ID: \`6aebb3dc9370819193fc2fd0c2b53aea\`, updated *in place*, runs on its existing 2-hour cadence, no added task slots.

## Unified target diagram

\`\`\`mermaid
flowchart TB
  subgraph INPUT["Πηγές / Πραγματικά γεγονότα"]
    DRIVE["Shared Drive / Gmail"]
    NEWS["Ειδήσεις / Ιστορία / Hall"]
    WEB["Site / Forms / GitHub"]
    STAT["Clarity / GA4 / GSC / Cloudflare Analytics"]
  end
  subgraph PERIPH["Περιφερειακοί Workers — ξεχωριστές ευθύνες"]
    LIB["The Librarian\nΑρχειοθέτηση · OCR · NotebookLM"]
    CONTENT["Content & News\nΈρευνα · Διπλοεγγραφές"]
    HEAL["Self-Heal & QA\nCI · Σφάλματα · PR"]
    SCRIPT["Google Automation Bridge\nApps Script · Drive · Gmail"]
    ANALYTICS["Analytics Worker\nΜόνο συγκεντρωτικά στοιχεία"]
  end
  DRIVE --> LIB
  NEWS --> CONTENT
  WEB --> HEAL
  WEB --> SCRIPT
  STAT --> ANALYTICS
  LIB <-->|"Αυθεντικοποιημένο event / εντολή"| BRAIN
  CONTENT <--> BRAIN
  HEAL <--> BRAIN
  SCRIPT <--> BRAIN
  ANALYTICS <--> BRAIN
  subgraph CENTRAL["ΜΟΝΑΔΙΚΟ ΚΕΝΤΡΙΚΟ ΣΗΜΕΙΟ"]
    BRAIN["ΚΕΝΤΡΙΚΟΣ ΕΓΚΕΦΑΛΟΣ\nPolicy · durable queue · ledger · routing · logs"]
    ROUTER["AI Router + €20/μήνα όριο\nΕλεγχόμενη επιλογή μοντέλου"]
    BRAIN --> ROUTER
  end
  ROUTER --> LITE["Gemini Flash-Lite\nΕλαφριές εργασίες"]
  ROUTER --> FLASH["Gemini Flash\nΔύσκολες αναλύσεις"]
  ROUTER --> ALT["Workers AI / OpenAI\nΜόνο ελεγμένα fallbacks"]
  LIB --> NB["NotebookLM\nΒιβλιοθήκη πηγών"]
\`\`\`

**Reading:** No peripheral worker calls another as an independent orchestrator. New worker-to-worker coordination must pass through the Brain; read-only external provider operations remain in each worker's explicitly scoped responsibility, with signed receipts, permission checks, no raw private data routed through public channels. NotebookLM is a knowledge destination, not the AI router.

## Current vs target (verified when written)

| Component | Current evidence | Next gate |
| --- | --- | --- |
| Central Brain | Draft PR #111; test/staging code present; live centralized AI routing not verified | Proven real event, queue receipt, secure service bindings, AI guard |
| Google Automation Bridge | Existing deployed Worker with Google/App Script bindings; Apps Script editor acceptance not yet fully complete | Authenticated Google getContent, writer isolation, full backup, safe write/readback/rollback |
| Librarian | Draft PR #194; isolated \`archelaos-librarian-staging\` deployed with import flags OFF | Notebook OAuth, private Greek OCR, one approved PDF and news source ACTIVE confirmation |
| Self-Heal / QA | Existing implementation and isolated Worker; direct proof of complete Brain coordination outstanding | Authenticated event and bounded repair evidence |
| Content / News | Existing daily research & data pipelines; central dispatch integration not proven | Event receipt, source validation, canonical PR/publishing gates |
| Analytics | Existing Clarity/GA4 private exports; isolated Analytics Worker source/fixtures prepared in separate PR (not deployed) | Private provenance-checked report -> Brain receipt, no PII |
| AI models | Existing Gemini key binding in Automation Bridge; real model access/price not verified | Verify current official model IDs, scopes, quotas, prices, account, privacy and billing; approved staging probe |

## AI and privacy rules

1. One central AI policy/router owned by the Brain; per-Worker model calls prohibited unless specifically mediated and budget-reserved through Brain.
2. Prefer **Gemini 2.5 Flash-Lite** for low-cost classification/extraction, **Gemini 2.5 Flash** for complex tasks *only when official account availability/current endpoints/pricing are independently verified*. Workers AI/Gemma or OpenAI are reviewed fallbacks, not assumed available. Never use Gemini API key as if it were a NotebookLM OAuth grant.
3. Shared calendar-month cap **€20** across all billable AI providers, reserve predicted maximum before every request, alerts at 75/90%, fail closed at unknown price, FX, provider balance or unverified real usage. Use free tiers first; no account upgrades or surprise charges. Target ~2,000 build minutes is not AI billing.
4. Private PDFs/visitor-level records stay in allowed private systems. Approved text/OCR can be sent to NotebookLM only with documented rights, secure personal OAuth and verified API support; never open private Drive sharing to everyone.
5. Use one proven provider or tool at a time, record exact URL/commit/run/deployment status and privacy-safe log. AI recommendations alone do not create historical facts or authorize automatic production edits.

## Scheduled execution plan

**Four sequential scopes, not separate agents or schedules:**

- **A — Apps Script closure first:** finish current authorized Google getContent, immutable backups, writer exclusion, narrow comment-only smoke, readback, rollback and logs. If externally blocked, record blocker and continue another scope rather than waste the slot.
- **B — Brain + AI router:** finish real trusted event delivery, durable queue/ledger, guarded budget and provider configuration in non-overlapping files with existing PR #111 ownership.
- **C — Peripheral Workers:** unified contracts for Librarian, News/People and Self-Heal, plus real consented provider proof one source at a time.
- **D — Analytics + QA:** reuse existing private aggregations without new polling, normalize/aggregate with privacy threshold and dispatch only to central Brain.

Any broken build or failed security gate stops the change chain, not just the summary. No direct main write, CI bypass, new scheduled slots, Codex, new secrets or paid services without the applicable independent approvals.
