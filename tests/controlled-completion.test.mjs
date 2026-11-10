// Entirely SYNTHETIC. No real journal, environment, browser, source or provider access.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createSubmissionAllowance,syntheticSubmissionState,reviewedBuildHash,SUBMISSION_POLICY} from '../lib/submission-allowance.mjs';
import {createControlledDispatch,provisionControlledOwner,grantControlledAction,digest} from '../lib/controlled-dispatch.mjs';
import {createServer} from '../server.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const parent=path.resolve('artifacts/NR-010/matching-recovery-20261028/synthetic-nonproduction-journals');
const packet={version:2,question:'  SYNTHETIC exact whole question?\n ',cards:[{id:'synthetic-root',title:'Synthetic retained source',gist:'A synthetic contextual account.',evidence:['A synthetic contextual account.'],limitations:'No broader conclusion.',contentVersion:'synthetic-v1',eventDate:null,eventDatePrecision:'unknown',qualification:[],sources:[]}]};
const build=reviewedBuildHash();
function setup(){
 fs.mkdirSync(parent,{recursive:true});const base=fs.mkdtempSync(parent+'/controlled-'),file=base+'/budget.json',dir=base+'/control';
 const d=syntheticSubmissionState();d.version=3;d.reserved=7;d.committedMicroUSD=2100000;d.estimatedMicroUSD=28921;d.stopped=true;
 d.records=['stopped','accepted','stopped','rejected','accepted','accepted','stopped'].map((status,index)=>({index,stage:'question-rank',reservedAt:'2026-01-01T00:00:00.000Z',reservedMicroUSD:300000,status,usage:[0,6].includes(index)?null:{input_tokens:index===5?38561:0,output_tokens:0},estimatedMicroUSD:[0,6].includes(index)?null:index===5?28921:0}));
 d.recoveries=[{index:0,recoveredAt:'2026-01-01T00:00:01Z',previousLedgerSHA256:'1'.repeat(64),recordSHA256:sha(JSON.stringify(d.records[0])),reviewedBuildSHA256:'2'.repeat(64),reviewReference:'NR-011-cycle-2-synthetic.md',reviewSHA256:'3'.repeat(64),approval:SUBMISSION_POLICY.approval,parentDecision:'NR011-reviewed-material-fix-zero-credit-continuation',evidenceSHA256:'4'.repeat(64),countDelta:0,moneyDelta:0}];
 d.recoveries.push({index:2,recoveredAt:'2026-01-01T00:00:02Z',previousLedgerSHA256:'5'.repeat(64),recordSHA256:sha(JSON.stringify(d.records[2])),recordsSHA256:sha(JSON.stringify(d.records.slice(0,3))),firstAuditSHA256:sha(JSON.stringify(d.recoveries[0])),reviewedBuildSHA256:'6'.repeat(64),reviewReference:'NR-010-matching-recovery-20261028-synthetic.md',reviewSHA256:'7'.repeat(64),approval:'NR010-NR011-completion-user-2026-10-28',parentDecision:'NR010-NR011-reviewed-completion-zero-credit-continuation',evidenceSHA256:'8'.repeat(64),countDelta:0,moneyDelta:0});
 fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n');const before=fs.readFileSync(file);
 const evidence=JSON.stringify({synthetic:true,unknownHistoricalOutcome:'UNKNOWN/full holds retained'});fs.writeFileSync(base+'/reconciliation.json',evidence);
 const reviewReference='NR-010-controlled-continuation-20261029-synthetic.md',review='SYNTHETIC review binding, not production authority';fs.writeFileSync(base+'/'+reviewReference,review);
 const proof=JSON.stringify({activeNativeAgents:0,ledgerSHA256:sha(before),observedAt:new Date().toISOString(),port3001Listening:false,previewProcessesAbsent:true,reviewedBuildSHA256:build});fs.writeFileSync(base+'/no-active-proof.json',proof);
 const options={expectedLedgerSHA256:sha(before),reviewedBuildSHA256:build,reviewReference,reviewSHA256:sha(review),approval:'NR010-NR011-controlled-completion-user-2026-10-29',parentDecision:'NR010-NR011-reviewed-controlled-zero-credit-continuation',evidenceSHA256:sha(evidence),noActiveProofSHA256:sha(proof)};
 const budget=()=>createSubmissionAllowance({syntheticFile:file});
 return {base,file,dir,d,before,options,budget};
}
function owner(s){provisionControlledOwner({dir:s.dir,synthetic:true,reviewedBuildSHA256:build});const c=createControlledDispatch({dir:s.dir,synthetic:true,buildHash:build,auditSecrets:['SYNTHETIC-CREDENTIAL-CANARY']});c.acquire();return c;}
function grant(s,id='synthetic-request',p=packet){return grantControlledAction({dir:s.dir,synthetic:true,requestID:id,initiatingAction:'ordinary-question-submit',packet:p,expiresAt:new Date(Date.now()+60000).toISOString(),parentAuthorisation:'explicit-synthetic-parent'});}
const contents=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?contents(path.join(dir,e.name)):e.name.endsWith('.json')?[fs.readFileSync(path.join(dir,e.name),'utf8')]:[]).join('\n');

test('SYNTHETIC exact V3 -> V4 is zero money/count; every record/audit/policy preserved; missing gate fails closed; one-shot and old methods ineligible',()=>{
 const s=setup();assert.equal(s.budget().state().reason,'live-run-stopped');s.budget().reviewedControlledRecovery(s.options);const d=JSON.parse(fs.readFileSync(s.file));
 for(const k of ['records','policy','reserved','committedMicroUSD','estimatedMicroUSD'])assert.deepEqual(d[k],s.d[k]);assert.deepEqual(d.recoveries.slice(0,2),s.d.recoveries);assert.equal(d.recoveries.length,3);assert.equal(d.recoveries[2].moneyDelta,0);assert.equal(d.recoveries[2].countDelta,0);assert.equal(d.records[6].usage,null);assert.equal(d.records[6].status,'stopped');assert.equal(d.version,4);
 assert.equal(s.budget().state().reason,'dispatch-paused');assert.throws(()=>s.budget().reserve());assert.throws(()=>s.budget().reviewedControlledRecovery(s.options));assert.throws(()=>s.budget().reviewedCompletionRecovery(s.options));assert.throws(()=>s.budget().reviewedRecovery(s.options));
 const c=owner(s);try{const b=createSubmissionAllowance({syntheticFile:s.file,dispatchControl:c});assert.equal(b.state().reason,null);assert.throws(()=>b.reserve(),/dispatch-paused/);for(let i=0;i<3;i++){grant(s,'quota-'+i);c.begin(packet);const n=b.reserve();c.reserved(n);b.record(n,{accepted:true,usage:{input_tokens:272000,output_tokens:8000}});c.settle({outcome:'accepted',safeToContinue:true});}assert.equal(b.state().reason,'quota-exhausted');assert.equal(b.state().committedMicroUSD,3000000);assert.equal(b.state().reserved,10);assert.equal(b.state().remaining,20);assert.throws(()=>b.reserve());assert.deepEqual(JSON.parse(fs.readFileSync(s.file)).records.slice(0,7),s.d.records);}finally{c.close();}
});
test('SYNTHETIC wrong ledger/evidence/review/build/approval/decision/proof/state and pending refuse without changing bytes',()=>{
 for(const key of ['expectedLedgerSHA256','evidenceSHA256','reviewSHA256','reviewedBuildSHA256','approval','parentDecision','noActiveProofSHA256','reviewReference']){const s=setup();assert.throws(()=>s.budget().reviewedControlledRecovery({...s.options,[key]:key.endsWith('SHA256')?'f'.repeat(64):'wrong'}),key);assert.deepEqual(fs.readFileSync(s.file),s.before);}
 for(const change of ['pending','future','state','proof-date']){const s=setup();if(change==='pending')fs.writeFileSync(s.file+'.pending','uncertain');if(change==='future'){const d=s.d;d.records[6].usage={input_tokens:0,output_tokens:0};d.records[6].estimatedMicroUSD=0;fs.writeFileSync(s.file,JSON.stringify(d));s.options.expectedLedgerSHA256=sha(fs.readFileSync(s.file));}if(change==='state'){s.d.version=2;fs.writeFileSync(s.file,JSON.stringify(s.d));}if(change==='proof-date'){const p=JSON.parse(fs.readFileSync(s.base+'/no-active-proof.json'));p.observedAt='invalid';const raw=JSON.stringify(p);fs.writeFileSync(s.base+'/no-active-proof.json',raw);s.options.noActiveProofSHA256=sha(raw);}const before=fs.readFileSync(s.file);assert.throws(()=>s.budget().reviewedControlledRecovery(s.options));assert.deepEqual(fs.readFileSync(s.file),before);}
});
test('SYNTHETIC one owner, no missing/wrong cookie, exclusive lease, one-use matching grant, stale and changed packet refuse',()=>{
 const s=setup(),c=owner(s);try{const o=JSON.parse(fs.readFileSync(s.dir+'/owner.json'));assert.equal(c.authenticate(''),false);assert.equal(c.authenticate('newsren_owner='+'f'.repeat(64)),false);assert.equal(c.authenticate('newsren_owner='+o.token),true);assert.equal(c.authenticate('newsren_owner='+o.token+'; newsren_owner='+o.token),false);assert.throws(()=>createControlledDispatch({dir:s.dir,synthetic:true,buildHash:build}).acquire());assert.throws(()=>c.begin(packet));grant(s);assert.throws(()=>c.begin({...packet,question:'changed'}));c.begin(packet);assert.throws(()=>c.begin(packet));assert.throws(()=>grant(s,'parallel'));c.settle({outcome:'not-dispatched',safeToContinue:true});assert.throws(()=>grant(s));assert.throws(()=>c.begin(packet));assert.throws(()=>grantControlledAction({dir:s.dir,synthetic:true,requestID:'expired',initiatingAction:'question',packet,expiresAt:'2020-01-01',parentAuthorisation:'parent'}));}finally{c.close();}
});
async function httpCase(kind){
 const s=setup();s.budget().reviewedControlledRecovery(s.options);const c=owner(s),budget=createSubmissionAllowance({syntheticFile:s.file,dispatchControl:c});let calls=0,searches=0,release;const blocked=new Promise(r=>release=r);
 const server=await createServer(undefined,{env:{OPENAI_API_KEY:'SYNTHETIC-CREDENTIAL-CANARY',OPENAI_MODEL:SUBMISSION_POLICY.model},submissionAllowance:budget,controlledDispatch:c,simpleDiscovery:{health:()=>({state:'configured'}),run:async()=>{searches++;return {status:'empty'};}},testRankFetch:async(_url,opts)=>{
  calls++;assert.equal(JSON.parse(fs.readFileSync(s.file)).records[7].status,'reserved');assert.match(contents(s.dir+'/request-synthetic-request'),/reservationIndex/);assert.equal(JSON.parse(opts.body).input,JSON.stringify({untrustedBank:packet,untrustedEvidenceReferences:JSON.parse(JSON.parse(opts.body).input).untrustedEvidenceReferences}));
  if(kind==='parallel')await blocked;if(kind==='transport')throw Error('RAW SECRET HTTP ERROR must not be logged');if(kind==='http')return new Response('RAW SECRET ERROR',{status:429,headers:{'x-request-id':'safe-request-429'}});
  const value={version:'bank-references-1',results:packet.cards.map(c=>({id:c.id,disposition:'not-useful',explanation:'Synthetic unrelated passage.',evidence:'',roles:[],limits:'Synthetic limited context.',context:'Synthetic source context.',basis:['evidence-gap'],anchors:[]})),gaps:[]};
  if(kind==='private-shape')value.unexpected='SYNTHETIC-CREDENTIAL-CANARY';
  const text=kind==='json'?'SYNTHETIC-CREDENTIAL-CANARY not JSON':JSON.stringify(value);
  if(kind==='audit-io')fs.writeFileSync(s.dir+'/request-synthetic-request/003-model-text.json','preexisting blocks durable capture');
  return new Response(JSON.stringify({model:kind==='model'?'wrong-model':SUBMISSION_POLICY.model,status:'completed',service_tier:'default',usage:kind==='unknown-usage'?null:{input_tokens:2000,output_tokens:500,total_tokens:2500},output:[{type:'message',content:[{type:'output_text',text}]}]}),{headers:{'x-request-id':'safe-provider-request'}});
 }});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,o=JSON.parse(fs.readFileSync(s.dir+'/owner.json'));
 const post=(endpoint='/api/question/rank',cookie='newsren_owner='+o.token,body={packet})=>fetch(origin+endpoint,{method:'POST',headers:{origin,'Content-Type':'application/json',cookie},body:JSON.stringify(body)});
 try{
  for(const route of ['/api/ask','/api/related','/api/question/chat','/api/question/rank','/api/question/search','/api/feed/refresh']){assert.equal((await post(route,'')).status,403);assert.equal((await post(route,'newsren_owner='+'f'.repeat(64))).status,403);}assert.equal(calls,0);assert.equal(searches,0);assert.equal(budget.state().reserved,7);
  assert.equal((await post()).status,503);assert.equal(calls,0);assert.equal(budget.state().reserved,7);
  assert.equal((await post('/api/question/search')).status,200);assert.equal(searches,1);assert.equal(budget.state().reserved,7);
  grant(s);
  if(kind==='before-call-io'){
   // The intent mkdir is intercepted only in this synchronous synthetic test.
   const original=fs.mkdirSync;fs.mkdirSync=function(p,...args){const r=original.call(this,p,...args);if(p===s.dir+'/request-synthetic-request')fs.writeFileSync(p+'/001-reservation.json','synthetic write collision');return r;};
   try{const r=await post();assert.equal(r.status,503);assert.equal(calls,0);const d=JSON.parse(fs.readFileSync(s.file));assert.equal(d.reserved,8);assert.equal(d.records[7].status,'stopped');assert.equal(d.records[7].usage,null);assert.throws(()=>grant(s,'next'));await post();assert.equal(calls,0);return;}finally{fs.mkdirSync=original;}
  }
  const pending=post();if(kind==='parallel'){while(!calls)await new Promise(r=>setTimeout(r,5));const others=await Promise.all([post(),post(),post('/api/question/rank','')]);assert.deepEqual(others.map(x=>x.status),[503,503,403]);release();}
  const r=await pending,v=await r.json();assert.equal(r.headers.get('x-newsren-request-id'),'synthetic-request');assert.equal(calls,1);
  const d=JSON.parse(fs.readFileSync(s.file)),success=['success','parallel'].includes(kind),recoverable=['json','private-shape'].includes(kind);assert.equal(r.status,success?200:503,kind);assert.equal(d.records[7].status,success?'accepted':recoverable?'rejected':'stopped',kind);assert.equal(d.committedMicroUSD,2400000);assert.deepEqual(d.records.slice(0,7),s.d.records);
  const audit=contents(s.dir+'/request-synthetic-request');assert.doesNotMatch(audit,/SYNTHETIC-CREDENTIAL-CANARY|RAW SECRET|PRIVATE-NOTE|PRIVATE-TAG|PRIVATE-HISTORY/);if(['json','private-shape'].includes(kind)){assert.match(audit,/captureIncomplete/);assert.match(audit,/model-text|originalSHA256/);assert.match(audit,/rejected/);}if(success){assert.equal(v.version,2);assert.equal(v.coverage.assessed,1);assert.match(audit,/accepted/);assert.match(audit,/response/);}if(kind==='http'){assert.match(audit,/429/);assert.match(audit,/safe-request-429/);}
  await post();assert.equal(calls,1);assert.equal(budget.state().reserved,8);if(!success&&!recoverable)assert.throws(()=>grant(s,'next'));
 }finally{release();await new Promise(r=>server.close(r));c.close();}
}
for(const kind of ['success','parallel','json','private-shape','unknown-usage','model','transport','http','audit-io','before-call-io'])test('SYNTHETIC ordinary HTTP gate/audit lifecycle: '+kind,()=>httpCase(kind));
test('SYNTHETIC audit failure before reservation yields zero reserve; crash-claimed grant cannot auto rearm; no symlink directory',()=>{
 const s=setup(),c=owner(s);try{grant(s);fs.mkdirSync(s.dir+'/request-synthetic-request');assert.throws(()=>c.begin(packet));assert.equal(s.budget().state().reserved,7);assert.throws(()=>grant(s,'next'));}finally{c.close();}
 const t=setup();fs.symlinkSync(t.base,t.dir);assert.throws(()=>createControlledDispatch({dir:t.dir,synthetic:true,buildHash:build}).acquire());
});
test('SYNTHETIC validated minimal packet rejects notes/history/tags before audit or grant',()=>{
 const s=setup(),c=owner(s);try{for(const key of ['notes','tags','history'])assert.throws(()=>grant(s,'bad-'+key,{...packet,[key]:'PRIVATE-'+key.toUpperCase()}));assert.equal(c.state().state,'paused');assert.doesNotMatch(contents(s.dir),/PRIVATE-NOTES|PRIVATE-TAGS|PRIVATE-HISTORY/);}finally{c.close();}
});

test('SYNTHETIC corrupted disk grant cannot change owner, escape request directory, or bypass expiry',()=>{
 for(const patch of [{requestID:'../escape'},{leaseID:'other-owner'},{expiresAt:'not-a-date'}]){
  const s=setup(),c=owner(s);try{grant(s);const f=s.dir+'/owner.json',o=JSON.parse(fs.readFileSync(f));Object.assign(o.grant,patch);fs.writeFileSync(f,JSON.stringify(o),{mode:0o600});assert.throws(()=>c.begin(packet));assert.equal(s.budget().state().reserved,7);assert.equal(fs.existsSync(s.base+'/escape'),false);}finally{c.close();}
 }
});

// Real main bootstrap in an owned runtime-only fixture, never the real preview.
// Trusted preload redirects hardcoded listen3001 -> ephemeral loopback, records
// the actual address, denies every child fetch, and optionally injects EACCES.
const bootstrapPreload=`import http from 'node:http';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import path from 'node:path';
const base=process.cwd();
globalThis.fetch=async()=>{fs.appendFileSync(path.join(base,'dispatch-attempts.txt'),'denied-fetch\\n');throw Error('SYNTHETIC_BOOTSTRAP_NETWORK_DENIED');};
if(fs.existsSync(path.join(base,'inject-eacces'))){const original=fs.lstatSync;fs.lstatSync=function(p,...args){if(p===path.join(base,'artifacts/NR-011/overnight-eval-1/budget.json')){const e=Error('SYNTHETIC EACCES');e.code='EACCES';throw e;}return original.call(this,p,...args);};syncBuiltinESMExports();}
const listen=http.Server.prototype.listen;http.Server.prototype.listen=function(...args){if(args[0]!==3001||args[1]!=='127.0.0.1')throw Error('UNEXPECTED_BOOTSTRAP_LISTENER');args[0]=0;this.once('listening',()=>fs.writeFileSync(path.join(base,'bootstrap-listener.json'),JSON.stringify(this.address())));return listen.apply(this,args);};`;
async function bootstrapFixture(kind){
 fs.mkdirSync(parent,{recursive:true});const base=fs.mkdtempSync(parent+'/runtime-');
 for(const name of ['lib','public'])fs.cpSync(path.resolve(name),path.join(base,name),{recursive:true});
 for(const name of ['server.mjs','package.json'])fs.copyFileSync(path.resolve(name),path.join(base,name));
 fs.writeFileSync(base+'/bootstrap-preload.mjs',bootstrapPreload);
 const ledger=base+'/artifacts/NR-011/overnight-eval-1/budget.json';
 if(kind!=='clean'){
  fs.mkdirSync(path.dirname(ledger),{recursive:true});
  if(kind==='symlink')fs.symlinkSync('missing-synthetic-target.json',ledger);
  else if(kind==='ancestor-symlink'){fs.rmSync(base+'/artifacts',{recursive:true});fs.symlinkSync('missing-synthetic-parent',base+'/artifacts');}
  else if(kind==='pending')fs.writeFileSync(ledger+'.pending','SYNTHETIC uncertain write');
  else if(kind==='permission')fs.writeFileSync(base+'/inject-eacces','SYNTHETIC injected IO error');
  else fs.writeFileSync(ledger,kind==='malformed'?'not-json':JSON.stringify(syntheticSubmissionState()));
  // Configured fixture includes an empty test tree so no-owner refusal is not
  // merely the hash walk failing on absent runtime-excluded tests.
  if(kind==='configured'){
   fs.mkdirSync(base+'/tests');
   fs.mkdirSync(base+'/artifacts/NR-010/controlled-continuation-20261029',{recursive:true});
  }
 }
 assert.equal(fs.existsSync(base+'/.env'),false);if(kind!=='configured')assert.equal(fs.existsSync(base+'/tests'),false);
 const child=spawn(process.execPath,['--import',base+'/bootstrap-preload.mjs','server.mjs'],{cwd:base,env:{PATH:process.env.PATH,HOME:base,NEWSREN_AI_REQUEST_LIMIT:'0',NODE_OPTIONS:process.env.NODE_OPTIONS||''},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));let ended=false;exit.then(()=>ended=true);
 try{
  for(let i=0;i<250&&!ended&&!fs.existsSync(base+'/bootstrap-listener.json');i++)await delay(20);
  if(kind!=='clean'){
   if(!ended){child.kill('SIGTERM');await exit;assert.fail('Configured/unsafe fixture unexpectedly remained running: '+kind+' '+output);}
   const result=await exit;assert.notEqual(result.code,0,kind);assert.equal(fs.existsSync(base+'/bootstrap-listener.json'),false,kind);assert.equal(fs.existsSync(base+'/dispatch-attempts.txt'),false);if(kind==='configured')assert.match(output,/dispatch-control/);if(kind==='permission')assert.match(output,/EACCES/);return;
  }
  assert.equal(ended,false,output);assert.equal(fs.existsSync(base+'/bootstrap-listener.json'),true,output);
  const address=JSON.parse(fs.readFileSync(base+'/bootstrap-listener.json'));assert.equal(address.address,'127.0.0.1');assert.notEqual(address.port,3001);const origin='http://127.0.0.1:'+address.port;
  assert.equal((await fetch(origin+'/')).status,200);const health=await (await fetch(origin+'/api/config')).json();assert.equal(health.state,'unavailable');assert.equal(health.budget.reason,'budget-unavailable');assert.equal(health.legacy,'disabled');assert.equal(health.dispatch,undefined);
  // Even if a journal appears later, a read-only boot never becomes paid-ready.
  fs.mkdirSync(path.dirname(ledger),{recursive:true});fs.writeFileSync(ledger,JSON.stringify(syntheticSubmissionState()));const before=fs.readFileSync(ledger);
  for(const route of ['/api/question/rank','/api/question/search','/api/question/chat','/api/feed/refresh','/api/ask','/api/related']){
   const response=await fetch(origin+route,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(route.includes('/question/')||route.includes('/feed/')?{packet}:route==='/api/related'?{articleId:'synthetic-root'}:{articleId:'synthetic-root',input:'synthetic'})});assert.equal(response.status,503,route);
  }
  assert.equal((await (await fetch(origin+'/api/config')).json()).budget.reason,'budget-unavailable');assert.deepEqual(fs.readFileSync(ledger),before);assert.equal(fs.existsSync(base+'/dispatch-attempts.txt'),false);assert.equal(fs.existsSync(base+'/artifacts/NR-010'),false);
 }finally{if(!ended){child.kill('SIGTERM');await exit;}}
}
test('SYNTHETIC real-main clean runtime without env/ledger/owner/tests serves read-only and permanently denies all dispatch',()=>bootstrapFixture('clean'));
for(const kind of ['configured','malformed','symlink','ancestor-symlink','pending','permission'])test('SYNTHETIC real-main configured/unsafe ledger cannot use absent-ledger bootstrap: '+kind,()=>bootstrapFixture(kind));
