import { digest, HEX } from './contract.mjs';

const TARGETS = new Set(['history', 'hall', 'stories', 'news']);
const ORGANIZATION = 'gas-archelaos-katerini';
const unsafeText = (value, maximum = 2000) => {
  if (typeof value !== 'string' || value.length > maximum) return true;
  const lower = value.toLowerCase();
  const instructions = ['<script', '</script', 'javascript:', 'system prompt', 'api_key', 'api key', 'ignore previous', 'ignore system', 'ignore instructions'];
  // Constant-string checks and fixed-width digits avoid backtracking on hostile
  // large documents. Ambiguous contact/instruction-like text stays private.
  return value.includes('@') || instructions.some(marker => lower.includes(marker)) || /\d{10}/.test(value.replace(/[\s()+.-]/g, ''));
};
function privateReview(event, reason) { return { status: 'PRIVATE_REVIEW', reason, eventId: event.eventId, correlationId: event.correlationId, publicDrafts: [], aiProviderCalls: 0 }; }
function publicUrl(value, allowedHosts) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && allowedHosts.includes(url.hostname) && !/(drive\.google|mail\.google|docs\.google)/.test(url.hostname); }
  catch { return false; }
}
function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function extractStructuredClaims(document) {
  if (document.mimeType !== 'application/json' && document.mimeType !== 'text/plain') return { status: 'PRIVATE_REVIEW', reason: 'EXTRACTOR_NOT_CONFIGURED' };
  let data; try { data = JSON.parse(document.text); } catch { return { status: 'PRIVATE_REVIEW', reason: 'UNSUPPORTED_UNSTRUCTURED_SOURCE' }; }
  if (!data || !Array.isArray(data.claims) || data.claims.length < 1 || data.claims.length > 25) return { status: 'PRIVATE_REVIEW', reason: 'INVALID_EXTRACTED_CLAIMS' };
  return { status: 'EXTRACTED', claims: data.claims };
}

export async function enrichDocument(event, dependencies) {
  if (!HEX.test(event.sourceId) || !HEX.test(event.sourceRevision) || !HEX.test(event.payload?.blobSha256)) return privateReview(event, 'INVALID_SOURCE_IDENTITY');
  const source = await dependencies.lookupSource(event.sourceId);
  if (source?.processingAllowed !== true) return privateReview(event, 'SOURCE_PROCESSING_NOT_AUTHORIZED');
  if (source.publicReleaseApproved !== true) return privateReview(event, 'PUBLIC_RELEASE_NOT_APPROVED');
  if (source.revision !== event.sourceRevision || source.blobSha256 !== event.payload.blobSha256) return privateReview(event, 'SOURCE_REVISION_MISMATCH');
  const document = await dependencies.readApprovedDocument({ sourceId: event.sourceId, revision: event.sourceRevision });
  const bytes = document?.bytes instanceof Uint8Array ? document.bytes : typeof document?.text === 'string' ? new TextEncoder().encode(document.text) : null;
  if (!bytes || bytes.length > 1048576 || await digest(bytes) !== event.payload.blobSha256) return privateReview(event, 'CONTENT_HASH_OR_SIZE_MISMATCH');
  if (event.payload.mimeType && document.mimeType !== event.payload.mimeType) return privateReview(event, 'MIME_CONTENT_MISMATCH');
  if (document.mimeType === 'application/pdf' && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return privateReview(event, 'MIME_CONTENT_MISMATCH');
  if (typeof document.text === 'string' && unsafeText(document.text, 65536)) return privateReview(event, 'UNTRUSTED_INSTRUCTION_OR_PRIVATE_PAYLOAD');
  const extracted = dependencies.extractApproved ? await dependencies.extractApproved(document) : extractStructuredClaims(document);
  if (extracted?.status !== 'EXTRACTED' || !Array.isArray(extracted.claims) || extracted.claims.length < 1 || extracted.claims.length > 25) return privateReview(event, extracted?.reason || 'EXTRACTION_UNVERIFIABLE');
  const verified = [];
  for (const claim of extracted.claims) {
    if (!claim || typeof claim.factId !== 'string' || !/^[a-z0-9-]{3,80}$/.test(claim.factId)) return privateReview(event, 'UNVERIFIABLE_CLAIM');
    const fact = await dependencies.lookupApprovedFact(claim.factId);
    // Facts, public-release approval and identity mapping come from the trusted
    // evidence registry, never assertions/instructions inside the new document.
    if (fact?.verified !== true || fact.publicReleaseApproved !== true || fact.sourceRevision !== event.sourceRevision || fact.organizationId !== ORGANIZATION) return privateReview(event, 'EVIDENCE_OR_ORGANIZATION_MISMATCH');
    if (!TARGETS.has(fact.contentTarget) || unsafeText(fact.text) || !validDate(fact.eventDate) || !validDate(fact.publishDate) || !['preview', 'result', 'historical'].includes(fact.phase) || typeof fact.competitionId !== 'string' || !/^[a-z0-9-]{2,80}$/.test(fact.competitionId)) return privateReview(event, 'FACT_METADATA_UNVERIFIABLE');
    if (fact.phase === 'result' && fact.publishDate < fact.eventDate) return privateReview(event, 'RESULT_DATE_CONFLICT');
    if (!publicUrl(fact.publicSourceUrl, source.allowedPublicHosts || []) || typeof fact.observedAt !== 'string' || !Number.isFinite(Date.parse(fact.observedAt)) || unsafeText(fact.publicSourceLabel)) return privateReview(event, 'PUBLIC_PROVENANCE_UNVERIFIABLE');
    let personId = null;
    if (fact.personId || fact.contentTarget === 'hall') {
      const matches = await dependencies.matchApprovedPerson({ personId: fact.personId, name: fact.personName, organizationId: ORGANIZATION });
      if (!Array.isArray(matches) || matches.length !== 1 || matches[0].id !== fact.personId || matches[0].organizationId !== ORGANIZATION) return privateReview(event, 'AMBIGUOUS_PERSON_IDENTITY');
      personId = matches[0].id;
    }
    const eventKey = await digest([ORGANIZATION, fact.eventDate, fact.competitionId, fact.discipline || '', fact.category || ''].join('|'));
    const item = { factId: claim.factId, text: fact.text, contentTarget: fact.contentTarget, eventKey, personId, eventDate: fact.eventDate, publishDate: fact.publishDate, phase: fact.phase,
      provenance: { sourceUrl: fact.publicSourceUrl, sourceLabel: fact.publicSourceLabel, sourceRevision: event.sourceRevision, observedAt: fact.observedAt, eventId: event.eventId, confidence: 'VERIFIED_REGISTRY_FACT', decisionReason: 'INDEPENDENT_SOURCE_AND_IDENTITY_VERIFIED' } };
    if (!verified.some(row => row.factId === item.factId)) verified.push(item);
  }
  const groups = new Map();
  for (const fact of verified) {
    const key = fact.contentTarget + '|' + fact.eventKey + '|' + (fact.contentTarget === 'hall' ? fact.personId : '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fact);
  }
  const drafts = [];
  for (const [key, facts] of groups) {
    facts.sort((a, b) => a.factId.localeCompare(b.factId, 'en'));
    const first = facts[0]; const existing = await dependencies.lookupExistingEvent(first.eventKey);
    const draft = { schemaVersion: 1, draftId: await digest(key), status: 'DRAFT_REQUIRES_REVIEW', target: first.contentTarget, eventKey: first.eventKey,
      action: existing ? 'UPDATE_EXISTING_EVENT' : 'PROPOSE_NEW_EVENT', existingEventId: existing?.id || null,
      phase: facts.some(fact => fact.phase === 'result') ? 'result' : first.phase, facts, aiProviderCalls: 0, publicPublishingAllowed: false };
    drafts.push(draft);
  }
  return { status: 'DRAFT_READY_FOR_REVIEW', eventId: event.eventId, correlationId: event.correlationId, publicDrafts: drafts, aiProviderCalls: 0 };
}

export class SqlDraftRegistry {
  constructor(storage) {
    this.storage = storage; this.sql = storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS content_drafts(id TEXT PRIMARY KEY,event_key TEXT NOT NULL,target TEXT NOT NULL,phase TEXT NOT NULL,signature TEXT NOT NULL,body TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1)');
  }
  async save(draft) {
    if (draft?.status !== 'DRAFT_REQUIRES_REVIEW' || !HEX.test(draft.draftId) || !HEX.test(draft.eventKey) || !TARGETS.has(draft.target) || draft.publicPublishingAllowed !== false) throw new Error('Draft registry rejected unreviewed shape');
    const body = JSON.stringify(draft); const signature = await digest(body);
    return this.storage.transactionSync(() => {
      const previous = [...this.sql.exec('SELECT * FROM content_drafts WHERE id=?', draft.draftId)][0];
      if (previous?.signature === signature) return { status: 'DUPLICATE_DRAFT', draftId: draft.draftId, revision: previous.revision };
      if (previous?.phase === 'result' && draft.phase === 'preview') return { status: 'STALE_PREVIEW_IGNORED', draftId: draft.draftId, revision: previous.revision };
      this.sql.exec('INSERT INTO content_drafts(id,event_key,target,phase,signature,body) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET phase=excluded.phase,signature=excluded.signature,body=excluded.body,revision=revision+1', draft.draftId, draft.eventKey, draft.target, draft.phase, signature, body);
      return { status: previous ? 'DRAFT_UPDATED' : 'DRAFT_CREATED', draftId: draft.draftId, revision: previous ? previous.revision + 1 : 1 };
    });
  }
}
