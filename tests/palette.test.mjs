import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projectRelationships} from '../public/lib/corpus.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('shared warm-white purple palette and recoloured sprites cover every mode and mood',async()=>{
 const css=await read('public/styles.css');assert.match(css,/--bg:#fdfbf8/);assert.match(css,/--text:#29252e/);assert.match(css,/--mint:#593280/);assert.doesNotMatch(css,/#b2f5d4|#10261d|color-scheme:dark/);
 for(const mood of ['idle','greeting','pointing','speaking','success','unavailable','thinking'])assert.ok(!(await read(`public/assets/${mood}.svg`)).includes('#b2f5d4'));
 assert.match(await read('public/app.mjs'),/const paletteView=true/);
});
test('preprint empty-state exact copy does not manufacture expanded edges',async()=>{
 const corpus=JSON.parse(await read('public/data/archive.json'));
 assert.deepEqual(projectRelationships(corpus,'gpt4-experiments'),[]);assert.deepEqual(projectRelationships(corpus,'gpt4-experiments',true),[]);
 assert.match(await read('public/app.mjs'),/<p>No verified connections yet\.<\/p>/);
 for(const id of ['uk-education-guidance','detector-bias'])assert.equal(projectRelationships(corpus,id,true)[0].id,'policy-detector-fairness');
});
test('nonsecret example pins selected snapshot with empty key and disabled allowance',async()=>{
 const example=await read('.env.example');assert.match(example,/^OPENAI_API_KEY=$/m);assert.match(example,/^OPENAI_MODEL=gpt-5\.4-mini-2026-03-17$/m);assert.match(example,/^NEWSREN_AI_REQUEST_LIMIT=0$/m);
});
