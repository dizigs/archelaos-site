# Contact form — Resend / Cloudflare Pages

The form at `contact.html` sends same-origin JSON POSTs to `/api/contact`, implemented by `functions/api/contact.js` (Cloudflare Pages Functions).

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

Do **not** commit credentials or put the API key into browser JavaScript. The form will offer a `mailto:` alternative when direct submission is unavailable. Attachments are intentionally not supported by this endpoint; visitors are directed to email historical files separately.

Abuse controls: same-origin browser check, server-side field limits and recipient allowlist, honeypot. For production, also configure Cloudflare WAF/rate limiting (and Turnstile if necessary) to protect the public submission endpoint.
