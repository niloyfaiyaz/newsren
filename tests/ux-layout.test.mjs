import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('reader keeps visible evidence, substantive qualifications and early Save without removed disclosures',()=>{
 const reader=app.slice(app.indexOf('function story('),app.indexOf('function edgeContent('));
 assert.ok(reader.indexOf('id="save-story"')<reader.indexOf('id="happened-title"'));
 for(const content of ['articleQualifications(a,s)','claimLimits(a)','sourceDetails(a,s)','takeawayMarkup(a,s)'])assert.ok(reader.includes(content));
 assert.doesNotMatch(reader,/<details|Prototype details|data-action="ask"/);
});
test('Bank search/theme/count/export are direct controls before compact cards; general help stays in FAQ',()=>{
 const bank=app.slice(app.indexOf('  const filtered=findCards(cards,bankFilters)'),app.indexOf('function faq'));
 for(const control of ['bank-count','bank-search','theme-filter','export-bank'])assert.ok(bank.indexOf(control)<bank.indexOf('filtered.map'));
 assert.ok(!bank.includes('bank-privacy'));
});
test('compact cards expose title/gist/manual selection/limitations and optional personal notes',()=>{
 const question=app.slice(app.indexOf('function evidenceCard('),app.indexOf('function question()'));
 for(const field of ['data-question-inspect','data-include','esc(c.gist)','readingLimits(c.limitations,c.id)',':personal'])assert.ok(question.includes(field));
 assert.ok(question.indexOf('data-include')<question.indexOf(':personal'));
});
test('removed unavailable UI has no dead controls or clickable character; reduced motion remains',()=>{
 assert.doesNotMatch(html,/id="summon"|id="drawer"|id="ask-form"/);
 assert.match(html,/Curated articles · public-source search on confirmation/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
