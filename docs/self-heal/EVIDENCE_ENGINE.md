# Self-Heal vNext — evidence-driven diagnosis and learning

**Scope:** diagnostic intelligence for the central archelaos.club repository, independent of Codex's draft Cloudflare brain PR #111. This component **does not deploy a Worker**, call an LLM, edit files, or perform repairs. It is a testable deterministic policy layer for an eventual authenticated event adapter.

## Intelligence model

1. **Incident identity:** hash of repository, normalized failure class and affected resource; CI retries map to the same incident fingerprint. Preserve the exact 40-character commit SHA separately.
2. **Evidence quality:** direct exact-head CI/reproduced tests and authenticated Cloudflare deployment logs outweigh external documentation and model guesses. Old-commit evidence loses 85% of its weight. Evidence older than a day/week/month decays. Withdrawn OSV advisories have zero weight.
3. **Independent corroboration:** repeated references do not inflate confidence. Each hypothesis is ranked with weighted probabilistic support, counterevidence and source-type diversity; incompatible evidence blocks confident action.
4. **Failure memory:** outcome records are append-only and idempotent; failed or regressed attempts penalize repeated hypotheses. Three distinct failed attempts quarantine the incident.
5. **Fail closed:** unknown, stale, conflicting, insufficiently corroborated, or unreproduced issues require a new reproduction. Even highly supported exact-head hypotheses remain **REVIEW_REQUIRED**. Neither external content nor AI recommendations grant runtime execution authority.
6. **Explainability:** JSON output carries fingerprint, exact SHA, ranked hypotheses, confidence, contradiction flags, source counts, failure history and reason code. Every conclusion is reproducible from the supplied evidence.

## Usage

```bash
python tools/self_heal_evidence.py /path/to/local-incident.json
python tools/self_heal_evidence.py /path/to/local-incident.json --journal
python -m unittest discover -s tests -p 'test_self_heal_evidence.py' -v
```

Input example (the path must be a local file, **not** a URL):

```json
{
  "repository": "dizigs/archelaos-site",
  "failureCode": "HTML_ESCAPED_TEXT",
  "resource": "news.html",
  "headSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "observedAt": "2026-11-03T12:00:00Z",
  "eventId": "run-123",
  "evidence": [
    {"kind":"exact_ci","claim":"HTML_ESCAPED_TEXT","supports":true,"ref":"https://github.com/dizigs/archelaos-site/actions/runs/123","headSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","observedAt":"2026-11-03T12:00:00Z"},
    {"kind":"reproduced_test","claim":"HTML_ESCAPED_TEXT","supports":true,"ref":"test://fixture/1","headSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","observedAt":"2026-11-03T12:00:00Z"}
  ],
  "history": []
}
```

## Handoff to Codex brain owner

The staging Worker already owns authenticated intake, Durable Object jobs, AI budget, source deduplication and safety controls. **Do not create a competing Worker or new cron.** The next stage is to implement an equivalent deterministic, read-only triage policy inside its own runtime, with real authenticated CI/Cloudflare evidence, the OSV knowledge engine from PR #114, and persistent outcome logs. Avoid importing a huge SQLite database into a paid Cloudflare service without an explicit storage/cost plan. Respect the project-wide AI cap of 20€/month and do not enable any new paid service. An external knowledge match is a proposed hypothesis, never an instruction.

## Release boundaries

This PR delivers the evidence engine and adversarial tests only. It does not claim that an AI brain is live, that production incidents are automatically healed, or that any new service is enabled. Deployment verification requires an exact production SHA and Cloudflare logs; self-heal effectiveness additionally requires a real failing incident, a safe candidate, independent before/after test, protected merge and post-deployment verification.
