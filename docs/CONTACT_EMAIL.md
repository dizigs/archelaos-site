# Contact form — Resend / Cloudflare Pages

The form at `contact.html` sends same-origin JSON POSTs for ordinary messages and multipart FormData POSTs when historical files are selected to `/api/contact`, implemented by `functions/api/contact.js` (Cloudflare Pages Functions).

## Server-controlled routing

- `general`, `sponsorship`, `volunteer`, `other` → `contact@archelaos.club`
- `sport` → `sports@archelaos.club`
- `archive` → `history@archelaos.club`

The visitor cannot specify recipients. All mail originates from `noreply@archelaos.club`, with the visitor email as Reply-To. The three aliases must be set up to **receive** mail independently of the Resend domain's **sending** verification.

## Required activation

1. In Cloudflare **Workers & Pages → [Pages project] → Settings → Variables and Secrets**, create an **encrypted** secret called `RESEND_API_KEY` using a Resend sending API key restricted to `archelaos.club` if available.
2. Redeploy the Pages site after adding the secret if needed.
3. Verify that `contact@`, `sports@`, and `history@archelaos.club` aliases actually deliver to the intended inboxes.
4. Send one real test for each category and inspect Resend Logs plus the receiving mailboxes.

Do **not** commit credentials or put the API key into browser JavaScript. The form will offer a `mailto:` alternative when direct submission is unavailable. Historical archive submissions can include attachments **without any new API key**. The existing Resend API key handles them.

## Intake folder for large contributions

A private, non-public Google Drive review folder was created under the club's existing archive: **Εισερχόμενες συνεισφορές ιστορικού αρχείου — Προς έλεγχο**.

- Folder ID: `1wrG5XuC5IFkEINNJGAinxZl1WLKit83d`
- Link: https://drive.google.com/drive/folders/1wrG5XuC5IFkEINNJGAinxZl1WLKit83d
- **Not publicly writable**: it is for the archivist to review and import material, not for public access.

Visitors with very large collections can paste a Google Drive sharing link into the archive topic of the contact form. The existing Resend route forwards the link securely to `history@archelaos.club`, so the archivist can request viewing access if needed and then manually copy approved material into the private intake folder. Links are never automatically fetched or imported, and visitors never get access to the club's Drive account or review folder.

This is **link-based submission, not automatic direct upload to the club's Drive**. A direct Drive upload endpoint would require a separate authenticated backend/Google OAuth or properly secured upload application, abuse protection, and an authorization/configuration step. Do not embed Drive API credentials or publish a writable folder link.

## Historical uploads

- Available only when the visitor selects `archive`; the server forces delivery to `history@archelaos.club`.
- Up to **5 files**, **10 MiB per file**, and **15 MiB combined**.
- Supported: JPG/JPEG, PNG, WebP, GIF, HEIC/HEIF, PDF, DOC/DOCX, TXT.
- Browser posts `multipart/form-data` with `attachments` files; the Function checks the allowed extensions, types, basic file signatures and size limits, then base64-encodes attachments for the single-email Resend API.
- The endpoint does not store the files in GitHub or the site's public directory. Files are transmitted to Resend and the designated recipient; receipt and retention follow provider/mailbox policies.
- If the API is unavailable, the form does **not** claim files were sent. Visitors are told to send files manually to `history@archelaos.club`.
- File contents are **not** antivirus-scanned. Recipients should treat submissions as untrusted and avoid opening suspicious attachments.
- Perform a live test with a small image and a PDF, confirming the actual attachments arrive intact at the history inbox.

Resend supports up to 40 MB per email with attachments, but the form deliberately sets lower limits for reliability and mailbox compatibility. More substantial historical collections should use a separate secure upload/storage workflow rather than email attachments.

Abuse controls: same-origin browser check, server-side field limits and recipient allowlist, honeypot. For production, also configure Cloudflare WAF/rate limiting (and Turnstile if necessary) to protect the public submission endpoint.

## Turnstile contact anti-spam — staged 2026-11-03

- Reuse the existing Cloudflare Turnstile widget **archelaos site** (Managed; host `archelaos.club`, including the canonical `www` subdomain as permitted by Cloudflare hostname matching). Its sitekey is public; its secret must **never** be committed, logged or returned to the browser.
- In **Cloudflare Pages / archelaos-site / Settings / Variables and Secrets / Production**, add the encrypted secret `TURNSTILE_SECRET` from the *existing* widget. Do **not** rotate the widget secret or overwrite/remove the existing `RESEND_API_KEY`, `LHCI_GITHUB_APP_TOKEN` or `PAGESPEED_API_KEY`. Preview submissions need separate preview configuration; do not copy mail credentials to untrusted PR previews.
- The public contact page is generated from `rebuild/contact.html` and `rebuild/js/contact.js` into `dist`. The origin POST handler is `functions/api/contact.js`. Only `GET /api/contact` exposes the public sitekey; the browser loads Turnstile's official script on demand and includes its proof token in multipart submissions.
- Server-side `siteverify` **must** succeed with hostname equal to the incoming host and action `contact` before any Resend API request. Missing, expired, replayed, malformed, wrong-action or wrong-host tokens are rejected. An absent `TURNSTILE_SECRET` returns 503, and GET advertises direct sending as unavailable so the page falls back to `mailto:` rather than silently bypassing anti-spam. This means the binding is a **prerequisite for production merge**.
- Offline tests: `node --test tests/contact-turnstile.test.mjs` (no network or actual email dispatch). Deployment acceptance: protected PR CI pass, encrypted Production binding confirmed, normal protected merge, actual Cloudflare production deployment success, live GET readiness, one controlled real message plus one archive attachment delivered and visible in Resend/mailbox logs. **Do not send a real test email before the recipient agrees**; no fake delivery claims.
- The widget was already present before this work. The new protection is *not active in production* until the branch is merged and the binding is present. Keep source code and production status separate.
