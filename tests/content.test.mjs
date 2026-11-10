import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateCorpus,projectRelationships,publicationDisplayFor} from '../public/lib/corpus.mjs';
import {THEMES,resolveTheme,isInitialArticle} from '../public/lib/themes.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const c=read('../public/data/archive.json'), retained=read('../lib/retained-excerpts.json'), ids=read('./fixtures/content-legacy-ids.json');
const sha=s=>createHash('sha256').update(s).digest('hex');
// Preserve the original sixty-record audit; six explicit NR-008 additions are tested separately.
const initial=c.articles.filter(a=>isInitialArticle(a)&&!a.id.startsWith('nr008-'));
const legacyActive=c.articles.filter(a=>a.active&&!a.id.startsWith('nr008-'));
test('six exact themes and unambiguous-only legacy navigation aliases',()=>{
 assert.deepEqual(THEMES.map(x=>x.label),['Arts and Culture','Science and Technology','Media and Communication','Politics and International Relations','Environment and Sustainability','Individuals and Values']);
 assert.equal(resolveTheme('Technology'),'science-technology');assert.equal(resolveTheme('Environment'),'environment-sustainability');
 for(const x of ['Health','Society','Invented'])assert.equal(resolveTheme(x),null);
});
test('sixty distinct qualified primary articles; context cannot inflate counts',()=>{
 validateCorpus(c);assert.equal(initial.length,60);
 for(const t of THEMES){const a=initial.filter(a=>a.primaryTopic===t.key);assert.equal(a.length,10);}
 // ≥7 is an editorial target, not licence to assert an unestablished reporting method.
 const counts=THEMES.map(t=>initial.filter(a=>a.primaryTopic===t.key&&c.sources.find(s=>s.id===a.sourceId).independentReporting).length);
 assert.deepEqual(counts,[5,2,6,6,7,3]);
 for(const a of initial){const s=c.sources.find(s=>s.id===a.sourceId);assert.ok(s.independentReportingRationale.length>60);if(s.independentReporting)assert.equal(s.editorialType,'reporting');}
 assert.equal(new Set(initial.map(a=>c.sources.find(s=>s.id===a.sourceId).independentReportingRationale)).size,60);
 assert.equal(new Set(initial.map(a=>a.sourceId)).size,60);assert.equal(new Set(c.sources.map(s=>s.canonicalURL??s.url)).size,c.sources.length);
 for(const a of initial){const s=c.sources.find(s=>s.id===a.sourceId);assert.ok(a.dateVerified&&s.dateAssurance.verified);assert.ok(['observed-metadata','visible-dateline'].includes(s.dateAssurance.tier));assert.equal(a.headlineVerification.observedHeading,a.publisherHeadline);assert.ok(s.excerpt.length>=80);}
 for(const a of c.articles.filter(a=>a.editorialTier==='context'))assert.equal(c.sources.find(s=>s.id===a.sourceId).independentReporting,false);
});
test('every reachable gist/source claim/analysis premise has normalised retained spans, not publisher-exact claims',()=>{
 for(const a of legacyActive){
  const s=c.sources.find(s=>s.id===a.sourceId);assert.equal(sha(s.excerpt),s.excerptHash);assert.equal(retained[s.id].text,s.excerpt);assert.equal(retained[s.id].excerptHash,s.excerptHash);
  assert.equal(a.claimSupport.map(x=>x.claim).join(' '),a.gist);assert.ok(!a.evidence.includes(a.gist));
  for(const claim of [...a.claimSupport,...a.sourceClaims]){const r=claim.support,ss=c.sources.find(s=>s.id===r.sourceId);assert.equal(ss.excerpt.slice(r.start,r.end),r.quote);assert.equal(r.excerptHash,ss.excerptHash);}
  assert.match(a.analysisSupport.kind,/interpretive/);
 }
});
test('distinctive numerical gist claims are present in retained support (lexical regression, not semantic proof)',()=>{
 const normal=x=>x.replace(/[–−]/g,'-').replace(/\s/g,'');
 for(const a of legacyActive){
  const q=normal(a.claimSupport.map(x=>x.support.quote).join(' '));
  for(const n of a.gist.match(/\d+(?:[.,]\d+)*(?:[–-]\d+)?/g)??[])assert.ok(q.includes(normal(n)),`${a.id}: number ${n} absent from retained passage`);
 }
});
test('entity/place substitutions cannot silently escape the claim map; bad spans and unknown support fail closed',()=>{
 for(const change of [a=>a.gist=a.gist.replace('Amy Winehouse','Taylor Swift'),a=>a.gist+=' In Singapore.',a=>a.claimSupport[0].support.start++,a=>a.sourceClaims[0].support.sourceId='missing',a=>a.claimSupport[0].support.quote='unsupported']){
  const x=structuredClone(c);change(x.articles.find(a=>a.id==='nr007-report-001'));assert.throws(()=>validateCorpus(x));
 }
 // Known entity/place support pairs explicitly reviewed, not a keyword entailment engine.
 for(const [id,entity]of [['nr007-report-001','Catherine Schreiber'],['nr007-report-003','San Francisco'],['nr007-report-055','PAP'],['nr007-report-058','Singapore']]){const a=c.articles.find(a=>a.id===id);assert.ok(a.claimSupport[0].premiseSpans.some(r=>r.quote.includes(entity)));}
});
test('all active edges retain both endpoint premises and expansion stays incident-only',()=>{
 for(const e of c.edges){assert.ok(e.premiseSupport.length>=2);for(const r of e.premiseSupport){const s=c.sources.find(s=>s.id===r.sourceId);assert.equal(r.quote,s.excerpt.slice(r.start,r.end));}assert.deepEqual(e.dates,[null,null]);}
 for(const e of c.events)assert.ok(projectRelationships(c,e.id,true).every(x=>x.fromEvent===e.id||x.toEvent===e.id));
 const policy=c.edges.find(e=>e.id==='policy-detector-fairness');assert.ok(!/reports detector-fairness research/.test(policy.explanation));
 const funding=c.edges.find(e=>e.id==='funding-flexibility');assert.match(funding.explanation,/do not establish flexible/);
});
test('all 43 legacy IDs and original active/retired edge IDs are preserved',()=>{
 for(const k of ['articles','sources','events'])for(const id of ids[k])assert.ok(c[k].some(x=>x.id===id));
 for(const id of ids.edges)assert.ok([...c.edges,...c.retiredEdges].some(e=>e.id===id));
 assert.equal(c.articles.filter(a=>a.editorialTier==='legacy-inactive').length,3);
 for(const a of c.articles.slice(0,43))assert.ok(a.legacyPrimaryTopic&&a.editorialMappingRationale);
});
test('URL-only/prior/unknown dates never carry verified status, event dates remain unknown',()=>{
 for(const s of c.sources){if(['url-only','prior-unconfirmed','unknown'].includes(s.dateAssurance.tier))assert.equal(s.dateAssurance.verified,false);assert.equal(s.eventDate??null,null);}
 for(const a of legacyActive)assert.equal(c.events.find(e=>e.id===a.eventId).date,null);
});

test('100 authored hooks/questions are distinct, bounded and mapped to retained premises (not semantic proof)',()=>{
 const active=legacyActive;assert.equal(new Set(active.map(a=>a.listHook)).size,100);assert.equal(new Set(active.map(a=>a.analysis)).size,100);
 for(const a of active){assert.ok(a.listHook.length<=120&&!a.listHook.includes('\n'));assert.match(a.analysis,/^Newsren interpretive question:/);assert.ok(a.analysis.length>120);assert.ok(a.analysisSupport.premises.length);assert.ok(a.hookPremises.length);}
});
test('curated fidelity is visibly normalised; transformations preserve audit hashes, paragraph boundaries and arXiv caveat',()=>{
 for(const a of legacyActive){const s=c.sources.find(s=>s.id===a.sourceId),r=retained[s.id];assert.equal(s.evidenceKind,'normalisedretainedpassage');assert.equal(a.evidenceKind,'normalisedretainedpassage');assert.equal(s.excerptParagraphs.join('\n\n'),s.excerpt);assert.ok(s.excerpt.length<=1250);assert.equal(r.exactVerified,false);assert.equal(r.fidelityState,'normalised-selected-passage');assert.match(s.excerptAssurance,/not a publisher-verbatim/);assert.match(s.headlineAssurance,/not independently/);assert.ok(s.excerptTransformNotes.length);assert.equal((s.excerpt.match(/“/g)||[]).length,(s.excerpt.match(/”/g)||[]).length);assert.ok(!/\b(?:T wo|I t\b|T owards|S andra|P olluters|O n\b|S ymeon|I ’m)/.test(s.excerpt));assert.ok(!/\(Photo:|Revealed: Mexico’s industrial boomtown/.test(s.excerpt));}
 assert.equal(retained['gpt4-experiments'].exactVerified,false);assert.match(retained['gpt4-experiments'].provenance,/prior checked archive/i);assert.match(c.articles.find(a=>a.id==='gpt4-experiments').limitations,/Preprint; abstract access only/);
 const bad=structuredClone(c);bad.sources.find(s=>s.excerpt).excerptFidelity='publisher-verbatim';assert.throws(()=>validateCorpus(bad),/fidelity/);
});
test('narrow source, gist and interpretive spans rehash to normalised text; malformed counterpart rejected',()=>{
 let narrow=0;for(const a of legacyActive){const s=c.sources.find(s=>s.id===a.sourceId);const refs=[...a.claimSupport.flatMap(x=>x.premiseSpans),...a.sourceClaims.map(x=>x.support),...a.analysisSupport.premises,...a.hookPremises];for(const r of refs){assert.equal(r.kind,'normalisedretainedpassage');assert.equal(r.quote,s.excerpt.slice(r.start,r.end));assert.equal(r.excerptHash,sha(s.excerpt));if(r.end-r.start<s.excerpt.length)narrow++;else assert.ok(r.wholePassageReason);}}
 assert.ok(narrow>400);const bad=structuredClone(c);bad.articles.find(a=>a.active).claimSupport[0].premiseSpans[0].end--;assert.throws(()=>validateCorpus(bad),/span/);
});
test('publication display converts observed offsets only; publisher/history/event dates remain separate',()=>{
 for(const a of initial){const s=c.sources.find(s=>s.id===a.sourceId);assert.deepEqual(s.publicationDisplay,publicationDisplayFor(s.dateAssurance.observedValue,s.publicationDate));assert.equal(s.publicationDisplay.derived,true);assert.equal(s.publicationOriginal.historicalStoredDay,s.publicationDate);assert.equal(s.eventDate,null);}
 assert.equal(publicationDisplayFor('2026-10-24T23:30:00.000Z','2026-10-24').day,'2026-10-25');
 assert.equal(publicationDisplayFor('Sun, 25 Oct 2026 00:30:00 +0800','2026-10-25').day,'2026-10-25');
 assert.equal(publicationDisplayFor('2026-10-24T18:30:00-07:00','2026-10-24').day,'2026-10-25');
 assert.equal(publicationDisplayFor('2026-10-24','2026-10-24').derived,false);assert.equal(publicationDisplayFor('2026-10-24','2026-10-24').zone,'publisher date; zone unknown');
 for(const n of ['002','010','019','030','035','061']){const s=c.sources.find(s=>s.id===`nr007-report-${n}-source`);assert.ok(s.publicationOriginal.value);assert.equal(s.publicationDisplay.zone,'Asia/Singapore');}
 const bad=structuredClone(c);bad.sources.find(s=>s.publicationDisplay?.derived).publicationDisplay.day='1900-01-01';assert.throws(()=>validateCorpus(bad),/zoned/);
});
test('named gist nuances, jurisdiction and nonblocking advisories remain source-bounded',()=>{
 const a=n=>c.articles.find(a=>a.id===`nr007-report-${n}`);
 assert.match(a('046').gist,/already/);assert.ok(!/after government/.test(a('046').gist));assert.match(a('010').gist,/otherwise dismissed.*400,000.*A\$10/);assert.match(a('020').gist,/One Skydance executive/);assert.match(a('063').gist,/Relatives and the Workers Circle/);assert.match(a('009').gist,/controlled screen presence/);assert.match(a('031').limitations,/anecdotal/);
 for(const n of ['004','005','006','011','014','022','034','040','045','048','050','060','062','063'])assert.ok(a(n).contentWarning,n);
 for(const a of initial){const s=c.sources.find(s=>s.id===a.sourceId);assert.notEqual(s.jurisdiction,'overseas/see passage');assert.ok(s.jurisdictionBasis);}
 assert.equal(initial.filter(a=>c.sources.find(s=>s.id===a.sourceId).jurisdiction==='Singapore').length,3);
 assert.equal(c.edges.find(e=>e.id==='policy-detector-fairness').type,'contrast');assert.ok(c.retiredEdges.some(e=>e.id==='creativity-confidence'));
});
