// Lighthouse CI on production-style local static build.
// Real-user Core Web Vitals remain tracked separately by PageSpeed Insights.
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'python3 -u -m http.server 8765 --bind 127.0.0.1 --directory dist',
      startServerReadyPattern: 'Serving HTTP on',
      startServerReadyTimeout: 30000,
      url: [
        'http://127.0.0.1:8765/',
        'http://127.0.0.1:8765/tmimata.html',
        'http://127.0.0.1:8765/news.html',
      ],
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
        throttlingMethod: 'simulate',
        // Lighthouse defaults to a mobile profile. 'mobile' is not a valid preset.
      },
    },
    assert: {
      // During onboarding, report below-target scores rather than failing
      // production deployments on a single potentially variable lab run.
      assertions: {
        'categories:performance': ['warn', { minScore: 0.70 }],
        'categories:accessibility': ['warn', { minScore: 0.90 }],
        'categories:best-practices': ['warn', { minScore: 0.90 }],
        'categories:seo': ['warn', { minScore: 0.90 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
      // LHCI_GITHUB_APP_TOKEN is passed as an Actions secret and is never
      // committed to the repository or written to a browser-visible file.
    },
  },
};
