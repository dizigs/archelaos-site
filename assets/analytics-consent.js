/* Optional analytics for all public Archelaos pages.
 * Load GA4 + Clarity ONLY after an explicit choice; no cookie/tracking before consent.
 * Shared by the classic site and /rebuild/. */
(() => {
  'use strict';
  if (!['archelaos.club', 'www.archelaos.club'].includes(location.hostname)) return;
  if (window.__archelaosAnalyticsConsentReady) return;
  window.__archelaosAnalyticsConsentReady = true;

  const KEY = 'archelaos-analytics-consent-v1';
  const MEASUREMENT_ID = 'G-VV7C3N770T';
  const CLARITY_ID = 'z79wwgm3p8';
  const getChoice = () => {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  };
  const putChoice = value => {
    try { localStorage.setItem(KEY, value); } catch (_) { /* private mode */ }
  };

  function enableGoogleAnalytics() {
    if (window.__archelaosGaLoaded) return;
    window.__archelaosGaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {send_page_view: true});
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.append(tag);
  }

  function enableClarity() {
    if (window.__archelaosClarityLoaded) return;
    window.__archelaosClarityLoaded = true;
    window.clarity = window.clarity || function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    window.clarity('consentv2', {ad_Storage: 'denied', analytics_Storage: 'granted'});
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.clarity.ms/tag/' + CLARITY_ID;
    document.head.append(tag);
  }

  function enableAnalytics() {
    enableGoogleAnalytics();
    enableClarity();
  }

  function init() {
    const style = document.createElement('style');
    style.textContent = `
#arch-analytics-consent-panel{position:fixed;z-index:2147483000;left:12px;right:12px;bottom:clamp(12px,3vw,26px);width:min(680px,calc(100% - 24px));margin:auto;padding:20px 22px;background:linear-gradient(135deg,#fbf6eb,#eee2c7);border:1px solid #bba06a;border-top:3px solid #0b5137;border-radius:18px;box-shadow:0 18px 58px #082c2250;color:#163b2b;font:15px/1.55 system-ui,-apple-system,sans-serif;animation:arch-analytics-in .22s ease both}
#arch-analytics-consent-panel[hidden]{display:none!important}
#arch-analytics-consent-panel h2{margin:0 0 6px;color:#12432e;font:700 21px/1.3 Georgia,serif}
#arch-analytics-consent-panel p{margin:0 0 15px;max-width:60ch;font:inherit;color:#355544}
#arch-analytics-consent-panel .arch-analytics-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#arch-analytics-consent-panel button{min-height:44px;padding:9px 17px;border:1px solid #10442f;border-radius:10px;background:#10442f;color:white;font:700 14px system-ui,sans-serif;cursor:pointer}
#arch-analytics-consent-panel button.arch-analytics-reject{background:transparent;color:#10442f}
#arch-analytics-consent-panel a{color:#10442f;font:600 14px system-ui,sans-serif;text-underline-offset:3px}
#arch-analytics-settings-main{display:inline-block;margin:0 4px;padding:4px 5px;border:0;background:transparent;color:inherit;font:600 12px system-ui,sans-serif;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
#arch-analytics-settings-main.arch-analytics-floating{position:fixed;z-index:2147482900;bottom:10px;right:12px;background:#fbf6eb;color:#10442f;border:1px solid #baa56c;border-radius:8px;padding:8px}
#arch-analytics-consent-panel button:focus-visible,#arch-analytics-consent-panel a:focus-visible,#arch-analytics-settings-main:focus-visible{outline:3px solid #b69855;outline-offset:3px}
@keyframes arch-analytics-in{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:460px){#arch-analytics-consent-panel{padding:17px 16px}#arch-analytics-consent-panel .arch-analytics-actions{display:grid;grid-template-columns:1fr 1fr}#arch-analytics-consent-panel .arch-analytics-actions a{grid-column:1/-1}}
@media(prefers-reduced-motion:reduce){#arch-analytics-consent-panel{animation:none}}
`;
    document.head.append(style);

    const panel = document.createElement('section');
    panel.id = 'arch-analytics-consent-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Επιλογές στατιστικών');
    const heading = document.createElement('h2');
    heading.textContent = 'Η εμπειρία σας στον Αρχέλαο';
    const description = document.createElement('p');
    description.textContent = 'Με την αποδοχή ενεργοποιούνται Google Analytics 4 και Microsoft Clarity για τη βελτίωση του ιστοτόπου. Η επιλογή είναι προαιρετική.';
    const actions = document.createElement('div');
    actions.className = 'arch-analytics-actions';
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'arch-analytics-reject';
    reject.textContent = 'Απόρριψη';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = 'Αποδοχή';
    const privacy = document.createElement('a');
    privacy.href = '/privacy.html';
    privacy.textContent = 'Πολιτική απορρήτου';
    actions.append(reject, accept, privacy);
    panel.append(heading, description, actions);
    document.body.append(panel);

    const settings = document.createElement('button');
    settings.id = 'arch-analytics-settings-main';
    settings.type = 'button';
    settings.textContent = 'Ρυθμίσεις στατιστικών';
    settings.setAttribute('aria-label', 'Αλλαγή επιλογής στατιστικών');
    const footer = document.querySelector('.arch-footer-legal') || document.querySelector('footer') || document.querySelector('[role="contentinfo"]');
    if (footer) {
      footer.append(document.createTextNode(' · '), settings);
    } else {
      settings.className = 'arch-analytics-floating';
      document.body.append(settings);
    }

    const choose = choice => {
      putChoice(choice);
      panel.hidden = true;
      if (choice === 'accepted') enableAnalytics();
      else if (window.__archelaosGaLoaded || window.__archelaosClarityLoaded) {
        // Unload previously allowed trackers when consent is withdrawn.
        window.location.reload();
      }
    };
    accept.addEventListener('click', () => choose('accepted'));
    reject.addEventListener('click', () => choose('rejected'));
    settings.addEventListener('click', () => {
      panel.hidden = false;
      reject.focus();
    });

    const choice = getChoice();
    panel.hidden = choice === 'accepted' || choice === 'rejected';
    if (choice === 'accepted') enableAnalytics();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else {
    init();
  }
})();
