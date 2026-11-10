import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {extractHTML} from '../lib/retrieval.mjs';
import {validateAssessment,validateReply,packetFor,declaredGap,createAI} from '../lib/ai.mjs';
import {createServer} from '../server.mjs';
const corpus=JSON.parse(fs.readFileSync('public/data/archive.json'));
const articleId='uk-education-guidance';
const anchor='This source discusses the position on artificial intelligence in schools.';
const summit='The AI + Education Summit convenes researchers and educators to discuss learning, fairness, trust and educational opportunity.';
const when='Wednesday, February 11, 2026 8:00 AM - 5:00 PM PST/PDT';
const listing=()=>extractHTML(`<h1>AI+Education Summit 2026</h1><header><div>${when}</div></header><main><p>${summit}</p></main><aside><div>November 4, 2026 8:00 AM - 5:00 PM</div></aside>`,'https://hai.stanford.edu/events/ai-education-summit-2026');
const docs=news=>[{id:'a',exactVerified:true,retrievedText:anchor},{...news,id:'b'}];
const assessment=(s,overrides={})=>({supported:true,gap:'',title:'Scheduled AI education summit',eventDate:'2026-02-11',type:'shared debate',explanation:'A comparison with a scheduled discussion, not implementation evidence.',uncertainty:'This does not imply causation.',sourceIds:['a','b'],anchors:[{sourceId:'a',quote:anchor},{sourceId:'b',quote:s.retrievedText}],...overrides});
const validate=(s,o={})=>validateAssessment(assessment(s,o),docs(s),['a'],['b']);
function settings(){const dir=fs.mkdtempSync(path.resolve('artifacts/NR-007/cycle-3/integration/test-work/dummy-'));const file=path.join(dir,'budget.json');fs.writeFileSync(file,JSON.stringify({version:1,session:'cycle9-dummy',limit:12,reserved:0,records:[]}));return {dir,env:{OPENAI_API_KEY:'DUMMY',OPENAI_MODEL:'gpt-5.4-mini-2026-03-17',NEWSREN_AI_REQUEST_LIMIT:'12',NEWSREN_EVAL_SESSION_ID:'cycle9-dummy',NEWSREN_AI_JOURNAL_PATH:file}};}
test('C9 exact event date/time hero survives separate extraction; never quote synthetic combined title/date',()=>{
 const s=listing();assert.equal(s.publicationDate,null);assert.equal(s.eventDate,null);assert.equal(s.eventDateContext.length,1);assert.equal(s.eventDateContext[0].text,when);assert.equal(s.eventDateContext[0].role,'event-listing-schedule');assert.ok(!s.retrievedText.includes(when));
 const v=validate(s);assert.equal(v.eventDatePrecision,'day');assert.equal(v.eventStatus,'scheduled');
 const changed=assessment(s);changed.anchors[1].quote='AI+Education Summit 2026 '+when;assert.throws(()=>validateAssessment(changed,docs(s),['a'],['b']),e=>e.reason==='quote-not-supported');
});
test('C9 listing metadata never proves completion even after scheduled date; scheduled labeling mandatory',()=>{
 const s=listing();
 for(const changes of [{title:'AI summit',explanation:'The meeting was held on February 11.'},{explanation:'Scheduled summit: the meeting took place.'},{explanation:'The planned meeting occurred.'},{explanation:'The scheduled summit convened researchers.'},{explanation:'The scheduled event launched in February.'},{title:'AI summit',explanation:'The meeting discusses learning.'}])assert.throws(()=>validate(s,changes),e=>e.reason==='scheduled-event-not-established');
 assert.equal(validate(s,{explanation:'The scheduled summit will be held in February.'}).eventStatus,'scheduled');
 assert.equal(validate(s,{eventDate:'2026-02'}).eventDatePrecision,'month');assert.equal(validate(s,{eventDate:'2026'}).eventDatePrecision,'year');
 for(const date of ['2026-02-12','2026-03','2025','2026-02-30'])assert.throws(()=>validate(s,{eventDate:date}),e=>e.supportGap===true);
});
test('C9 UNESCO separate year-bearing scheduled passage permits year only, not guessed September/day or publication-derived year',()=>{
 const text="Digital Learning Week 2026, UNESCO's annual flagship event on emerging technologies and the future of education, will gather over 1,000 participants in Paris.";
 const s=extractHTML(`<h1>Digital Learning Week</h1><meta property="article:published_time" content="2026-08-25"><main><p>From 8 to 11 September, UNESCO will bring together ministers of education to discuss artificial intelligence.</p><p>${text}</p></main>`,'https://unesco.org/en/articles/week');
 const v=validate(s,{eventDate:'2026',anchors:[{sourceId:'a',quote:anchor},{sourceId:'b',quote:text}]});assert.equal(v.eventDatePrecision,'year');assert.equal(v.eventStatus,'scheduled');
 for(const eventDate of ['2026-09','2026-09-08'])assert.throws(()=>validate(s,{eventDate,anchors:[{sourceId:'a',quote:anchor},{sourceId:'b',quote:text}]}),e=>e.reason==='event-date-not-supported');
 const noYear={...s,retrievedText:s.retrievedText.replace(/2026/g,''),eventDateContext:[]};assert.throws(()=>validate(noYear,{eventDate:'2026'}),e=>e.reason==='event-date-not-supported');
});
test('C9 publication metadata, related event dates, wrong-heading/unverified contexts cannot supply date support',()=>{
 const s=extractHTML(`<h1>AI+Education Summit</h1><meta property="article:published_time" content="2026-02-11"><main><p>${summit}</p><h2>Related events</h2><div>${when}</div></main>`,'https://hai.stanford.edu/events/ai-education-summit');
 assert.deepEqual(s.eventDateContext,[]);assert.throws(()=>validate(s),e=>e.reason==='event-date-not-supported');
 for(const patch of [{exactVerified:false},{heading:'Different event'}])assert.throws(()=>validate({...s,eventDateContext:[{...listing().eventDateContext[0],...patch}]}),e=>e.reason==='event-date-not-supported');
});
test('C9 exact two endpoints, shared-debate/contrast, uncertainty and past occurrence evidence unchanged',()=>{
 const s={headline:'Education initiative',exactVerified:true,retrievedText:'On 1 October 2025 UNESCO launched a distinct learning initiative for schools and students.'};
 assert.equal(validate(s,{eventDate:'2025-10-01'}).eventStatus,'occurred');
 const unknown={...s,retrievedText:'An education launch in 2025 involves schools and teachers discussing how artificial intelligence supports learning.'};assert.throws(()=>validate(unknown,{eventDate:'2025'}),e=>e.reason==='event-status-unknown');
 for(const changes of [{sourceIds:['a','unknown']},{anchors:[{sourceId:'b',quote:s.retrievedText}]},{type:'documented response'},{uncertainty:''},{explanation:'A caused B.'}])assert.throws(()=>validate(s,{eventDate:'2025-10-01',...changes}));
});
test('C8-F01/F02 common honest hedges pass, harmful counterparts in either assessment field and Ask still reject',()=>{
 const s=listing();for(const text of ['This does not imply causation.','This does not prove causation.','This does not establish causation.','Without implying causation.'])for(const field of ['explanation','uncertainty'])assert.ok(validate(s,{[field]:field==='explanation'?'Scheduled comparison. '+text:text}));
 for(const text of ['This does not imply causation, but A caused B.','This does not prove causation; A triggered B.','Without implying causation, A led to B.'])for(const field of ['explanation','uncertainty'])assert.throws(()=>validate(s,{[field]:text}),e=>e.reason==='relationship-causal');
 const p=packetFor(corpus,articleId),r=text=>({text,citations:[articleId],basis:['evidence-gap']});
 for(const text of ['I cannot provide an exact quote.','This does not include an exact quote.','I do not currently have the full text.'])assert.equal(validateReply(r(text),p).text,text);
 for(const text of ['I can provide an exact quote.','This includes an exact quote.','I currently have the full text.','I cannot provide an exact quote, but I read the full text.','I do not currently have the full text, but this is an exact quote.'])assert.throws(()=>validateReply(r(text),p),e=>e.reason==='reply-access-claim');
});
test('C9 bounded provider-declared gap sanitization is labelled untrusted; no full output retained',()=>{
 const d=declaredGap('<script>untrusted</script> https://x.test/?secret=123 sk-EXAMPLE123456 password=EXAMPLE person@example.test\n'+'x'.repeat(3000));assert.ok(d.text.length<=600);assert.ok(d.truncated);assert.match(d.provenance,/untrusted/);assert.doesNotMatch(d.text,/https:|sk-EXAMPLE|password=|@|<script>/);
});
test('C9 injected HTTP unsupported assessment retains original selected evidence, fixed reason, sanitized provider gap, two synthetic reservations',async()=>{
 const {dir,env}=settings();const server=await createServer(undefined,{env,sourceFetcher:async url=>({...listing(),url,finalURL:url,retrievedText:url.includes('unesco')?summit:anchor,diagnostics:[{stage:'response',sha256:'a'.repeat(64)}]}),provider:async req=>req.stage==='search'?{metadata:{status:'completed'},value:{candidateURLs:['https://unesco.org/en/new-event']},search:{completed:true,urls:['https://unesco.org/en/new-event']}}:{metadata:{status:'completed'},value:{supported:false,gap:'Date context is insufficient; this is the provider opinion. https://x.test sk-FAKEVALUE',title:'',eventDate:'',type:'',explanation:'',uncertainty:'',sourceIds:[],anchors:[]}}});
 try{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const response=await fetch(origin+'/api/related',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({articleId})});const r=await response.json();assert.equal(response.status,200);assert.equal(r.reason,'unsupported-assessment');assert.equal(r.diagnostics.assessment.reason,'unsupported-assessment');assert.equal(r.diagnostics.assessment.providerStatus,'completed');assert.match(r.diagnostics.assessment.providerDeclaredGap.text,/provider opinion/);assert.doesNotMatch(JSON.stringify(r),/sk-FAKEVALUE|https:\/\/x.test/);assert.equal(r.diagnostics.sourceDocuments.length,2);const d=r.diagnostics.sourceDocuments[1];assert.equal(d.selectedExcerpt,summit);assert.equal(d.selectedExcerptSHA256,createHash('sha256').update(summit).digest('hex'));assert.equal(d.responseSHA256,'a'.repeat(64));assert.equal(d.eventDateContext[0].text,when);assert.equal(r.budget.reserved,2);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('C9 assessment validation gap retains provider gap and source audit too',async()=>{
 const {dir,env}=settings();const ai=createAI({env,corpus,sourceFetcher:async url=>({...listing(),url,finalURL:url,retrievedText:url.includes('unesco')?summit:anchor}),provider:async req=>{
 if(req.stage==='search')return {metadata:{status:'completed'},value:{candidateURLs:['https://unesco.org/en/new-event']},search:{completed:true,urls:['https://unesco.org/en/new-event']}};
 const s=req.packet.sourceDocuments;return {metadata:{status:'completed'},value:{...assessment(listing(),{eventDate:'2026-02-12',gap:'Model thought this date was sufficient.'}),sourceIds:s.map(x=>x.id),anchors:s.map(x=>({sourceId:x.id,quote:x.retrievedText}))}};
 }});try{const r=await ai.discover({articleId});assert.equal(r.status,'gap');assert.equal(r.reason,'event-date-not-supported');assert.equal(r.diagnostics.assessment.applicationStatus,'rejected');assert.match(r.diagnostics.assessment.providerDeclaredGap.text,/Model thought/);assert.equal(r.diagnostics.sourceDocuments.length,2);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('C9 successful scheduled candidate keeps precision/status/context in subsequent bounded Ask packet',async()=>{
 const {dir,env}=settings();let packet;
 const ai=createAI({env,corpus,sourceFetcher:async url=>({...listing(),url,finalURL:url,retrievedText:url.includes('unesco')?summit:anchor}),provider:async req=>{
  if(req.stage==='search')return {metadata:{status:'completed'},value:{candidateURLs:['https://unesco.org/en/new-event']},search:{completed:true,urls:['https://unesco.org/en/new-event']}};
  if(req.stage==='ask'){packet=req.packet;return {text:'Evidence gap: this listing does not establish occurrence.',citations:[],basis:['evidence-gap']};}
  const sources=req.packet.sourceDocuments;return {metadata:{status:'completed'},value:{...assessment(listing()),sourceIds:sources.map(s=>s.id),anchors:sources.map(s=>({sourceId:s.id,quote:s.retrievedText}))}};
 }});
 try{const r=await ai.discover({articleId});assert.equal(r.status,'candidate');assert.equal(r.candidate.eventStatus,'scheduled');assert.equal(r.candidate.eventDatePrecision,'day');assert.equal(r.candidate.relationship.anchors.length,2);assert.equal(r.diagnostics.assessment.applicationStatus,'accepted');await ai.ask({articleId,input:'Synthetic follow-up',candidateId:r.candidate.id});assert.equal(packet.InferredRelationships.at(-1).eventStatus,'scheduled');assert.equal(packet.InferredRelationships.at(-1).eventDate,'2026-02-11');assert.equal(packet.sources.at(-1).eventDateContext[0].text,when);
 for(const text of ['The scheduled summit happened in February.','The summit was held.','The scheduled statement was adopted.'])assert.throws(()=>validateReply({text,citations:[],basis:['evidence-gap']},packet),e=>e.reason==='reply-scheduled-event');
 assert.ok(validateReply({text:'Evidence gap: a scheduled summit will be held; occurrence is not established.',citations:[],basis:['evidence-gap']},packet));assert.equal(ai.health().budget.reserved,3);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('C9 retained actual public date fragments work on final extractor in minimal fixture (NOT a full-page rerun)',()=>{
 const e=JSON.parse(fs.readFileSync('tests/fixtures/public-event-context.json')).evidence.find(e=>e.url.includes('stanford'));
 const title=e.fragments.find(f=>f.startsWith('<h1')),date=e.fragments.find(f=>f.includes('Wednesday, February 11, 2026'));
 assert.ok(title&&date);const s=extractHTML(title+date+'<main><p>'+summit+'</p></main>',e.url);assert.equal(s.eventDateContext[0].text,when);assert.equal(validate(s).eventStatus,'scheduled');
});
