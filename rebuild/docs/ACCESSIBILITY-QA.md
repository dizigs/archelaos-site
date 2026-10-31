# Accessibility verification for the isolated rebuilt site

Run `node rebuild/tests/a11y.cjs` with the built `dist/` served at `http://127.0.0.1:8766` after installing `playwright` and `axe-core`.

The suite inspects five representative routes at 320, 768, 1280 and 1600 CSS pixels, checks keyboard-operated navigation, focus return, language-switcher visibility, archive email drafting, accessible names and WCAG 2.2 A/AA axe rules. Results go to `rebuild/test-artifacts/accessibility/report.json` and never change live content.

Critical axe issues and broken interactions fail CI. Serious and moderate findings remain in the report for human remediation. **Automated checks do not establish complete WCAG conformity**: manual Chrome/Edge/mobile, high zoom, actual screen reader, contrast and cognitive-accessibility review are still release gates.
