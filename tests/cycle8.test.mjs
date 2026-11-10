import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {extractHTML,collectHTML,fetchSource} from '../lib/retrieval.mjs';
import {validateReply,validateAssessment,packetFor,createAI} from '../lib/ai.mjs';
import {createServer} from '../server.mjs';
const corpus=JSON.parse(fs.readFileSync('public/data/archive.json'));
const articleId='uk-education-guidance',p=packetFor(corpus,articleId);
const reply=text=>({text,citations:[articleId],basis:['evidence-gap']});
const body='On 1 October 2025 UNESCO launched a distinct teacher learning initiative for schools and students, with educational safeguards.';
const html=`<h1>AI education</h1><main><p>${body}</p></main>`;
const sources=[{id:'a',exactVerified:true,retrievedText:'This source discusses the position on artificial intelligence in schools.'},{id:'b',exactVerified:true,retrievedText:body}];
const assessment=(explanation='A thematic comparison only.')=>({supported:true,gap:'',title:'Distinct teacher learning initiative',eventDate:'2025-10-01',type:'shared debate',explanation,uncertainty:'These excerpts do not establish implementation outcomes.',sourceIds:['a','b'],anchors:sources.map(s=>({sourceId:s.id,quote:s.retrievedText}))});
const dir=path.resolve('artifacts/NR-007/cycle-3/integration/test-work/unit-fixtures');let serial=0;
function env(){fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`${serial++}.json`);fs.writeFileSync(file,JSON.stringify({version:1,session:'synthetic-cycle8',limit:12,reserved:0,records:[]}));return {OPENAI_API_KEY:'DUMMY',OPENAI_MODEL:'gpt-5.4-mini-2026-03-17',NEWSREN_AI_REQUEST_LIMIT:'12',NEWSREN_EVAL_SESSION_ID:'synthetic-cycle8',NEWSREN_AI_JOURNAL_PATH:file};}
process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
test('C7-F01 raw script/style less-than, fake markup and comments cannot swallow following substantive body',()=>{
 for(const raw of ['<script>for(i=0;i<n;i++){}</script>','<SCRIPT type="text/javascript">if(a<b){x="<p>fake body</p>";}</SCRIPT>','<style>.x:before{content:"<body>"} /* a < b */</style>','<script><!-- if(a<b) {} --></script>']){
  const result=extractHTML(`<h1>AI education</h1><main>${raw}<p>${body}</p></main>`,'https://gov.uk/a');assert.equal(result.retrievedText,body);assert.doesNotMatch(result.retrievedText,/fake|for\(|content:/);
 }
 assert.throws(()=>extractHTML('<h1>AI</h1><main><script>unclosed <p>'+body,'https://gov.uk/a'),/insufficient-source-text/);
});
test('C7-F02 complete valid assessments accept bounded negated/uncertain causal disclaimers, both endpoint supports still required',()=>{
 for(const text of ['This does not show that A caused B.','This doesn’t establish whether A caused B.','There is no evidence that A led to B.','It is unclear whether A triggered B.','A did not cause B.','A didn’t cause B.','This is not a causal link.']){
  const v=validateAssessment(assessment(text),sources,['a'],['b']);assert.equal(v.type,'shared debate');assert.equal(v.anchors.length,2);assert.ok(v.uncertainty);
 }
 for(const change of [{anchors:[{sourceId:'a',quote:'A fabricated quotation which is not in this source.'},assessment().anchors[1]]},{sourceIds:['a','unknown']},{type:'documented response'},{uncertainty:''}])assert.throws(()=>validateAssessment({...assessment('This does not show that A caused B.'),...change},sources,['a'],['b']));
});
test('C7-F02 positive causation and disclaimer-plus-assertion remain fail-closed in explanation AND uncertainty',()=>{
 for(const text of ['A caused B.','A led to B.','This does not show that A caused B, but A triggered B.','There is no evidence that A caused B; A resulted in B.','Not every event is related. A caused B.','A may have caused B.','A was a causal factor for B.','This does not show that A caused B because C triggered D.','This is not only a debate: A caused B.']){
  assert.throws(()=>validateAssessment(assessment(text),sources,['a'],['b']),e=>e.reason==='relationship-causal',text);
  assert.throws(()=>validateAssessment({...assessment(),uncertainty:text},sources,['a'],['b']),e=>e.reason==='relationship-causal',text);
 }
});
test('C7-F03 common contractions and typographic apostrophes are local honest access disclosures',()=>{
 for(const text of ["I don't have the full text.",'I don’t have the full text.',"I haven't read the full text.",'I haven’t accessed the full text.',"It isn't an exact quote.",'It isn’t an exact quote.',"The source hasn't retrieved the full text.","I can't access the full text.",'I do not have the full-text.','This is not an exact quote.'])assert.equal(validateReply(reply(text),p).text,text);
 for(const text of ['I have the full text.','I read the full-text.','I retrieved full text.','This is an exact quote.','This is a source-asserted connection.','No outcomes are proven, but I have the full text.',"I don't have the full text, but I read the full text.",'This is not only an exact quote.'])assert.throws(()=>validateReply(reply(text),p),e=>e.reason==='reply-access-claim',text);
});
test('C7-F03 paired straight and curly scare quotes never cross boundaries; attributed/long quotes and unknown citations still reject',()=>{
 for(const text of ['The answer is "yes" and a long phrase "no".','The answer is “yes” and a long phrase “no”.','The terms "full text" and “not proven” differ.'])assert.equal(validateReply(reply(text),p).text,text);
 for(const text of ['The source says "yes".','The source reports “yes”.','According to DfE, "yes".','"This is an unsupported long direct quotation".','“This is an unsupported long direct quotation”.'])assert.throws(()=>validateReply(reply(text),p),e=>e.reason==='reply-direct-quote');
 assert.throws(()=>validateReply({...reply('A harmless paraphrase.'),citations:['unknown']},p),e=>e.reason==='citation-unknown');
});
function response(status,type){const r=Readable.from([Buffer.from('DO_NOT_RETAIN_BODY')]);r.statusCode=status;r.headers={'content-type':type};return r;}
test('C7-F04 HTTP status and coarse content class survive native collector -> guarded fetch without raw body/header leakage',async()=>{
 for(const [status,type,kind]of [[403,'text/html; private=DO_NOT_LOG','html'],[429,'text/html','html'],[200,'application/pdf','pdf'],[200,'application/json; secret=DO_NOT_LOG','json'],[200,'application/octet-stream','other'],[200,undefined,'missing']]){
  await assert.rejects(fetchSource('https://gov.uk/a',{lookup:async()=>[{address:'8.8.8.8',family:4}],request:()=>collectHTML(response(status,type))}),e=>{
   const d=e.diagnostics.at(-1);assert.equal(d.httpStatus,status);assert.equal(d.contentTypeClass,kind);assert.doesNotMatch(JSON.stringify(e.diagnostics),/DO_NOT/);return e.message==='source-unavailable';
  });
 }
});
test('C7-F04 unsafe candidate retains only bounded host, no credentials/query/fragment',async()=>{
 const ai=createAI({env:env(),corpus,provider:async()=>({metadata:{status:'completed'},value:{candidateURLs:['https://user:DO_NOT_LOG@evil.test/private?secret=DO_NOT_LOG#DO_NOT_LOG']},search:{completed:true,urls:[]}}),sourceFetcher:()=>assert.fail('no fetch')});
 const r=await ai.discover({articleId});assert.equal(r.status,'gap');assert.equal(r.diagnostics.candidates[0].host,'evil.test');assert.equal(r.diagnostics.candidates[0].url,null);assert.doesNotMatch(JSON.stringify(r),/DO_NOT_LOG|private/);
});
test('C8 injected loopback API: benign Ask succeeds, unsafe Ask rejects, discovery accepts negated causal disclaimer with exact anchors',async()=>{
 const settings=env();let harmful=false;
 const server=await createServer(undefined,{env:settings,sourceFetcher:async url=>({url,finalURL:url,headline:'Distinct teacher initiative',exactVerified:true,retrievedText:url.includes('unesco')?body:sources[0].retrievedText}),provider:async req=>{
  if(req.stage==='ask')return reply(harmful?'I have the full text.':"Evidence gap: I don't have the full text. The answer is \"yes\" and a long phrase \"no\".");
  if(req.stage==='search')return {metadata:{status:'completed'},value:{candidateURLs:['https://www.unesco.org/en/new-initiative']},search:{completed:true,urls:['https://www.unesco.org/en/new-initiative']}};
  const s=req.packet.sourceDocuments;return {...assessment('This does not show that A caused B.'),sourceIds:s.map(s=>s.id),anchors:s.map(s=>({sourceId:s.id,quote:s.retrievedText}))};
 }});
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const post=async(route,data)=>{const r=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
  let r=await post('/api/ask',{articleId,input:'Synthetic harmless check'});assert.equal(r.status,200);assert.equal(r.data.basis[0],'evidence-gap');
  harmful=true;r=await post('/api/ask',{articleId,input:'Synthetic harmful check'});assert.equal(r.status,503);assert.equal(r.data.reason,'reply-access-claim');
  r=await post('/api/related',{articleId});assert.equal(r.status,200);assert.equal(r.data.status,'candidate');assert.equal(r.data.candidate.relationship.type,'shared debate');assert.equal(r.data.candidate.relationship.anchors.length,2);assert.equal(r.data.budget.reserved,4);
 }finally{await new Promise(r=>server.close(r));}
});

test('C8 long source verbatim fails even without quotation punctuation',()=>{
 const text=p.sources[0].retainedExcerpt.text.split(' ').slice(0,20).join(' ');
 assert.throws(()=>validateReply(reply(text),p),e=>e.reason==='reply-direct-quote');
});
