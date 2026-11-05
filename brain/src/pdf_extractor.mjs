import { getDocumentProxy } from 'unpdf';

const privateResult = reason => ({ status: 'PRIVATE_REVIEW', reason, claims: [], aiProviderCalls: 0 });

// Private byte-only text extraction. No URL, password, image rendering, OCR,
// JavaScript execution, external font/CMap/wasm request or model call is allowed.
export async function extractPrivatePdfText(bytes, limits = {}) {
  const maxBytes = limits.maxBytes ?? 1048576; const maxPages = limits.maxPages ?? 20;
  const maxCharacters = limits.maxCharacters ?? 65536; const timeoutMs = limits.timeoutMs ?? 3000;
  if (![maxBytes, maxPages, maxCharacters, timeoutMs].every(Number.isSafeInteger) || maxBytes < 1 || maxBytes > 1048576 || maxPages < 1 || maxPages > 20 || maxCharacters < 1 || maxCharacters > 65536 || timeoutMs < 1 || timeoutMs > 3000) return privateResult('PDF_LIMIT_CONFIGURATION_INVALID');
  if (!(bytes instanceof Uint8Array) || bytes.length > maxBytes || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return privateResult('PDF_BYTES_OR_SIZE_INVALID');
  let pdf; let timer;
  try {
    const operation = async () => {
      pdf = await getDocumentProxy(bytes.slice(), { verbosity: 0, isEvalSupported: false, useSystemFonts: false, useWorkerFetch: false, useWasm: false, standardFontDataUrl: null, cMapUrl: null, wasmUrl: null, disableFontFace: true, isOffscreenCanvasSupported: false, maxImageSize: 0, stopAtErrors: true });
      if (!Number.isSafeInteger(pdf.numPages) || pdf.numPages < 1 || pdf.numPages > maxPages) return privateResult('PDF_PAGE_LIMIT');
      const pages = []; let characters = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const text = content.items.filter(item => typeof item.str === 'string').map(item => item.str).join(' ').trim();
        characters += text.length;
        if (characters > maxCharacters) return privateResult('PDF_TEXT_LIMIT');
        pages.push(text); page.cleanup();
      }
      const text = pages.join('\n').trim();
      if (!text) return privateResult('PDF_HAS_NO_TEXT_OCR_NOT_ENABLED');
      return { status: 'TEXT_EXTRACTED_PRIVATE', text, pages: pdf.numPages, aiProviderCalls: 0 };
    };
    return await Promise.race([operation(), new Promise(resolve => { timer = setTimeout(() => resolve(privateResult('PDF_DEADLINE_REQUIRES_REVIEW')), timeoutMs); })]);
  } catch { return privateResult('PDF_PARSE_FAILED'); }
  finally { clearTimeout(timer); if (pdf) { try { await pdf.destroy(); } catch { /* No raw parser/source error in logs. */ } } }
}

export function createPdfClaimExtractor(approvedRules, limits = {}) {
  if (!Array.isArray(approvedRules) || approvedRules.length > 25 || approvedRules.some(rule => !/^[a-z0-9-]{3,80}$/.test(rule.factId) || typeof rule.exactQuote !== 'string' || !rule.exactQuote || rule.exactQuote.length > 1000)) throw new Error('Approved extraction rules required');
  return async document => {
    // Text extraction cannot certify hidden/off-page content, metadata or
    // attachments as PII-free. Require an independent, hash-bound file review.
    if (document.sourcePrivacyVerified !== true) return privateResult('PDF_PRIVACY_REVIEW_REQUIRED');
    const extracted = await extractPrivatePdfText(document.bytes, limits);
    if (extracted.status !== 'TEXT_EXTRACTED_PRIVATE') return extracted;
    const lower = extracted.text.toLowerCase();
    if (extracted.text.includes('@') || /\d{10}/.test(extracted.text.replace(/[\s()+.-]/g, '')) || ['ignore previous', 'system prompt', 'api_key', '<script', 'javascript:'].some(marker => lower.includes(marker))) return privateResult('PDF_PRIVATE_OR_INSTRUCTION_CONTENT');
    const claims = approvedRules.filter(rule => extracted.text.includes(rule.exactQuote)).map(rule => ({ factId: rule.factId }));
    return claims.length ? { status: 'EXTRACTED', claims, pages: extracted.pages, aiProviderCalls: 0 } : privateResult('NO_REGISTERED_EXTRACTION_EVIDENCE');
  };
}
