/* Archive-only fixture deep links from search. No calendars, export links,
 * subscriptions, homepage fixture list, timers, or external calendar providers.
 * Canonical reviewed fixture data remains untouched.
 */
(() => {
  'use strict';
  const requested = new URLSearchParams(location.search).get('fixture');
  if (!requested || !/^fixture-[a-z0-9-]{10,90}$/.test(requested)) return;
  const create = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const ownClub = value => /αρχελα|archela/i.test(
    String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  );
  const local = date => new Intl.DateTimeFormat('el-GR', {
    timeZone:'Europe/Athens',day:'2-digit',month:'long',year:'numeric',
    ...(date ? { weekday:'long' } : {})
  });
  async function init() {
    const main = document.querySelector('main');
    if (!main) return;
    const section = create('section','fx-section fx-direct-fixture');
    section.setAttribute('aria-label','Αρχειακή καταχώριση αγώνα');
    const shell = create('div','arch-container fx-shell');
    const heading = create('h2','','Αρχειακή καταχώριση αγώνα');
    const status = create('p','fx-status','Ανάκτηση εγκεκριμένης καταχώρισης…');
    status.setAttribute('aria-live','polite');
    const list = create('div','fx-cards');
    shell.append(heading,status,list);
    section.append(shell);
    const about = document.querySelector('#about');
    if (about) about.before(section); else main.append(section);
    try {
      const stage = location.pathname.startsWith('/rebuild/');
      const response = await fetch(
        stage ? '/rebuild/data/match-schedule.json' : '/assets/site/data/match-schedule.json',
        {cache:'no-cache'}
      );
      if (!response.ok) throw Error('ARCHIVE_DATA_NOT_AVAILABLE');
      const data = await response.json();
      if (data?.schema_version !== 1 ||
          data.approval_policy !== 'owner_approved_only' ||
          data.display_policy !== 'home_and_away' ||
          !Array.isArray(data.matches) || data.matches.length > 500)
        throw Error('ARCHIVE_DATA_UNVERIFIED');
      const item = data.matches.find(entry => entry.id === requested &&
        entry.approval?.status === 'owner_approved' &&
        ['handball','volleyball'].includes(entry.sport) &&
        (ownClub(entry.home_team) || ownClub(entry.away_team)));
      if (!item) {
        status.textContent = 'Δεν βρέθηκε εγκεκριμένη αρχειακή καταχώριση για αυτόν τον αγώνα.';
        section.scrollIntoView({block:'start'});
        return;
      }
      const date = item.start_at
        ? new Date(item.start_at)
        : typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
          ? new Date(item.date + 'T12:00:00Z') : null;
      if (!date || !Number.isFinite(date.getTime())) {
        status.textContent = 'Δεν βρέθηκε αξιόπιστη ημερομηνία για αυτή την καταχώριση.';
        return;
      }
      const article = create('article','fx-card fx-card-feature');
      const label = item.sport === 'handball' ? 'ΧΑΝΤΜΠΟΛ' : 'ΒΟΛΕΪ';
      article.append(
        create('p','fx-sport',label + (item.category ? ' · ' + item.category : '')),
        create('p','fx-competition',item.competition || 'Αγωνιστική αναμέτρηση'),
        create('p','fx-date-month',local(true).format(date) +
          (item.start_at ? ' · ' + new Intl.DateTimeFormat('el-GR', {
            timeZone:'Europe/Athens',hour:'2-digit',minute:'2-digit'
          }).format(date) : ' · Ώρα προς ανακοίνωση')),
        create('p','fx-teams',String(item.home_team || '') + ' — ' + String(item.away_team || '')),
        create('p','fx-venue',item.venue || 'Γήπεδο: προς ανακοίνωση')
      );
      list.append(article);
      status.textContent = 'Ο αγώνας που επιλέξατε από την αναζήτηση.';
      section.scrollIntoView({block:'start'});
    } catch {
      status.textContent = 'Το εγκεκριμένο αρχείο αγώνων δεν είναι προσωρινά διαθέσιμο.';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else void init();
})();
