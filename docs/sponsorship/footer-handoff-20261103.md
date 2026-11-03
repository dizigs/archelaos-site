# UptimeRobot / Google for Nonprofits — footer handoff and work log

Date: 2026-11-03 (Europe/Athens).

## Verified sources and scope
- Official UptimeRobot sponsor page: https://uptimerobot.com/sponsorship/ . It expressly requests a logo/backlink and publishes an official logo ZIP at https://uptimerobot.com/assets/images/logos.zip . Its own HTML includes https://uptimerobot.com/assets/images/uptimerobot-logo-dark.svg (first-party SVG, content type image/svg+xml confirmed, actual bytes not archived). The site uses this first-party logo URL for now; the source can later be replaced by an approved locally hosted asset if available.
- Sponsor's email 2026-11-02 offers SOLO for one year, requested 50 monitors, activation conditioned on backlink. This patch does NOT claim activation of the UptimeRobot plan. Confirm sponsor activation separately after live verification.
- Google official branding policy: https://support.google.com/nonprofits/answer/10162421?hl=en . Participation may be stated in text but the Google for Nonprofits logo must not be placed on our website. Exact footer phrasing: "Ο Γ.Α.Σ. «Ο Αρχέλαος» συμμετέχει στο πρόγραμμα Google for Nonprofits." It is not described as sponsorship or endorsement by Google.

## File ownership / no collisions
- Cloudflare Pages project builds from rebuild/ into dist/, using build_release.py and verify_release.py. The old root assets/footer.js is NOT used in the production build and was intentionally not modified.
- The active Codex site-stability branch edits rebuild/js/shell.js, so this PR does NOT edit it or its styles. Instead it adds isolated rebuild/js/support-footer.js and rebuild/css/support-footer.css, linked once each from 15 actual production source pages. The private rebuild/preview.html remains unchanged.
- No change to a currently open PR's owned files (#37, #65, #67, #70); no historical data, Ads, tracking, payments, credentials or scheduled jobs touched.
- The footer support strip mounts after DOMContentLoaded (after the shared shell) and is idempotent. Logo link uses rel=sponsored noopener noreferrer, separate text-only Google program link, no arrows or hover underlines and a small keyboard-accessible mobile layout.

## Acceptance and verification
- [ ] Node syntax and isolated DOM/inclusion tests pass on exact PR head.
- [ ] Cloudflare release builder + verify_release tests pass and all 15 built pages include both assets.
- [ ] Sonar, security, browser and accessibility checks pass, including no duplicate footer and no mobile overflow.
- [ ] Protected merge to main only after current main sync and required checks.
- [ ] Confirm Cloudflare production deployment success with the **exact logs** and confirm rendered site across desktop and mobile.
- [ ] Send the actual live page URL to Eleftheria Batsou and verify active SOLO / 50 monitors with the sponsor before recording activation.

## Work log
- Started: checked sponsor email, official logo asset and Google branding policy; determined actual Cloudflare build source.
- Completed: isolated source implementation, stylesheet and tests; all production source page include points are present in a dedicated branch.
- Pending: GitHub PR CI, Cloudflare deployment confirmation, live visual QA and sponsor activation.
- Blocker/uncertainty: official logo archive download restricted in working environment; first-party image URL is used instead of an invented brand file. The external image remains a dependency.


## Verified CI failure and targeted correction (03/11/2026)
- GitHub workflow `Sponsor footer regression`, run [41586185476](https://github.com/dizigs/archelaos-site/actions/runs/41586185476), job `125752119856`: first head FAILED. Exact cause in job log: `AssertionError: dist/news.html`.
- The source Node tests **3/3 passed**, `build_release.py` **passed** and `verify_release.py` **passed** before this assertion. The global news page is copied verbatim from root `news.html`, not rebuilt from one of the 15 `rebuild/*.html` pages.
- Corrected in existing PR, **not** by weakening CI: root `news.html` now references the exact same rebuilt sponsor CSS/JS assets, commit `4aa77d644af8c0a4a398f8193e13cc6816d47ebc`. Expanded regression tests to require this special source, commit `60c6bb576b8531969e86c1794cb16410c544916c`. All other original 15 page links remain unchanged.
- New CI/head checks are required to pass before readiness or merge; a successful Cloudflare **PR preview** is not a production deployment.


## Second CI + Sonar security correction (03/11/2026)
- New sponsor CI run [41586439874](https://github.com/dizigs/archelaos-site/actions/runs/41586439874), job 125752926399: source syntax/3 DOM tests PASS; exact build and verifier PASS; final standalone `dist/404.html` assertion FAILED. The error page is not one of the shared-shell/footer pages, so the validation is now strictly scoped to the actual **15 rebuild pages + separately copied news.html**, and watches the news source too. This preserves full coverage of shared-footer routes rather than suppressing real failures.
- SonarCloud PR #73 showed security issue `AaGf9ZLp6b9gI9yYuTW5` (JavaScript S1523, test-only `vm.runInNewContext`, line 71). Replaced dynamic test code execution with a fixed trusted local module require, commit `d7caae77e678df35f0ed8e7ea56572322e75fb53`. No security baseline reset, suppression or Quality Gate relaxation.
- Workflow/test correction: `5901f9df7cc0588c6e71dead0d2c36a1a9356bc8`. Must run the PR checks again on the newest head; previous preview and tests are not evidence for the new revision.
