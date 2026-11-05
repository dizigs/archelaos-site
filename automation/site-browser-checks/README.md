# Opt-in Browser Run + GitHub exact-SHA checks

This standalone, review-only integration does not change the canonical Brain, PR #217 acceptance, production, Workers, or repository branch protection.

What works: offline tests run on changes to these new files. A manually dispatched workflow first reads the exact SHA's GitHub checks via GitHub's built-in read-only token, then makes at most two Cloudflare Browser Rendering snapshot requests for the public homepage, with mobile and desktop viewports. It checks HTTP 200, rendered main/header/nav/footer, Greek lang, screenshot, and accessibility-tree presence. No screenshots are uploaded as artifacts.

What is still required before live GitHub Actions runs: a repository Actions variable CLOUDFLARE_ACCOUNT_ID and a dedicated Actions secret CLOUDFLARE_BROWSER_RENDERING_TOKEN, scoped to Browser Rendering Write for the specific Cloudflare account. Do not copy a ChatGPT connection token or reuse a broad production deployment secret. These values cannot be verified by reading code, and a missing binding intentionally fails closed.

The workflow is opt-in via workflow_dispatch so no unapproved paid browser use occurs on pushes or pull requests. It is not a replacement for axe, full interactive/mobile testing, required CI, or PR #217's independent eight-workflow attestation. No merge, deployment, provider AI call, or autonomous action happens here.
