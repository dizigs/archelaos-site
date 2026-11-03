/* Shared sponsor/participation strip. No analytics, tracking or mutable content. */
(() => {
  'use strict';
  const ID = 'arch-program-support';
  function mount() {
    if (document.getElementById(ID)) return;
    const footer = document.querySelector('footer.arch-footer');
    const inner = footer && footer.querySelector('.arch-footer-inner');
    if (!inner) return;
    const section = document.createElement('section');
    section.id = ID;
    section.className = 'arch-program-support';
    section.setAttribute('aria-label', 'Προγράμματα υποστήριξης και συμμετοχής');
    const uptime = document.createElement('div');
    uptime.className = 'arch-program-uptime';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'arch-program-eyebrow';
    eyebrow.textContent = 'Με τη στήριξη';
    const sponsor = document.createElement('a');
    sponsor.href = 'https://uptimerobot.com/';
    sponsor.target = '_blank';
    sponsor.rel = 'sponsored noopener noreferrer';
    sponsor.className = 'arch-program-uptime-link';
    sponsor.setAttribute('aria-label', 'UptimeRobot — επίσημος ιστότοπος');
    const logo = document.createElement('img');
    // Official first-party logo referenced by UptimeRobot's sponsorship page.
    logo.src = 'https://uptimerobot.com/assets/images/uptimerobot-logo-dark.svg';
    logo.alt = 'UptimeRobot';
    logo.width = 112;
    logo.height = 27;
    logo.loading = 'lazy';
    logo.decoding = 'async';
    sponsor.append(logo);
    uptime.append(eyebrow, sponsor);
    const google = document.createElement('p');
    google.className = 'arch-program-google';
    google.append(document.createTextNode('Συμμετέχουμε στο '));
    const programme = document.createElement('a');
    programme.href = 'https://www.google.com/nonprofits/';
    programme.target = '_blank';
    programme.rel = 'noopener noreferrer';
    programme.textContent = 'Google for Nonprofits';
    google.append(programme, '.');
    section.append(uptime, google);
    const bottom = inner.querySelector('.arch-footer-bottom');
    inner.insertBefore(section, bottom || null);
  }
  // Defer scripts can run at readyState=interactive, before the shared shell
  // mounts the footer; wait until DOMContentLoaded in this case.
  if (document.readyState === 'complete') mount();
  else document.addEventListener('DOMContentLoaded', mount, {once: true});
})();