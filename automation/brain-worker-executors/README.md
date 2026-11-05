# Brain-controlled Build and Testing Workers (scaffold)

This is a **non-deployed**, dependency-free module. It does not create an additional Cloudflare Worker, invoke AI, call GitHub APIs, or modify production.

The central Brain must authenticate and authorize intents, reserve budgets, enforce idempotency and dispatch through a scoped executor. The Build worker should create a draft PR only after these controls. The Testing worker should request existing GitHub Actions workflows and read back run IDs and conclusions. Skipped, missing and failed checks must block merging. Failures return to the Brain for bounded Self-Heal triage.

Run: `node --test automation/brain-worker-executors/index.test.mjs`.

Before enabling: verify GitHub workflow permissions, path ownership, protected branches, central Brain event receipt, executor identity, CI report provenance, budget limits, and staging end-to-end evidence.
