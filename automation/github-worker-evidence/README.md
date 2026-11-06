# Worker Evidence Registry — read-only pilot

Issue: https://github.com/dizigs/archelaos-site/issues/243

This is an isolated **read-only** Node 22+ prototype. It maps existing GitHub Issues and PRs to current exact SHA, required checks, CodeQL/Sonar, review threads and blockers. It does **not** create Issues, push, merge, dispatch workflows, deploy Workers, write to Cloudflare, invoke AI, or modify the authoritative Brain SQLite ledger.

## Usage

Run offline tests:

    node --test automation/github-worker-evidence/test.mjs

Run evidence collection with a fine-scoped read-only GitHub token (repository metadata, pull requests, checks, rules, GraphQL review threads):

    GITHUB_TOKEN=<read-only-token> node automation/github-worker-evidence/index.mjs > worker-evidence.json

Never commit tokens or generated reports containing private data. The registry is a starter set of **existing** Issues/PRs, not proof of deployed Workers. Expand ownership mapping after checking live project state. If effective branch rules cannot be read, or CI/CodeQL/Sonar/review-thread evidence is missing, the status is BLOCKED and CLI exits 2. The collector caps pagination at five pages and per-request timeouts at 10 seconds.

A merged PR is only CODE_MERGED; Cloudflare provider deployment and private Brain receipts remain NOT_VERIFIED until a separate scoped provider readback adapter is implemented and accepted. Existing #71 handoff inbox and #108 Brain remain canonical. No new schedule, Worker, authorization or production activation is included.
