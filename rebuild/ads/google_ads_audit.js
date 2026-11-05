/* Concatenate after ad_grants_core.js. Manual Google Ads Scripts PREVIEW only.
 * No pause/enable/update, budgets, mail, webhooks or Issue writes exist here.
 * Google Ads runtime compatibility remains unverified until an authorized preview.
 */
'use strict';
function auditPreview(core, adsApp, utilities, fetchApp, logger) {
  const dryRun = true;
  if (!dryRun) throw Error('Only dry-run is implemented');
  const localDate = utilities.formatDate(new Date(), adsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
  const period = core.fullMonths(localDate);
  const snapshot = {schema_version:1, source_kind:'google-ads-readonly', as_of:localDate,
    ads:[], keywords:[], urls:[], months:[]};
  const urls = new Set();
  // Limits fail the run rather than silently reporting partial coverage as good.
  function rows(query) {
    const iterator = adsApp.search(query), result = [];
    while (iterator.hasNext()) {
      if (result.length >= 5000) throw Error('Account scan exceeds bounded preview capacity');
      result.push(iterator.next());
    }
    return result;
  }
  for (const row of rows("SELECT ad_group_ad.policy_summary.approval_status, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED'")) {
    snapshot.ads.push({approval:row.adGroupAd.policySummary.approvalStatus});
    for (const url of row.adGroupAd.ad.finalUrls || []) urls.add(url);
  }
  for (const row of rows("SELECT ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score FROM keyword_view WHERE campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED' AND ad_group_criterion.status = 'ENABLED' AND ad_group_criterion.negative = FALSE")) {
    snapshot.keywords.push({text:row.adGroupCriterion.keyword.text,
      quality:Number(row.adGroupCriterion.qualityInfo?.qualityScore) || null});
  }
  for (const row of rows("SELECT segments.month, metrics.clicks, metrics.impressions FROM customer WHERE segments.date BETWEEN '" + period.start + "' AND '" + period.end + "'")) {
    snapshot.months.push({month:row.segments.month.slice(0, 7),
      clicks:Number(row.metrics.clicks), impressions:Number(row.metrics.impressions)});
  }
  if (urls.size > 30) throw Error('Too many URLs for bounded preview');
  for (const url of urls) {
    let status = null;
    if (core.allowedUrl(url)) {
      try {
        status = fetchApp.fetch(url, {method:'get', followRedirects:false,
          muteHttpExceptions:true, validateHttpsCertificates:true}).getResponseCode();
      } catch { /* Unknown fetch result, never a fabricated HTTP failure/success. */ }
    }
    snapshot.urls.push({url, status});
  }
  // Public-safe counts only. Never log ad/keyword text, identifiers, actual URLs,
  // visitor data or account metrics. No automatic destination outside this log.
  logger.log(JSON.stringify(core.audit(snapshot)));
}

function main() {
  auditPreview(ArchelaosAdGrants, AdsApp, Utilities, UrlFetchApp, Logger);
}
if (typeof module !== 'undefined') module.exports = auditPreview;
