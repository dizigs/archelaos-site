#!/usr/bin/env node
// Ensure related-story cards never drift from the 21 canonical story entries.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const html=readFileSync(join(root,'stories.html'),'utf8');
const match=html.match(/const stories = (\[[\s\S]*?\]);\n/);
if(!match)throw Error('Story archive not found');
const list=JSON.parse(match[1]);
const manifest={version:1,source:'stories.html',stories:list.map((x,i)=>({number:i+1,title:x.title,people:x.relatedPeople||[],events:x.relatedEvents||[]}))};
const file=join(root,'assets/story-relations.json');
const output=JSON.stringify(manifest,null,2)+'\n';
if(process.argv[2]==='--write'){writeFileSync(file,output);console.log('Story relationships updated');}
else if(process.argv[2]==='--check'){if(readFileSync(file,'utf8')!==output){console.error('Story relationships stale. Run: node tools/sync_story_relations.mjs --write');process.exit(1)}console.log('Story relationships synchronized');}
else throw Error('Use --check or --write');
