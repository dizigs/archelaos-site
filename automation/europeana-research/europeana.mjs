/** Europeana research staging-only adapter. No Worker, cron, publisher or implicit fetch. */
const API = 'https://api.europeana.eu/record/v2/';
export const SEARCH_SEEDS = Object.freeze([
  '"Αρχέλαος" AND (Κατερίνη OR Πιερία)',
  '"ΓΑΣ Αρχέλαος"',
  '"Katerini" AND (sport OR athletics OR handball)',
  '"Κατερίνη" AND (αθλητισμός OR σωματείο OR αγώνες)',
  '"Πιερία" AND (εφημερίδα OR φωτογραφία OR αθλητισμός)',
  '"Pieria" AND (newspaper OR sports OR photograph)',
  '"Archelaos" AND (Katerini OR sport)',
  '"Κατερίνη" AND (χάντμπολ OR στίβος OR πάλη OR ενόργανη)',
]);
const REVIEW = 'research_only';
const str = x => typeof x === 'string' ? x.trim() : '';
function strings(value) {
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(strings);
  return [];
}
const first = (...values) => values.flatMap(strings)[0] ?? null;
const unique = values => [...new Set(values.filter(Boolean))];
export function validId(id) {
  return typeof id === 'string' && /^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.~-]+$/.test(id);
}
export function recordUrl(id) {
  if (!validId(id)) throw Error('INVALID_RECORD_ID');
  return API + id.slice(1).split('/').map(encodeURIComponent).join('/') + '.json';
}
export function searchUrl(query, cursor = '*', rows = 20) {
  if (!str(query) || str(query).length > 350 || /[\r\n]/.test(query)) throw Error('INVALID_QUERY');
  if (!Number.isInteger(rows) || rows < 1 || rows > 20) throw Error('INVALID_ROWS');
  if (typeof cursor !== 'string' || cursor.length > 2048 || !cursor) throw Error('INVALID_CURSOR');
  const url = new URL(API + 'search.json');
  url.searchParams.set('query', query);
  url.searchParams.set('profile', 'rich');
  url.searchParams.set('rows', String(rows));
  url.searchParams.set('cursor', cursor);
  return url.toString();
}
/** Normalize metadata only: do not copy/thumbnail media or assert club identity. */
export function normalize(item, { query, retrievedAt, endpoint = 'search' } = {}) {
  const id = item?.id ?? item?.about;
  if (!validId(id)) throw Error('INVALID_RECORD_ID');
  const proxy = (item?.proxies ?? []).find(p => p?.europeanaProxy === false) ?? item?.proxies?.[0] ?? {};
  const aggregation = item?.aggregations?.[0] ?? {};
  const europeanAgg = item?.europeanaAggregation ?? {};
  const title = first(item.title, item.dcTitle, proxy.dcTitle);
  const rights = unique([
    ...strings(item.rights), ...strings(europeanAgg.edmRights),
    ...strings(aggregation.edmRights), ...strings(aggregation.dcRights)
  ]);
  const providerUrl = first(item.edmIsShownAt, aggregation.edmIsShownAt);
  const provider = unique([...strings(item.dataProvider), ...strings(aggregation.edmDataProvider)]);
  const aggregator = unique([...strings(item.provider), ...strings(aggregation.edmProvider)]);
  const year = first(item.year, item.dcDate, proxy.dcDate, proxy.dctermsCreated);
  const canonicalUrl = 'https://www.europeana.eu/en/item' + id;
  const searchable = [title, ...strings(item.dcDescription), ...strings(item.edmPlaceLabel)].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el');
  const signals = ['αρχελαοσ', 'κατερινη', 'πιερια', 'archelaos', 'katerini', 'pieria'].filter(t => searchable.includes(t));
  return {
    schemaVersion: 1, sourceSystem: 'europeana', europeanaId: id,
    title, dateLabel: year, datePrecision: year && /^\d{4}$/.test(year) ? 'year' : 'unknown',
    type: str(item.type) || null, originInstitutions: provider,
    aggregators: aggregator, sourceUrl: providerUrl, canonicalUrl,
    rightsStatements: rights, rightsReview: rights.length ? 'required' : 'missing_rights',
    researchQuery: str(query) || null,
    provenance: { endpoint, retrievedAt: retrievedAt || null, sourceId: id },
    relevance: { assessment: 'unreviewed', signals, reason: 'Search match is not historical proof' },
    clubIdentity: 'unverified', publicationStatus: REVIEW,
    mediaCopyAllowed: false, needsHumanReview: true
  };
}
export function deduplicate(items) {
  const seen = new Set();
  return items.filter(v => {
    if (!v?.europeanaId || seen.has(v.europeanaId)) return false;
    seen.add(v.europeanaId);
    return true;
  });
}
/** Explicitly gated, injected transport: production activation is deliberately unsupported. */
export function createStagingClient({ enabled = false, projectApproved = false,
  operatorApproved = false, mode = 'offline', apiKey, fetchImpl, sleep = async () => {},
  now = () => Date.now(), cacheTtlMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!(enabled && projectApproved && operatorApproved && mode === 'staging'))
    throw Error('EUROPEANA_DISABLED_OR_NOT_APPROVED');
  if (!str(apiKey) || typeof fetchImpl !== 'function') throw Error('MISSING_PRIVATE_AUTH_OR_TRANSPORT');
  const cache = new Map();
  let lastRequest = -Infinity;
  async function get(url) {
    const hit = cache.get(url);
    if (hit && now() < hit.expires) return hit.data;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const spacing = Math.max(0, 1000 - (now() - lastRequest));
      if (spacing) await sleep(spacing);
      lastRequest = now();
      let response;
      try {
        response = await fetchImpl(url, { method: 'GET', headers: {
          'X-Api-Key': apiKey, Accept: 'application/json'
        } });
      } catch (_) {
        if (attempt === 2) throw Error('EUROPEANA_NETWORK_ERROR');
        await sleep(1000); continue;
      }
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        const raw = Number(response.headers?.get?.('retry-after'));
        await sleep(Number.isFinite(raw) && raw >= 0 ? Math.min(raw * 1000, 3000) : 1000);
        continue;
      }
      if (!response.ok) throw Error('EUROPEANA_HTTP_' + response.status);
      const data = await response.json();
      if (!data || data.success !== true) throw Error('EUROPEANA_INVALID_RESPONSE');
      cache.set(url, { data, expires: now() + cacheTtlMs });
      return data;
    }
    throw Error('EUROPEANA_RETRY_EXHAUSTED');
  }
  return Object.freeze({
    async search(query, { maxPages = 2, rows = 20, retrievedAt = null } = {}) {
      if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 2) throw Error('INVALID_MAX_PAGES');
      let cursor = '*'; const cursors = new Set(); const entries = [];
      for (let n = 0; n < maxPages; n++) {
        if (cursors.has(cursor)) break;
        cursors.add(cursor);
        const response = await get(searchUrl(query, cursor, rows));
        if (!Array.isArray(response.items)) throw Error('EUROPEANA_INVALID_RESPONSE');
        entries.push(...response.items.map(item => normalize(item, { query, retrievedAt })));
        if (!response.nextCursor || response.nextCursor === cursor) break;
        cursor = response.nextCursor;
      }
      return deduplicate(entries);
    },
    async record(id, { retrievedAt = null } = {}) {
      const response = await get(recordUrl(id));
      if (!response.object) throw Error('EUROPEANA_INVALID_RESPONSE');
      if ((response.object.about ?? response.object.id) !== id) throw Error('EUROPEANA_RECORD_MISMATCH');
      return normalize(response.object, { retrievedAt, endpoint: 'record' });
    }
  });
}
