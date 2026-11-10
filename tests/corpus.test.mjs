import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCorpus, projectRelationships } from '../public/lib/corpus.mjs';
const corpus=JSON.parse(await readFile(new URL('../public/data/archive.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(corpus);
test('sixty-six initial records (six explicit additions) plus forty context records and three inaccessible legacy IDs, with tiered dates',()=>{
 assert.equal(validateCorpus(corpus),corpus);assert.equal(corpus.sources.length,109);assert.equal(corpus.events.length,109);
 assert.equal(corpus.articles.filter(a=>a.active).length,106);
 assert.equal(corpus.articles.filter(a=>a.editorialTier==='initial').length,66);
 assert.equal(corpus.articles.filter(a=>a.active&&a.dateVerified).length,77);
 for(const id of ['study-mode','learning-guardrails','chatgpt-launch'])assert.equal(corpus.articles.find(a=>a.id===id).active,false);
 for(const e of corpus.events.filter(e=>corpus.articles.some(a=>a.active&&a.eventId===e.id)))assert.equal(e.date,null);
});
for(const [name,mutate] of [
 ['missing schema',c=>delete c.version],['unsupported schema',c=>c.version=2],['missing source list',c=>delete c.sources],['duplicate source',c=>c.sources.push(c.sources[0])],['duplicate URL',c=>c.sources[1].url=c.sources[0].url],['invalid date',c=>c.sources[0].publicationDate='2025-02-30'],['invented access',c=>c.sources[0].accessLevel='fulltext'],['invented retrieval',c=>c.sources[0].retrievedAt='2026-07-17'],['missing provenance',c=>delete c.sources[0].provenance],['unsafe URL',c=>c.sources[0].url='javascript:alert(1)'],['unsupported article',c=>c.articles[0].sourceId='missing'],['missing evidence',c=>c.articles[0].evidenceRefs=[]],['missing limitations',c=>delete c.articles[0].limitations],['orphan event',c=>c.events[0].articleIds=['missing']],['unknown edge endpoint',c=>c.edges[0].toEvent='missing'],['unsupported edge type',c=>c.edges[0].type='caused'],['missing interpretation',c=>delete c.edges[0].interpretation],['missing edge evidence',c=>c.edges[0].evidenceRefs=[]],['unknown edge evidence',c=>c.edges[0].evidenceRefs.push('missing')],['false edge date',c=>c.edges[0].dates[0]='2020-01-01'],['missing edge limitation',c=>delete c.edges[0].uncertainty]
])test(`reject ${name}`,()=>{const c=clone();mutate(c);assert.throws(()=>validateCorpus(c),/Archive unavailable/);});
test('only rechecked incident comparisons are exposed, with honest empties',()=>{
 assert.equal(projectRelationships(corpus,'uk-education-guidance').length,1);
 assert.deepEqual(projectRelationships(corpus,'study-mode',true),[]);
 assert.equal(corpus.edges.length,11);assert.ok(corpus.edges.every(e=>e.interpretation==='Newsren-inferred'&&e.premiseSupport.length>=2));
 assert.ok(corpus.retiredEdges.some(e=>e.id==='creativity-confidence'&&e.active===false&&/different constructs/.test(e.retirementReason)));
 const c=clone();c.edges=[];validateCorpus(c);assert.deepEqual(projectRelationships(c,'study-mode'),[]);
 assert.throws(()=>projectRelationships(c,'missing'),/Unknown map anchor/);
});
for(const [name,mutate] of [
 ['unproven headline',a=>a.publisherHeadline='Invented original'],
 ['missing observation',a=>delete a.headlineVerification.observedAt],
 ['wrong URL',a=>a.headlineVerification.url='https://example.com/'],
 ['invented verified heading',a=>a.headlineVerification.status='verified'],
 ['missing unavailable reason',a=>delete a.headlineVerification.reason],
 ['multiline hook',a=>a.listHook='first\nsecond']
])test(`reject ${name}`,()=>{const c=clone();mutate(c.articles.find(a=>a.id==='study-mode'));assert.throws(()=>validateCorpus(c),/Archive unavailable/);});
test('verified headline requires matching observed heading, method, source URL and observation time',()=>{
 const c=clone(),a=c.articles.find(a=>a.id==='study-mode');
 a.publisherHeadline='Synthetic heading for validator only';
 Object.assign(a.headlineVerification,{status:'verified',observedHeading:a.publisherHeadline,method:'h1'});
 assert.equal(validateCorpus(c),c);
 a.headlineVerification.observedHeading='Different';assert.throws(()=>validateCorpus(c),/unsupported headline/);
});

test('three final selection records have exact observed primary headings and scoped access',()=>{
 for(const id of ['uk-education-guidance','detector-bias','gpt4-experiments']){
  const a=corpus.articles.find(a=>a.id===id),s=corpus.sources.find(s=>s.id===a.sourceId);
  assert.equal(a.publisherHeadline,a.headlineVerification.observedHeading);
  assert.equal(a.headlineVerification.method,'h1');assert.equal(s.accessLevel,'metadata-and-excerpt');
  assert.match(a.headlineVerification.observedAt,/\.\d{3}(Z|[+-]\d{2}:\d{2})$/);
 }
 assert.ok(!JSON.stringify(corpus).includes('homework'));
});
test('excerpt access rejects absent or non-millisecond retrieval timestamp',()=>{
 const c=clone(),s=c.sources.find(s=>s.id==='detector-bias');s.retrievedAt=null;
 assert.throws(()=>validateCorpus(c));s.retrievedAt='2026-10-25';assert.throws(()=>validateCorpus(c));
});

test('new policy-fairness edge is explained, bidirectional and expansion never imports unrelated edges',()=>{
 for(const id of ['uk-education-guidance','detector-bias']){const edges=projectRelationships(corpus,id,true);assert.equal(edges.length,1);assert.equal(edges[0].interpretation,'Newsren-inferred');assert.match(edges[0].uncertainty,/No causal/);}
 assert.deepEqual(projectRelationships(corpus,'gpt4-experiments',true),[]);
 for(const a of corpus.events)assert.ok(projectRelationships(corpus,a.id,true).every(e=>e.fromEvent===a.id||e.toEvent===a.id));
});

test('explicit additions permit Politics13/Media13 without weakening duplicate initial-source rejection',()=>{
 const initial=corpus.articles.filter(a=>a.editorialTier==='initial');assert.equal(initial.length,66);
 for(const t of ['politics-international-relations','media-communication'])assert.equal(initial.filter(a=>a.primaryTopic===t).length,13);
 const c=clone(),a=structuredClone(initial[0]);a.id='synthetic-duplicate-primary';c.articles.push(a);
 assert.throws(()=>validateCorpus(c),/duplicate initial source coverage/);
});
