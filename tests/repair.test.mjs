import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {gzipSync,brotliCompressSync,deflateSync} from 'node:zlib';
import {extractHTML,collectHTML,fetchSource,publicIP} from '../lib/retrieval.mjs';
import {validateReply,validateAssessment,datePrecision,existingEvent,packetFor,createAI} from '../lib/ai.mjs';
import {createServer} from '../server.mjs';
const corpus=JSON.parse(fs.readFileSync('public/data/archive.json'));
const html=fs.readFileSync('tests/fixtures/structured-source.html','utf8');
const url='https://www.unesco.org/en/articles/synthetic-repair';
const args={articleId:'uk-education-guidance',input:'Synthetic question'};
const model='gpt-5.4-mini-2026-03-17';
const folder=path.resolve('artifacts/NR-007/cycle-3/integration/test-work/repair-fixtures');let serial=0;
function session(limit=3){fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,`${serial++}.json`);const env={OPENAI_API_KEY:'DUMMY',OPENAI_MODEL:model,NEWSREN_AI_REQUEST_LIMIT:String(limit),NEWSREN_EVAL_SESSION_ID:'synthetic-repair-7',NEWSREN_AI_JOURNAL_PATH:file};fs.writeFileSync(file,JSON.stringify({version:1,session:env.NEWSREN_EVAL_SESSION_ID,limit,reserved:0,records:[]}));return {env,file};}
process.on('exit',()=>fs.rmSync(folder,{recursive:true,force:true}));
function response(bytes,encoding){const r=Readable.from([bytes]);r.statusCode=200;r.headers={'content-type':'text/html','content-encoding':encoding};return r;}
const dns=async()=>[{address:'8.8.8.8',family:4},{address:'2606:4700:4700::1111',family:6}];
const search={value:{candidateURLs:[url]},metadata:{status:'completed'},search:{completed:true,urls:[url]}};
function docs(){return [{id:'anchor',exactVerified:true,retrievedText:'This document discusses artificial intelligence in schools and education.'},{id:'new',exactVerified:true,retrievedText:'In October 2025 UNESCO launched a distinct teacher education initiative.'}];}
function assessed(sources=docs()){return {supported:true,gap:'',title:'Distinct teacher initiative',eventDate:'2025-10',type:'shared debate',explanation:'A thematic comparison, not a causal claim.',uncertainty:'Support limited to these excerpts.',sourceIds:sources.map(s=>s.id),anchors:sources.map(s=>({sourceId:s.id,quote:s.retrievedText.slice(0,280)}))};}
test('F02 proved synthetic old extractor truncates main at teaser; repaired structural div and relevance selection',async()=>{
 const oldText=fs.readFileSync('tests/fixtures/retrieval-before-repair.mjs','utf8');
 const old=await import('data:text/javascript;base64,'+Buffer.from(oldText).toString('base64'));
 const before=old.extractHTML(html,url);assert.match(before.retrievedText,/Subscribe/);assert.doesNotMatch(before.retrievedText,/misclassify/);
 const result=extractHTML(html,url);assert.match(result.retrievedText,/misclassify/);assert.match(result.retrievedText,/1 Oct 2025/);assert.doesNotMatch(result.retrievedText,/subscribe|Added information|navigation/i);assert.ok(result.retrievedText.length<=1800);
 const encoded=gzipSync(html);assert.notEqual((await old.collectHTML(response(encoded,'gzip'))).html,html);
});
test('F02 gzip/brotli/deflate decode, both byte bounds, unsupported/corrupt encodings',async()=>{
 for(const [encoding,encode] of [['gzip',gzipSync],['br',brotliCompressSync],['deflate',deflateSync]]){const r=await collectHTML(response(encode(html),encoding));assert.equal(r.html,html);assert.equal(r.decodedBytes,Buffer.byteLength(html));assert.match(extractHTML(r.html,url).retrievedText,/misclassify/);await assert.rejects(collectHTML(response(encode('a'.repeat(600001)),encoding)),/source-too-large/);}
 await assert.rejects(collectHTML(response(Buffer.alloc(600001),'identity')),/source-too-large/);
 await assert.rejects(collectHTML(response(Buffer.from('x'),'zstd')),/source-encoding/);
 await assert.rejects(collectHTML(response(Buffer.from('not gzip'),'gzip')),/source-decode/);
});
test('F02 mixed public A/AAAA uses pinned A subset; ANY private/ambiguous address rejects; redirects revalidate',async()=>{
 let calls=0;const result=await fetchSource(url,{lookup:dns,request:async(u,addresses)=>{calls++;assert.ok(addresses.every(a=>a.family===4));return {html};}});assert.equal(calls,1);assert.equal(result.diagnostics[0].publicAAAA,1);
 for(const bad of ['::1','fc00::2','fe80::1','::ffff:8.8.8.8','2001:db8::1','2002:808:808::','garbage','192.168.1.2']){calls=0;await assert.rejects(fetchSource(url,{lookup:async()=>[...(await dns()),{address:bad,family:bad.includes(':')?6:4}],request:async()=>{calls++;return {html};}}),/unsafe-source/);assert.equal(calls,0);}
 assert.equal(publicIP('198.51.99.1'),true);assert.equal(publicIP('198.51.100.1'),false);assert.equal(publicIP('203.0.114.1'),true);assert.equal(publicIP('203.0.113.1'),false);
 await assert.rejects(fetchSource(url,{lookup:async()=>[(await dns())[1]],request:async()=>{throw Error('not called');}}),/source-no-public-ipv4/);
 await assert.rejects(fetchSource(url,{lookup:dns,request:async()=>({redirect:undefined})}),e=>e.message==='source-redirect-missing'&&e.stage==='redirect');
 const r=response(Buffer.from(''),'identity');r.statusCode=302;await assert.rejects(collectHTML(r),/source-redirect-missing/);
});
test('F03 supported day abbreviations/month/year retain precision; publication-only, unknown, wrong date/quote typed gaps',()=>{
 for(const [date,text,precision]of [['2025-10-01','On 1 Oct 2025 UNESCO launched a teacher education initiative.','day'],['2025-10','In October 2025 UNESCO launched a teacher education initiative.','month'],['2025','In 2025 UNESCO launched a teacher education initiative.','year']]){const s=docs();s[1].retrievedText=text;const v={...assessed(s),eventDate:date};const r=validateAssessment(v,s,['anchor'],['new']);assert.equal(r.eventDate,date);assert.equal(r.eventDatePrecision,precision);}
 for(const date of ['','2025-02-30','2025-13','2025-10-01']){const s=docs();assert.throws(()=>validateAssessment({...assessed(s),eventDate:date},s,['anchor'],['new']),e=>e.supportGap&&/^event-date-/.test(e.reason));}
 const s=docs();s[1].publicationDate='2025-10-01';s[1].retrievedText='Published on 1 October 2025. The education initiative supports teachers.';assert.throws(()=>validateAssessment({...assessed(s),eventDate:'2025-10-01'},s,['anchor'],['new']),e=>e.reason==='event-date-not-supported');
 const v=assessed();v.anchors[0].quote='This fabricated quotation is not in the retrieved source.';assert.throws(()=>validateAssessment(v,docs(),['anchor'],['new']),e=>e.reason==='quote-not-supported'&&e.supportGap);
 assert.equal(datePrecision('2025-10'),'month');assert.equal(datePrecision('unknown'),null);
});
test('F04 benign quotes/disclosures and duplicate IDs accepted; explicit citation/schema/quote/access reasons retained',()=>{
 const p=packetFor(corpus,args.articleId),base={text:'Evidence gap: available excerpts do not include the full text. “Learning” is not the same as scores.',citations:[args.articleId,args.articleId],basis:['evidence-gap','Newsren-inference']};
 assert.equal(validateReply(base,p).citations.length,1);assert.ok(validateReply({...base,text:'This is not an exact quote. The excerpt does not include full text.'},p));
 assert.deepEqual(validateReply({text:'Evidence gap: no supporting source is available.',citations:[],basis:['evidence-gap']},p).citations,[]);
 for(const [change,reason]of [[{citations:['unknown']},'citation-unknown'],[{citations:[]},'citation-missing'],[{basis:['fake']},'reply-basis'],[{text:'The source says “Students always learn more with AI”.'},'reply-direct-quote'],[{text:'I have the full text and this is an exact quote.'},'reply-access-claim']])assert.throws(()=>validateReply({...base,...change},p),e=>e.reason===reason);
});
test('F01/F04 journal provider completed versus app rejected/accepted and HTTP fixed reason, no raw outputs',async()=>{
 const {env,file}=session();let calls=0;
 const ai=createAI({env,corpus,provider:async()=>{calls++;return {value:{text:'Synthetic secret marker not to retain',citations:['unknown'],basis:['source-reporting']},metadata:{status:'completed',model:'dummy'}};}});
 await assert.rejects(ai.ask(args),e=>e.reason==='citation-unknown'&&e.diagnostics.applicationStatus==='rejected');
 const record=JSON.parse(fs.readFileSync(file)).records[0];assert.equal(record.providerStatus,'completed');assert.equal(record.applicationStatus,'rejected');assert.equal(record.reason,'citation-unknown');assert.doesNotMatch(fs.readFileSync(file,'utf8'),/secret marker/);assert.equal(calls,1);
 const separate=session(2);const server=await createServer(undefined,{env:separate.env,provider:async()=>({text:'x',citations:['unknown'],basis:['source-reporting']})});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{const r=await fetch(origin+'/api/ask',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(args)});const d=await r.json();assert.equal(r.status,503);assert.equal(d.reason,'citation-unknown');assert.equal(d.diagnostics.providerStatus,'completed');}finally{await new Promise(r=>server.close(r));}
});
test('F01 all gaps include bounded filter and per-fetch reason/host without exception text',async()=>{
 const {env}=session();const ai=createAI({env,corpus,provider:async()=>({...search,value:{candidateURLs:[url+'?private=DO_NOT_LOG','https://evil.test/?secret=NO']},search:{completed:true,urls:[url]}}),sourceFetcher:async()=>{throw Error('arbitrary exception DO_NOT_LOG');}});
 const r=await ai.discover({articleId:args.articleId});assert.equal(r.status,'gap');assert.equal(r.diagnostics.candidates.length,2);assert.equal(r.diagnostics.candidates[1].reason,'unsafe-url');assert.equal(r.diagnostics.fetches[0].reason,'source-network');assert.equal(r.diagnostics.fetches[0].host,'www.unesco.org');assert.doesNotMatch(JSON.stringify(r),/DO_NOT_LOG|secret=NO|arbitrary exception/);
});
test('F03 discover unsupported exact support returns typed gap, completion separate from acceptance',async()=>{
 const {env,file}=session();const ai=createAI({env,corpus,sourceFetcher:async u=>({...extractHTML(html,u),finalURL:u}),provider:async p=>{if(p.stage==='search')return search;const sources=p.packet.sourceDocuments;return {...assessed(sources),eventDate:''};}});
 const r=await ai.discover({articleId:args.articleId});assert.equal(r.status,'gap');assert.equal(r.reason,'event-date-unknown');const records=JSON.parse(fs.readFileSync(file)).records;assert.equal(records[1].applicationStatus,'rejected');assert.equal(records[1].reason,'event-date-unknown');
});
test('F06 alternate coverage associated with known dated synthetic event; different dated development not collapsed',()=>{
 const corpus=structuredClone(JSON.parse(fs.readFileSync(new URL('../public/data/archive.json',import.meta.url))));
 for(const e of corpus.events){const a=corpus.articles.find(a=>a.eventId===e.id);e.date=corpus.sources.find(s=>s.id===a.sourceId).publicationDate;} // explicit dated fixture, not production occurrence claim
 for(const [title,eventDate,expected]of [['UK DfE position: education guidance about generative AI','2023-03-29','uk-education-guidance'],['Non-native English writers face biased AI detectors','2023-05-15','detector-bias'],['UNESCO issues guidance on generative AI','2023-09-07','unesco-guidance'],['OpenAI Study Mode: a different perspective','2025-07-29','study-mode']])assert.equal(existingEvent(corpus,{title,eventDate},{headline:title}),expected);
 assert.equal(existingEvent(corpus,{title:'DfE guidance announces new evaluation programme',eventDate:'2025-10-01'},{headline:'New school evaluation programme'}),null);
 assert.equal(existingEvent(corpus,{title:'AI education initiative',eventDate:'2023-03-29'},{headline:'Separate research on students'}),null);
});
test('F09 insufficient two-stage allowance invokes no provider; same journal restart remains consumed',async()=>{
 const {env,file}=session(2);const ai=createAI({env,corpus,provider:async()=>({text:'Evidence gap: no evidence.',citations:[],basis:['evidence-gap']})});await ai.ask(args);let calls=0;const restarted=createAI({env,corpus,provider:async()=>calls++});assert.equal(restarted.health().budget.remaining,1);await assert.rejects(restarted.discover({articleId:args.articleId}),/insufficient-discovery-budget/);assert.equal(calls,0);assert.equal(JSON.parse(fs.readFileSync(file)).reserved,1);
});
test('F06 discovery alternate perspective returns inspectable existing-event coverage, not candidate',async()=>{
 const {env}=session();const ai=createAI({env,corpus,sourceFetcher:async u=>({url:u,finalURL:u,headline:u===url?'UK DfE position: education guidance about generative AI':'Anchor',exactVerified:true,retrievedText:u===url?'On 29 March 2023 the UK DfE announced its position and guidance on artificial intelligence in education.':'The guidance sets out the position on artificial intelligence in schools.'}),provider:async p=>p.stage==='search'?search:{...assessed(p.packet.sourceDocuments),title:'DfE education guidance: another perspective',eventDate:'2023-03-29'}});
 const r=await ai.discover({articleId:args.articleId});assert.equal(r.status,'coverage');assert.equal(r.eventId,'uk-education-guidance');assert.equal(r.sources.length,2);assert.equal(r.candidate,undefined);
});
test('F04 metadata record failure after completed provider is fail-closed, bounded, no second record attempt/refill',async()=>{
 const {env,file}=session();let calls=0;const ai=createAI({env,corpus,provider:async()=>{calls++;fs.writeFileSync(file+'.lock','TEST OWNED collision');return {value:{text:'Evidence gap: insufficient evidence.',basis:['evidence-gap'],citations:[]},metadata:{status:'completed'}};}});
 try{await assert.rejects(ai.ask(args),e=>e.message==='budget-unavailable'&&e.diagnostics.reason==='record-failed'&&e.diagnostics.providerStatus==='completed');assert.equal(calls,1);assert.equal(JSON.parse(fs.readFileSync(file)).reserved,1);assert.equal(ai.health().reason,'budget-unavailable');}finally{fs.unlinkSync(file+'.lock');}
});
test('F02 date metadata preserves precision and heading/changelog text is excluded',()=>{
 for(const [value,precision]of [['2025','year'],['2025-10','month'],['2025-10-01','day']]){const result=extractHTML(html.replace('<title>',`<meta property="article:published_time" content="${value}"><title>`),url);assert.equal(result.publicationDate,value);assert.equal(result.publicationDatePrecision,precision);assert.doesNotMatch(result.retrievedText,/AI detectors and student fairness\n/);}
});

test('F03 day support is not a substring of another day',()=>{
 const s=docs();s[1].retrievedText='On 11 October 2025 UNESCO launched a teacher education initiative.';
 assert.throws(()=>validateAssessment({...assessed(s),eventDate:'2025-10-01'},s,['anchor'],['new']),e=>e.reason==='event-date-not-supported');
});

test('F01 assessment provider errors preserve preceding candidate/filter/final-host diagnostics',async()=>{
 const {env}=session();const ai=createAI({env,corpus,sourceFetcher:async u=>({...extractHTML(html,u),finalURL:u}),provider:async p=>{if(p.stage==='search')return search;const e=Error('provider-incomplete');e.metadata={status:'incomplete'};throw e;}});
 await assert.rejects(ai.discover({articleId:args.articleId}),e=>e.diagnostics.fetches.length===2&&e.diagnostics.candidates[0].reason==='selected'&&e.diagnostics.failure.providerStatus==='incomplete');
});
