import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { createPdfClaimExtractor, extractPrivatePdfText } from '../src/pdf_extractor.mjs';
import { enrichDocument } from '../src/content_pipeline.mjs';

function pdfFixture(text = 'Synthetic verified archival event', script = false) {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const content = text ? 'BT /F1 12 Tf 10 80 Td (' + escaped + ') Tj ET' : '';
  const objects = ['<< /Type /Catalog /Pages 2 0 R' + (script ? ' /OpenAction << /S /JavaScript /JS (globalThis.BRAIN_PDF_SCRIPT_EXECUTED=true) >>' : '') + ' >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream'];
  let result = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(result)); result += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = Buffer.byteLength(result);
  result += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) result += String(offset).padStart(10, '0') + ' 00000 n \n';
  result += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Uint8Array(Buffer.from(result));
}
test('actual synthetic PDF bytes extract text without modifying the input or invoking AI', async () => {
  const bytes = pdfFixture(); const before = Buffer.from(bytes);
  const result = await extractPrivatePdfText(bytes);
  assert.equal(result.status, 'TEXT_EXTRACTED_PRIVATE'); assert.equal(result.text, 'Synthetic verified archival event'); assert.equal(result.pages, 1); assert.equal(result.aiProviderCalls, 0); assert.deepEqual(Buffer.from(bytes), before);
});
test('PDF embedded JavaScript is never executed', async () => {
  globalThis.BRAIN_PDF_SCRIPT_EXECUTED = false;
  assert.equal((await extractPrivatePdfText(pdfFixture('Synthetic verified archival event', true))).status, 'TEXT_EXTRACTED_PRIVATE');
  assert.equal(globalThis.BRAIN_PDF_SCRIPT_EXECUTED, false); delete globalThis.BRAIN_PDF_SCRIPT_EXECUTED;
});
test('malformed, oversized and textless PDFs remain private without OCR or paid fallback', async () => {
  for (const bytes of [new TextEncoder().encode('not a PDF'), new TextEncoder().encode('%PDF-malformed'), pdfFixture('')]) assert.equal((await extractPrivatePdfText(bytes)).status, 'PRIVATE_REVIEW');
  assert.equal((await extractPrivatePdfText(pdfFixture(), { maxBytes: 20 })).reason, 'PDF_BYTES_OR_SIZE_INVALID');
  assert.equal((await extractPrivatePdfText(pdfFixture(), { maxPages: 21 })).reason, 'PDF_LIMIT_CONFIGURATION_INVALID');
});
test('real PDF claims require approved exact quotes and privacy checks', async () => {
  const extractor = createPdfClaimExtractor([{ factId: 'synthetic-fact', exactQuote: 'Synthetic verified archival event' }]);
  assert.equal((await extractor({ bytes: pdfFixture(), sourcePrivacyVerified: true })).status, 'EXTRACTED');
  assert.equal((await extractor({ bytes: pdfFixture('Unregistered source assertion'), sourcePrivacyVerified: true })).status, 'PRIVATE_REVIEW');
  assert.equal((await extractor({ bytes: pdfFixture('Synthetic verified archival event secret@synthetic.invalid'), sourcePrivacyVerified: true })).status, 'PRIVATE_REVIEW');
});
test('real PDF extraction feeds independently verified history draft with raw-byte provenance', async () => {
  const bytes = pdfFixture(); const blobSha256 = createHash('sha256').update(bytes).digest('hex'); const revision = 'b'.repeat(64);
  const event = { eventId: randomUUID(), correlationId: randomUUID(), sourceId: 'a'.repeat(64), sourceRevision: revision, payload: { blobSha256, mimeType: 'application/pdf' } };
  const result = await enrichDocument(event, { lookupSource: async () => ({ processingAllowed: true, publicReleaseApproved: true, privacyReviewVerified: true, revision, blobSha256, allowedPublicHosts: ['synthetic.invalid'] }), readApprovedDocument: async () => ({ bytes, mimeType: 'application/pdf' }), extractApproved: createPdfClaimExtractor([{ factId: 'synthetic-fact', exactQuote: 'Synthetic verified archival event' }]), lookupApprovedFact: async () => ({ verified: true, publicReleaseApproved: true, sourceRevision: revision, organizationId: 'gas-archelaos-katerini', contentTarget: 'history', text: 'Συνθετικό ανεξάρτητα τεκμηριωμένο γεγονός.', eventDate: '2020-01-01', publishDate: '2020-01-02', phase: 'historical', competitionId: 'synthetic-cup', publicSourceUrl: 'https://synthetic.invalid/evidence', publicSourceLabel: 'Συνθετικό δημόσιο τεκμήριο', observedAt: '2026-11-03T00:00:00Z' }), lookupExistingEvent: async () => null });
  assert.equal(result.status, 'DRAFT_READY_FOR_REVIEW'); assert.equal(result.publicDrafts[0].target, 'history'); assert.equal(result.aiProviderCalls, 0);
});
test('PDF text extraction alone cannot authorize publication of an unreviewed whole file', async () => {
  const extractor = createPdfClaimExtractor([{ factId: 'synthetic-fact', exactQuote: 'Synthetic verified archival event' }]);
  assert.equal((await extractor({ bytes: pdfFixture() })).reason, 'PDF_PRIVACY_REVIEW_REQUIRED');
});
