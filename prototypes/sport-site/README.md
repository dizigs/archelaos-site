# Ελληνικό prototype τμήματος (μη παραγωγικό)

Open `index.html?sport=archery` or `index.html?sport=wrestling` in a local static file server. This folder is a **visual starter**, not a deployable site, and has no dependency on other pending PRs.

- **Only archery** has the approved deep green, vivid yellow and beige palette. Other departments have **no approved palette**. The wrestling preview switches to temporary grayscale solely to demonstrate reusable layout; its colors are not a proposal or branding decision.
- Minimal responsive layout, large typographic hero and symbolic CSS target illustration. **No fabricated athlete photos, medals or metrics.**
- Entire feature cards are clickable, no decorative arrows and no hover underlines.
- History and Hall are outbound links to canonical archelaos.club, never a duplicated local historical database.
- Training and result blocks do not invent schedules, federation data or competition statistics.
- Only in-page navigation and public central links. **No GA4, analytics tags, cookies, signup collection, external JS, or API requests.**
- Greek copy is provisional and must receive departmental review before publication.
- The `?sport=` query is a *preview selector*, not a routing or deployment specification.
- Accessibility: semantic landmarks, focus rings, skip link, reduced-motion support, mobile-responsive cards and semantic FAQ accordions.

Integration belongs to Codex-controlled UI/release work after this isolated foundations PR passes review. This directory is not part of main site's build pipeline.
