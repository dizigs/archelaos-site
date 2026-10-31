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
