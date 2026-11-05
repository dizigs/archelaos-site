// Pure, dependency-free boundary shared by future Brain adapters. No I/O or provider calls.
const KEYS = ['eventId','source','type','sourceRevision','observedAt','correlationId'];
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KIND = /^[a-z][a-z0-9_.-]{0,63}$/;
function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  const normalized = value.includes('.') ? value.replace(/\.(\d{1,3})Z$/, (_, ms) => `.${ms.padEnd(3, '0')}Z`) : value.replace(/Z$/, '.000Z');
  return parsed.toISOString() === normalized;
}
export function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok:false,reason:'invalid_object'};
  if (Object.keys(input).sort().join('|') !== [...KEYS].sort().join('|')) return {ok:false,reason:'invalid_fields'};
  if (![input.eventId,input.sourceRevision,input.correlationId].every(x=>typeof x==='string'&&ID.test(x))) return {ok:false,reason:'invalid_identity'};
  if (![input.source,input.type].every(x=>typeof x==='string'&&KIND.test(x))) return {ok:false,reason:'invalid_kind'};
  if (!validTimestamp(input.observedAt)) return {ok:false,reason:'invalid_time'};
  return {ok:true,event:Object.freeze({...input})};
}
export function decideAI({event, sourceAllowed=false, containsPersonalData=true, providerVerified=false, estimatedEuro=null, remainingEuro=null, freeQuotaVerified=false}) {
  const check=validateEvent(event);
  if (!check.ok) return {action:'deny',reason:check.reason};
  if (!sourceAllowed) return {action:'deny',reason:'source_not_authorized'};
  if (containsPersonalData) return {action:'deny',reason:'privacy_not_cleared'};
  if (!providerVerified) return {action:'defer',reason:'provider_not_verified'};
  if (freeQuotaVerified) return {action:'eligible_free_only',reason:'central_ledger_required'};
  if (![estimatedEuro,remainingEuro].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)) return {action:'defer',reason:'budget_unknown'};
  if (estimatedEuro>remainingEuro) return {action:'defer',reason:'budget_exhausted'};
  return {action:'defer',reason:'atomic_reservation_required'};
}
