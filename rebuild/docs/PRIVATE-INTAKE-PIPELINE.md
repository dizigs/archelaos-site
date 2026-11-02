# Offline private archive intake — safe foundation

The public club website **does not** fetch private Google Drive or Gmail data.
This staged capability provides a safe, deterministic **offline** pipeline only.

- A trusted collector stores an original contribution under the **gitignored**
  `.archive-intake/incoming/` on a persistent private machine and writes an
  envelope with `source`, opaque `source_id`, `revision`, `payload_relpath`.
- `python rebuild/tools/intake_contributions.py .archive-intake/incoming/<id>.json`
  checks file type, max bytes, traversals and DOCX zip bomb limits, writes
  private SHA-256 receipts, and generates internal-only leads.
- `python rebuild/tools/process_private_inbox.py` matches private leads to
  the public Hall of Fame, news and historical catalogs. It does not publish,
  create a PR, upload private documents or disclose raw source IDs.
- Same id+revision is idempotent; changing bytes without changing revision
  fails closed; a new revision retains provenance history; an identical
  document from another contributor does not create another analysis.
- UTF-8 text and DOCX are parsed; **PDFs are not claimed as extracted**:
  they are explicitly marked `needs_pdf_extraction` until a separate
  safe PDF adapter is implemented. This never overwrites original files.
- Results and text must remain under `.archive-intake/` with restrictive
  permissions. CI uses only temporary dummy fixtures and no connected user
  accounts or credentials. No scheduled CI job is introduced.
- Future separate steps: use the existing connected Drive/Gmail workflow
  to collect authorized files into a persistent *private* workspace; add
  safe PDF handling, public-source corroboration and canonical update PRs.
  The user-approved policy allows clear archival facts to be published
  without item-by-item approval, while private/personally identifying
  material remains protected. **This PR does not claim end-to-end autonomy.**
