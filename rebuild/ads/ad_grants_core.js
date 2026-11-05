/* Offline rules and consent contract. No network, storage or Ads mutations. */
'use strict';
const ArchelaosAdGrants = (() => {
  const codes = Object.freeze(['AD_DISAPPROVED', 'URL_BROKEN', 'URL_UNCHECKED',
    'KEYWORD_LOW_QUALITY', 'KEYWORD_QUALITY_UNAVAILABLE', 'KEYWORD_SINGLE_WORD', 'CTR_BELOW_TARGET', 'CTR_DATA_UNAVAILABLE']);
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('el').replace(/ς/g, 'σ').replace(/["[\]]/g, '').trim();
  function allowedUrl(value) {
    // Apps Script has no browser URL global. Exact host and conservative public
    // path allowlist also exclude credentials, query strings and encoded paths.
    return typeof value === 'string' &&
      /^https:\/\/(?:www\.)?archelaos\.club\/(?:index|tmimata|contact|history|hall-of-fame|70-stigmes|stories|interviews)\.html$/.test(value);
  }
  function fullMonths(asOf) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw Error('Invalid account-local date');
    const day = new Date(asOf + 'T00:00:00Z');
    if (!Number.isFinite(+day) || day.toISOString().slice(0, 10) !== asOf) throw Error('Invalid date');
    const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 0));
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 2, 1));
    const previous = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1));
    return {start:start.toISOString().slice(0, 10), end:end.toISOString().slice(0, 10),
      months:[start.toISOString().slice(0, 7), previous.toISOString().slice(0, 7)]};
  }
  function audit(snapshot) {
    if (snapshot.schema_version !== 1 || !['synthetic-fixture', 'google-ads-readonly'].includes(snapshot.source_kind) || !Array.isArray(snapshot.ads) ||
        !Array.isArray(snapshot.keywords) || !Array.isArray(snapshot.urls) || !Array.isArray(snapshot.months)) {
      throw Error('Incomplete snapshot');
    }
    const counts = Object.fromEntries(codes.map(code => [code, 0]));
    for (const ad of snapshot.ads) if (ad.approval === 'DISAPPROVED') counts.AD_DISAPPROVED++;
    for (const item of snapshot.urls) {
      if (!allowedUrl(item.url) || item.status === null || item.status === undefined) counts.URL_UNCHECKED++;
      else if (Number.isInteger(item.status) && item.status >= 400 && item.status <= 599) counts.URL_BROKEN++;
      // Redirects are deliberately not followed: the redirect destination has
      // not passed our host/path checks. They cannot prove a working landing.
      else if (item.status < 200 || item.status >= 300 || !Number.isInteger(item.status)) counts.URL_UNCHECKED++;
    }
    const exceptions = new Set(['αρχελαοσ', 'archelaos']);
    for (const keyword of snapshot.keywords) {
      if (Number.isInteger(keyword.quality) && keyword.quality > 0 && keyword.quality < 3) counts.KEYWORD_LOW_QUALITY++;
      if (!Number.isInteger(keyword.quality) || keyword.quality <= 0 || keyword.quality > 10) counts.KEYWORD_QUALITY_UNAVAILABLE++;
      const text = normalize(keyword.text);
      if (text && !/\s/.test(text) && !exceptions.has(text)) counts.KEYWORD_SINGLE_WORD++;
    }
    const period = fullMonths(snapshot.as_of);
    for (const month of period.months) {
      const row = snapshot.months.find(item => item.month === month);
      if (!row || !Number.isInteger(row.impressions) || !Number.isInteger(row.clicks) ||
          row.impressions <= 0 || row.clicks < 0 || row.clicks > row.impressions) counts.CTR_DATA_UNAVAILABLE++;
      else if (row.clicks / row.impressions < 0.05) counts.CTR_BELOW_TARGET++;
    }
    return {schema_version:1, mode:'dry-run', source_kind:snapshot.source_kind, as_of:snapshot.as_of,
      policy_status:'current-policy-review-required',
      findings:codes.filter(code => counts[code]).map(code => ({code, count:counts[code]}))};
  }
  function conversion(receipt, consent, seen) {
    // The integrating server must supply this receipt ONLY after accepting the
    // form. A click, form submit event, HTTP 200, or thank-you URL is insufficient.
    if (!receipt || receipt.status !== 'accepted' || receipt.form_kind !== 'academy_interest' ||
        typeof receipt.id !== 'string' || !receipt.id || receipt.id.length > 100 ||
        consent?.analytics_storage !== 'granted' || seen.has(receipt.id)) return null;
    seen.add(receipt.id);
    return {name:'generate_lead', params:{form_kind:'academy_interest'},
      ads_eligible:consent.ad_storage === 'granted' && consent.ad_user_data === 'granted'};
  }
  function analyticsEvidence(report, now) {
    const generated = Date.parse(report?.generated_utc);
    const current = Date.parse(now);
    if (!Number.isFinite(generated) || !Number.isFinite(current) || generated > current ||
        current - generated > 48 * 60 * 60 * 1000) throw Error('Missing/stale aggregate evidence');
    for (const source of ['ga4', 'search_console']) {
      if (!Array.isArray(report[source]?.daily) || !report[source].range?.endDate) throw Error('Invalid aggregate schema');
      const end = Date.parse(report[source].range.endDate + 'T00:00:00Z');
      if (!Number.isFinite(end) || end > current || current - end > 5 * 86400000) throw Error('Stale aggregate coverage');
    }
    return {schema_version:1, ga4_days:report.ga4.daily.length,
      search_console_days:report.search_console.daily.length, conversions:'unavailable',
      note:'Existing aggregate has traffic totals, not verified lead events or Ads attribution'};
  }
  return Object.freeze({allowedUrl, fullMonths, audit, conversion, analyticsEvidence, codes});
})();
if (typeof module !== 'undefined') module.exports = ArchelaosAdGrants;
