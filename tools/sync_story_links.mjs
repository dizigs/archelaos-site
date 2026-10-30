#!/usr/bin/env node
/* Synchronize Story cross-link labels from canonical people/history data.
 * Related IDs remain editorial choices; names and titles are generated, not hand-maintained.
 * Usage: node tools/sync_story_links.mjs --check|--write
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const base=join(dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2];
if(!['--check','--write'].includes(mode))throw new Error('Use --check or --write');
const file=join(base,'stories.html');
const html=readFileSync(file,'utf8');
const match=html.match(/const stories = (\[[\s\S]*?\]);\n/);
if(!match)throw new Error('Missing stories JSON');
const stories=JSON.parse(match[1]);
if(stories.length!==21)throw new Error('Expected 21 stories, got '+stories.length);
const people=JSON.parse(readFileSync(join(base,'hall-of-fame-people.json'),'utf8')).people;
const events=JSON.parse(readFileSync(join(base,'archelaos-history-events.json'),'utf8')).events;
const pmap=new Map(people.map(p=>[p.id,p])),emap=new Map(events.map(e=>[e.id,e]));
const personIds=[...new Set(stories.flatMap(s=>s.relatedPeople||[]))];
const eventIds=[...new Set(stories.flatMap(s=>s.relatedEvents||[]))];
for(const id of personIds)if(!pmap.has(id))throw new Error('Unknown person in Stories: '+id);
for(const id of eventIds)if(!emap.has(id))throw new Error('Unknown history event in Stories: '+id);
const persons=Object.fromEntries(personIds.map(id=>[id,{id,name:pmap.get(id).name}]));
const history=Object.fromEntries(eventIds.map(id=>[id,{id,title:emap.get(id).title}]));
const start=html.indexOf('const storyPeople = '),end=html.indexOf('function storyParagraphs(raw)',start);
if(start<0||end<0)throw new Error('Story link bindings not found');
const replacement='const storyPeople = '+JSON.stringify(persons)+';\nconst storyEvents = '+JSON.stringify(history)+';\n';
const result=html.slice(0,start)+replacement+html.slice(end);
if(mode==='--write'){if(result!==html)writeFileSync(file,result);console.log('Updated story labels from canonical people and event names.');}
else if(result!==html){console.error('Story metadata out of sync; run node tools/sync_story_links.mjs --write');process.exit(1)}
else console.log('Story links OK: '+stories.length+' stories, '+personIds.length+' people, '+eventIds.length+' events.');
