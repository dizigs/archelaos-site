/* Self-contained illustrative preview. No tracking, cookies or production data. */
(()=>{
'use strict';
const variants={
  archery:{title:'Τοξοβολία.',lead:'Συγκέντρωση, ακρίβεια και αγάπη για τον αθλητισμό. Γνώρισε την καθημερινότητα του τμήματος στην Κατερίνη.',about:'Η Τοξοβολία του Αρχέλαου συνδυάζει τεχνική, πειθαρχία και ομαδικό πνεύμα. Οι πληροφορίες προπονήσεων επιβεβαιώνονται πριν από τη δημοσίευση.',history:'https://archelaos.club/tmimata.html#sport-archery'},
  wrestling:{title:'Πάλη.',lead:'Δύναμη, τεχνική και σεβασμός. Η αθλητική προσπάθεια αρχίζει από την καθημερινή προπόνηση.',about:'Το τμήμα Πάλης καλλιεργεί την τεχνική, την επιμονή και την ομαδικότητα. Το πρόγραμμα και οι εγκαταστάσεις θα αναρτηθούν όταν επιβεβαιωθούν.',history:'https://archelaos.club/tmimata.html#sport-wrestling'}
};
const selected=new URLSearchParams(window.location.search).get('sport')||'archery';
const key=Object.hasOwn(variants,selected)?selected:'archery';
const data=variants[key];
const title=document.getElementById('sport-title');
const lead=document.getElementById('hero-lead');
const about=document.getElementById('about-text');
const history=document.getElementById('history-card');
if(title&&lead&&about&&history){title.textContent=data.title;lead.textContent=data.lead;about.textContent=data.about;history.href=data.history;}
document.title=data.title.replace('.','')+' | Πρότυπο τμήματος Αρχέλαος';
})();
