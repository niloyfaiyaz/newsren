import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from '../server.mjs';
import {createSubmissionAllowance,syntheticSubmissionState,SUBMISSION_POLICY} from '../lib/submission-allowance.mjs';
import {snapshot,saveSnapshot,readBank,KEY,exportBank} from '../public/lib/storage.mjs';
import {workspace,questionPacket,validateBankRanking} from '../public/lib/question.mjs';
const corpus=JSON.parse(fs.readFileSync(new URL('../public/data/archive.json',import.meta.url)));
function journal(){const dir=path.resolve('artifacts/NR-010/matching-recovery-20261028/synthetic-nonproduction-journals');fs.mkdirSync(dir,{recursive:true});const file=fs.mkdtempSync(dir+'/http-')+'/budget.json';fs.writeFileSync(file,JSON.stringify(syntheticSubmissionState()));return {file,budget:createSubmissionAllowance({syntheticFile:file})};}
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};}
test('synthetic NOT live: trusted shared rank entry -> actual HTTP serializer/parser -> complete whole Bank, reserve before request, no notes/Bank writes',async()=>{
 const {file,budget}=journal(),s=storage();for(const id of ['nr008-zello','nr008-surveillance'])saveSnapshot(s,{...snapshot(corpus,id),notes:'PRIVATE-NOTES-CANARY',unknown:'UNKNOWN-CANARY'});
 const before=s.getItem(KEY),md=exportBank(readBank(s).cards);const q=workspace();q.text='  Is modern technology a benefit or a threat to democracy?\n  ';q.selected=['nr008-zello'];const packet=questionPacket(q,readBank(s).cards,corpus);let calls=0;
 const server=await createServer(undefined,{env:{OPENAI_API_KEY:'SYNTHETIC-NOT-SECRET',OPENAI_MODEL:SUBMISSION_POLICY.model},submissionAllowance:budget,testRankFetch:async(url,opts)=>{
  calls++;assert.equal(url,SUBMISSION_POLICY.endpoint);const d=JSON.parse(fs.readFileSync(file));assert.equal(d.reserved,1);assert.equal(d.records[0].status,'reserved');assert.equal(d.committedMicroUSD,300000);
  const body=JSON.parse(opts.body);assert.equal(body.model,SUBMISSION_POLICY.model);assert.equal(body.service_tier,'default');assert.equal(body.max_output_tokens,8000);assert.equal(body.truncation,'disabled');assert.equal(body.reasoning.effort,'none');assert.equal(body.store,false);assert.equal(body.tools,undefined);assert.equal(body.previous_response_id,undefined);assert.doesNotMatch(body.input,/PRIVATE-NOTES-CANARY|UNKNOWN-CANARY/);
  const p=JSON.parse(body.input).untrustedBank;assert.equal(p.question,q.text);assert.equal(p.cards.length,2);assert.equal(body.text.format.schema.properties.results.minItems,2);assert.equal(body.text.format.schema.properties.results.maxItems,2);assert.deepEqual(body.text.format.schema.properties.results.items.properties.id.enum,p.cards.map(c=>c.id));
  const catalogue=JSON.parse(body.input).untrustedEvidenceReferences;const value={version:'bank-references-1',results:p.cards.map(c=>({id:c.id,disposition:'useful',explanation:'SYNTHETIC NOT live: inspect the reporting.',evidence:'SYNTHETIC retained passage only.',roles:['support','counterargument','qualification','context'],limits:'SYNTHETIC no wider causal conclusion.',context:'SYNTHETIC particular case.',basis:['source-reporting'],anchors:[{ref:catalogue.find(x=>x.cardId===c.id&&x.field==='excerpt').ref}]})),gaps:[]};
  return new Response(JSON.stringify({model:body.model,status:'completed',service_tier:'default',usage:{input_tokens:272000,output_tokens:8000,total_tokens:280000},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{const response=await fetch(origin+'/api/question/rank',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({packet})});assert.equal(response.status,200);const value=await response.json();assert.equal(value.coverage.assessed,2);assert.equal(value.coverage.complete,true);validateBankRanking({version:value.version,results:value.results,gaps:value.gaps},packet);assert.equal(value.version,2);assert.equal(value.results[0].anchors[0].ref,undefined);assert.equal(calls,1);assert.equal(budget.state().estimatedMicroUSD,240000);assert.equal(budget.state().committedMicroUSD,300000);assert.equal(s.getItem(KEY),before);assert.equal(exportBank(readBank(s).cards),md);
 for(const endpoint of ['/api/ask','/api/related','/api/question/chat','/api/feed/refresh']){const r=await fetch(origin+endpoint,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(endpoint.includes('question')||endpoint.includes('feed')?{packet:{}}:{articleId:'nr008-zello',input:'test'})});assert.ok([400,503].includes(r.status));}assert.equal(calls,1);
 }finally{await new Promise(r=>server.close(r));}
});
test('synthetic NOT live: external card uses existing v1 snapshot storage, source excerpt is packet-eligible and never fake current corpus',()=>{const s=storage(),excerpt='SYNTHETIC retrieved selected passage: schools should evaluate educational benefits and risks of AI before choosing classroom policies.';const card={id:'external-synthetic',title:'Synthetic public education source',gist:'Selected excerpt, not a full-article summary.',analysis:'Not assessed.',evidence:[excerpt],limitations:'Selected passage only. Rights not independently confirmed.',themes:['Cross-theme'],folder:'Cross-theme',tags:[],notes:'PRIVATE-EXTERNAL-CANARY',contentVersion:'external-selected-excerpt-v1',savedAt:new Date().toISOString(),eventDate:null,eventDatePrecision:'unknown',connections:[],sources:[{id:'external-synthetic-source',publisher:'gov.uk',url:'https://www.gov.uk/example',publicationDate:null,datePrecision:'unknown',accessLevel:'retrieved public HTML selected excerpt',excerpt,excerptAssurance:'Selected source, not snippet.'}],unknown:{preserve:true}};
 saveSnapshot(s,card);const before=s.getItem(KEY),q=workspace();q.text='Should schools ban AI tools?';const p=questionPacket(q,readBank(s).cards,corpus);assert.equal(p.cards[0].sources[0].excerpt,excerpt);assert.equal(p.cards[0].evidence[0],excerpt);assert.match(p.cards[0].qualification.join(' '),/External retrieved selected excerpt/);assert.doesNotMatch(JSON.stringify(p),/PRIVATE-EXTERNAL-CANARY|Legacy saved context/);assert.deepEqual(readBank(s).cards[0].unknown,{preserve:true});assert.equal(s.getItem(KEY),before);
});
test('SYNTHETIC actual HTTP rejection shape has private validator code and retained valid usage; recoverable charge/old record unchanged',async()=>{
 const {file,budget}=journal(),q=workspace();q.text='PRIVATE-QUESTION-CANARY';const packet=questionPacket(q,[snapshot(corpus,'nr008-zello')],corpus);let calls=0;
 const server=await createServer(undefined,{env:{OPENAI_API_KEY:'SYNTHETIC',OPENAI_MODEL:SUBMISSION_POLICY.model},submissionAllowance:budget,testRankFetch:async()=>{
  calls++;return new Response(JSON.stringify({model:SUBMISSION_POLICY.model,status:'completed',service_tier:'default',usage:{input_tokens:2000,output_tokens:500,total_tokens:2500},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({version:2,results:[],gaps:[],'PRIVATE-KEY-CANARY':'PRIVATE-PROVIDER-PROSE'})}]}]}));
 }});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{const response=await fetch(origin+'/api/question/rank',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({packet})});assert.equal(response.status,503);const value=await response.json();assert.equal(value.error,'invalid-provider-output');assert.equal(value.reason,'bank-reference-shape');assert.equal(value.diagnostics.classification,'application-validation');assert.equal(value.diagnostics.usageRetained,true);assert.doesNotMatch(JSON.stringify(value),/PRIVATE-|nr008|Bearer/);const d=JSON.parse(fs.readFileSync(file));assert.equal(d.records[0].status,'rejected');assert.deepEqual(d.records[0].usage,{input_tokens:2000,output_tokens:500});assert.equal(d.committedMicroUSD,300000);assert.equal(d.estimatedMicroUSD,3750);assert.equal(d.stopped,false);assert.equal(value.diagnostics.recoverable,true);assert.equal(budget.state().reason,null);assert.equal(calls,1);
 }finally{await new Promise(r=>server.close(r));}
});

test('SYNTHETIC HTTP rank classifies known completed malformed JSON/no text/coverage/IDs/anchors versus unknown usage and security; no auto retry',async()=>{
 for(const kind of ['json','no-text','missing','duplicate','unknown','anchor','cross-card','malformed-ref','wire-v2','gist-role','expanded-bytes','all-not-useful','unknown-usage','bad-total','model','tier','tool','incomplete','transport','invalid-envelope']){
  const {file,budget}=journal(),q=workspace();q.text='  SYNTHETIC whole exact question?\n  ';const packet=questionPacket(q,[snapshot(corpus,'nr008-zello'),snapshot(corpus,'nr008-surveillance')],corpus);let calls=0;
  const server=await createServer(undefined,{env:{OPENAI_API_KEY:'SYNTHETIC',OPENAI_MODEL:SUBMISSION_POLICY.model},submissionAllowance:budget,testRankFetch:async(url,opts)=>{
   const catalogue=JSON.parse(JSON.parse(opts.body).input).untrustedEvidenceReferences;
   calls++;if(kind==='transport')throw Error('SYNTHETIC transport failure');if(kind==='invalid-envelope')return new Response('{');
   const v={version:'bank-references-1',results:packet.cards.map(c=>({id:c.id,disposition:'not-useful',explanation:'SYNTHETIC unrelated retained evidence.',evidence:'',roles:[],limits:'SYNTHETIC narrow retained passage only.',context:'SYNTHETIC source context.',basis:['evidence-gap'],anchors:[]})),gaps:[]};
   if(kind==='missing')v.results.pop();if(kind==='duplicate')v.results[1].id=v.results[0].id;if(kind==='unknown')v.results[0].id='PRIVATE-UNKNOWN-ID';
   if(kind==='anchor')Object.assign(v.results[0],{disposition:'useful',evidence:'SYNTHETIC unsupported passage.',roles:['context'],basis:['source-reporting'],anchors:[{ref:'PRIVATE-UNKNOWN-REFERENCE'}]});
   if(['cross-card','malformed-ref','gist-role','expanded-bytes'].includes(kind)){
    Object.assign(v.results[0],{disposition:'useful',evidence:'SYNTHETIC selected passage.',roles:['support'],basis:['source-reporting'],anchors:[{ref:catalogue.find(r=>r.cardId===packet.cards[0].id&&r.field==='excerpt').ref}]});
    if(kind==='cross-card')v.results[0].anchors[0].ref=catalogue.find(r=>r.cardId===packet.cards[1].id).ref;
    if(kind==='malformed-ref')v.results[0].anchors[0].quote='PRIVATE-NO-FALLBACK';
    if(kind==='gist-role')v.results[0].anchors[0].ref=catalogue.find(r=>r.cardId===packet.cards[0].id&&r.field==='gist').ref;
    if(kind==='expanded-bytes'){v.results[0].anchors=Array(4).fill(v.results[0].anchors[0]);v.results[0].explanation='SYNTHETIC '+('x'.repeat(590));}
   }
   if(kind==='wire-v2')v.version=2;
   const d={model:kind==='model'?'wrong':SUBMISSION_POLICY.model,status:kind==='incomplete'?'incomplete':'completed',service_tier:kind==='tier'?'priority':'default',usage:kind==='unknown-usage'?null:{input_tokens:2000,output_tokens:500,total_tokens:kind==='bad-total'?1:2500},output:kind==='no-text'?[]:[{type:'message',content:[{type:'output_text',text:kind==='json'?'PRIVATE-MALFORMED-TEXT':JSON.stringify(v)}]}]};if(kind==='tool')d.output.push({type:'function_call'});return new Response(JSON.stringify(d));
  }});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  try{
   const post=()=>fetch(origin+'/api/question/rank',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({packet})});
   const response=await post(),value=await response.json(),success=kind==='all-not-useful',recoverable=['json','no-text','missing','duplicate','unknown','anchor','cross-card','malformed-ref','wire-v2','gist-role','expanded-bytes'].includes(kind);
   assert.equal(response.status,success?200:503,kind);assert.doesNotMatch(JSON.stringify(value),/PRIVATE-|Bearer/);
   const d=JSON.parse(fs.readFileSync(file));assert.equal(d.reserved,1);assert.equal(d.committedMicroUSD,300000);assert.equal(calls,1);
   assert.equal(d.records[0].status,success?'accepted':recoverable?'rejected':'stopped',kind);assert.equal(d.stopped,!(success||recoverable),kind);
   if(recoverable){const rules={'cross-card':'bank-reference-card','malformed-ref':'bank-reference-shape','wire-v2':'bank-reference-shape','gist-role':'bank-anchor-gist-context','expanded-bytes':'bank-result-bytes'};if(rules[kind])assert.equal(value.reason,rules[kind]);assert.equal(value.diagnostics.recoverable,true);assert.deepEqual(d.records[0].usage,{input_tokens:2000,output_tokens:500});assert.equal(d.estimatedMicroUSD,3750);const restart=createSubmissionAllowance({syntheticFile:file});assert.equal(restart.state().reason,null);const second=await post();assert.equal(second.status,503);assert.equal(calls,2);assert.equal(restart.state().reserved,2);assert.equal(restart.state().committedMicroUSD,600000);assert.deepEqual(JSON.parse(fs.readFileSync(file)).records[0],d.records[0]);}
   else if(!success){assert.equal(budget.state().reason,'live-run-stopped');await post();assert.equal(calls,1);}
   else {assert.equal(value.coverage.useful,0);assert.equal(value.coverage.complete,true);}
  }finally{await new Promise(r=>server.close(r));}
 }
});
