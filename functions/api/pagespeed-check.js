// On-demand, origin-restricted PageSpeed Insights report for the Archelaos site.
// The Google key is read only from Cloudflare Pages Production secrets.
// Only canonical site pages may be analysed; results are cached to protect quota.
const SITE = "https://www.archelaos.club";
const PAGES = Object.freeze({
  home: "/",
  departments: "/tmimata.html",
  news: "/news.html",
  hall: "/hall-of-fame.html",
  museum: "/history.html",
  contact: "/contact.html"
});
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const CACHE_SECONDS = 6 * 60 * 60;

function reply(body, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cacheSeconds
        ? `public, max-age=0, s-maxage=${cacheSeconds}`
        : "no-store"
    }
  });
}

export async function onRequestGet({ request, env }) {
  const input = new URL(request.url);
  const page = input.searchParams.get("page") || "home";
  const device = input.searchParams.get("device") || "mobile";
  if (!Object.hasOwn(PAGES, page) || !["mobile", "desktop"].includes(device)) {
    return reply({ ok: false, error: "invalid_page_or_device", allowedPages: Object.keys(PAGES) }, 400);
  }
  if (!env.PAGESPEED_API_KEY) {
    return reply({ ok: false, error: "pagespeed_secret_not_configured" }, 503);
  }

  // A fixed, normalized cache key prevents arbitrary URLs and query strings
  // from multiplying Google API requests or allowing external target scans.
  const canonical = SITE + PAGES[page];
  const cacheKey = new Request(
    `${SITE}/api/pagespeed-check?v=5&page=${encodeURIComponent(page)}&device=${device}`,
    { method: "GET" }
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", canonical);
  api.searchParams.set("strategy", device);
  api.searchParams.set("locale", "el");
  for (const category of CATEGORIES) api.searchParams.append("category", category);
  api.searchParams.set("key", env.PAGESPEED_API_KEY);

  let upstream;
  try {
    upstream = await fetch(api.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(85000)
    });
  } catch (error) {
    return reply({ ok: false, error: "pagespeed_request_failed", reason: error?.name === "TimeoutError" ? "timeout" : "network_error" }, 502);
  }

  if (!upstream.ok) {
    // Never return the upstream URL, response body or key in an error.
    return reply({ ok: false, error: "pagespeed_upstream_error", upstreamStatus: upstream.status }, 502);
  }

  let report;
  try {
    report = await upstream.json();
  } catch {
    return reply({ ok: false, error: "invalid_pagespeed_response" }, 502);
  }
  const lighthouse = report.lighthouseResult || {};
  const audits = lighthouse.audits || {};
  const scores = {};
  for (const category of CATEGORIES) {
    const score = lighthouse.categories?.[category]?.score;
    scores[category] = typeof score === "number" ? Math.round(score * 100) : null;
  }
  const metricKeys = [
    "first-contentful-paint",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "speed-index"
  ];
  const labMetrics = {};
  for (const id of metricKeys) {
    if (audits[id]) labMetrics[id] = {
      displayValue: audits[id].displayValue ?? null,
      numericValue: audits[id].numericValue ?? null
    };
  }
  // Small diagnostic summary for identifying actual LCP bottlenecks.
  const diagnosis = {};
  for (const id of [
    "largest-contentful-paint-element",
    "lcp-discovery-insight",
    "lcp-breakdown-insight",
    "render-blocking-resources",
    "font-display-insight",
    "image-delivery-insight"
  ]) {
    const audit = audits[id];
    if (!audit) continue;
    const first = audit.details?.items?.[0];
    const node = first?.node || first?.items?.find?.(entry => entry.node)?.node;
    diagnosis[id] = {
      title: audit.title || null,
      displayValue: audit.displayValue || null,
      description: (audit.description || "").slice(0,320),
      firstElement: node ? {
        selector: (node.selector || "").slice(0,220),
        snippet: (node.snippet || "").slice(0,260)
      } : null,
      firstUrl: typeof first?.url === "string" ? first.url.slice(0,280) : null,
      savingsMs: typeof audit.numericValue === "number" ? audit.numericValue : null
    };
  }
  const result = reply({
    ok: true,
    page,
    url: canonical,
    device,
    source: "Google PageSpeed Insights API v5",
    measuredAt: report.analysisUTCTimestamp || new Date().toISOString(),
    scores,
    labMetrics,
    diagnosis,
    lcpInsightDetails: JSON.stringify(audits["lcp-breakdown-insight"]?.details || null).slice(0, 3800),
    lcpDiscoveryDetails: JSON.stringify(audits["lcp-discovery-insight"]?.details || null).slice(0, 1800),
    fieldDataAvailable: Boolean(report.loadingExperience?.metrics && Object.keys(report.loadingExperience.metrics).length)
  }, 200, CACHE_SECONDS);
  try { await cache.put(cacheKey, result.clone()); } catch { /* Cache is best-effort. */ }
  return result;
}
