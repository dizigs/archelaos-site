#!/usr/bin/env node
/**
 * Generate editorial candidates from already-published biography JSON.
 * This NEVER modifies archelaos-history-events.json or the public timeline.
 * Run: node tools/suggest_history_events.mjs [--write]
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const people=JSON.parse(readFileSync(join(root,'hall-of-fame-people.json'),'utf8')).people;
const events=JSON.parse(readFileSync(join(root,'archelaos-history-events.json'),'utf8')).events;
const patterns=[
 ['record',/ρεκόρ/iu,'Αναφορά σε ρεκόρ'],
 ['championship',/πρωτάθλημα|πρωταθλητ|πανελληνιονίκ/iu,'Αναφορά σε πρωτάθλημα ή τίτλο'],
 ['club_administration',/πρόεδρ|εκλέχθηκε|διοικητικ/iu,'Αναφορά σε διοίκηση'],
 ['club_department',/ίδρυση|ιδρύθηκε|τμήμα/iu,'Αναφορά σε τμήμα'],
 ['international',/βαλκανιονίκ|ευρωπαϊκ|μεσογειακ|ολυμπιακ/iu,'Διεθνής διάκριση ή συμμετοχή']
];
const clean=t=>t.replace(/\s+/g,' ').trim();
const candidates=[];
for(const person of people){
 const text=String(person.bio||'');
 const sentences=text.split(/(?<=[.!;;])\s+|\n+/u).map(clean).filter(s=>s.length>=45&&s.length<=750);
 for(const sentence of sentences){
  const years=[...sentence.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0]));
  if(!years.length)continue;
  const match=patterns.find(([_,regex])=>regex.test(sentence));
  if(!match)continue;
  const [type,_,label]=match;
  if(events.some(event=>event.people?.includes(person.id)&&years.includes(Number((event.date||'').slice(0,4)))))continue;
  const key=person.id+'|'+years[0]+'|'+type;
  if(candidates.some(c=>c.key===key))continue;
  candidates.push({key,year:years[0],type,proposed_label:label,person_id:person.id,person_name:person.name,evidence_excerpt:sentence,status:'needs_editorial_review',notes:'Date, significance, duplication and original evidence must be checked before publication.'});
 }
}
candidates.sort((a,b)=>a.year-b.year||a.person_name.localeCompare(b.person_name,'el'));
const output={status:'draft_only',generated_from:'hall-of-fame-people.json',existing_events:events.length,proposal_count:candidates.length,candidates};
if(process.argv.includes('--write')){const path=join(root,'docs/history-event-candidates.json');writeFileSync(path,JSON.stringify(output,null,2)+'\n');console.log('Wrote '+candidates.length+' candidate records to '+path);}
else console.log('Found '+candidates.length+' candidates. Re-run with --write to save a review-only JSON. No public events were modified.');
