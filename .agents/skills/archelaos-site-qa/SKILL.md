---
name: archelaos-site-qa
description: Use when reviewing archelaos.club responsive layout, browser regressions, navigation, popups, keyboard accessibility, reduced motion, performance, or WCAG 2.2 AA before a release.
---

# Archelaos Site QA — Antigravity workspace skill

Read root `AGENTS.md`, `rebuild/docs/ACCESSIBILITY-QA.md`, and existing
GitHub workflow tests first. Use the established browser runner if present.
Do not install a second browser framework simply to run this skill.

## Safe execution

1. Identify exact PR HEAD SHA, affected files, pages and approved owner.
2. Check whether Playwright is already installed locally, without package
   download: `npx --no-install playwright --version`. A failing check means
   `NOT_INSTALLED_IN_THIS_ENVIRONMENT`, not permission to download a package.
3. Use only the existing test command or a controlled read-only public
   browser session. The project may provide a GitHub Actions test runner.
4. Verify desktop, tablet and narrow mobile widths; navigation/drawer,
   scrolling, dialog focus/escape, title overflow, keyboard-only usage,
   contrast, reduced motion and console errors.
5. Keep screenshots, traces and logs free of admin sessions, personal
   details and cookies. Cite reproducible source evidence, viewport and SHA.
6. Record PASS, FAIL or UNKNOWN per page and feature; a screenshot alone
   is not proof of WCAG conformance or deployment.
7. If code fix is necessary, follow existing task ownership and Draft PR
   security workflow; do not merge or deploy autonomously.

Do not claim Playwright CLI/MCP is installed or authenticated unless the
current runtime preflight and a real browser test prove it. Do not connect
third-party MCP with production credentials from this skill.
