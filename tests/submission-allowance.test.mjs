import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createSubmissionAllowance,syntheticSubmissionState,SUBMISSION_POLICY,reviewedBuildHash} from '../lib/submission-allowance.mjs';
import {loadApplicationEnv} from '../lib/application-env.mjs';
import {createAI} from '../lib/ai.mjs';
const root=path.resolve('artifacts/NR-011/cycle-1/synthetic-nonproduction-journals');
function fixture(){fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(root+'/case-'),file=dir+'/budget.json';fs.writeFileSync(file,JSON.stringify(syntheticSubmissionState()));return {file,budget:createSubmissionAllowance({syntheticFile:file})};}
const usage={input_tokens:272000,output_tokens:8000,total_tokens:280000};
test('synthetic NOT live: published maximum rank charge is $0.240, reservation $0.30; hosted search disabled',()=>{assert.equal((272000*.75+8000*4.5)/1e6,.24);assert.equal(SUBMISSION_POLICY.rankReservationMicroUSD,300000);assert.equal(SUBMISSION_POLICY.hostedSearchEnabled,false);});
test('synthetic NOT live: committed ceilings persist across restarts; first USD limit wins over 30 requests',()=>{const {file,budget}=fixture();for(let i=0;i<10;i++){assert.equal(budget.reserve(),i);budget.record(i,{accepted:true,usage});}const b=createSubmissionAllowance({syntheticFile:file});assert.equal(b.state().committedMicroUSD,3000000);assert.equal(b.state().estimatedMicroUSD,2400000);assert.equal(b.state().reserved,10);assert.equal(b.state().reason,'quota-exhausted');assert.throws(()=>b.reserve(),/quota-exhausted/);assert.equal(JSON.parse(fs.readFileSync(file)).reserved,10);});
test('synthetic NOT live: failed/unknown call counts, commits and stops without refunds',()=>{const {budget}=fixture();budget.record(budget.reserve(),{accepted:false});assert.equal(budget.state().reserved,1);assert.equal(budget.state().remainingMicroUSD,2700000);assert.equal(budget.state().estimatedMicroUSD,0);assert.equal(budget.state().reason,'live-run-stopped');assert.throws(()=>budget.reserve(),/live-run-stopped/);});
test('synthetic NOT live: outstanding reservation blocks second process-like instance and restart',()=>{const {file,budget}=fixture();budget.reserve();const b=createSubmissionAllowance({syntheticFile:file});assert.equal(b.state().reason,'live-run-stopped');assert.throws(()=>b.reserve(),/live-run-stopped/);assert.equal(JSON.parse(fs.readFileSync(file)).reserved,1);});
test('synthetic NOT live: missing/corrupt/lock/policy mismatch fail closed, never recreated',()=>{for(const fault of ['missing','corrupt','lock','policy']){const {file,budget}=fixture();if(fault==='missing')fs.unlinkSync(file);if(fault==='corrupt')fs.writeFileSync(file,'{');if(fault==='lock')fs.writeFileSync(file+'.lock','');if(fault==='policy'){const d=JSON.parse(fs.readFileSync(file));d.policy.capMicroUSD++;fs.writeFileSync(file,JSON.stringify(d));}assert.equal(budget.state().reason,'budget-unavailable');assert.throws(()=>budget.reserve(),/budget-unavailable/);if(fault==='missing')assert.equal(fs.existsSync(file),false);}});
test('synthetic NOT live: unknown usage, over-model usage and malformed totals stop',()=>{for(const u of [null,{...usage,input_tokens:272001},{...usage,output_tokens:8001},{...usage,total_tokens:1}]){const {budget}=fixture();budget.record(budget.reserve(),{accepted:true,usage:u});assert.equal(budget.state().reason,'live-run-stopped');assert.equal(budget.state().committedMicroUSD,300000);}});
test('synthetic NOT live: two real child processes share one atomic request/USD reservation; never parallel provider credit',async()=>{const {file}=fixture();const code="import {createSubmissionAllowance} from './lib/submission-allowance.mjs';try{console.log('RESERVED',createSubmissionAllowance({syntheticFile:process.argv[1]}).reserve());}catch(e){console.log('BLOCKED',e.message);}";const run=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',code,file],{env:process.env});let out='';p.stdout.on('data',d=>out+=d);p.on('error',reject);p.on('close',exit=>exit===0?resolve(out):reject(Error('child failed')));});const outcomes=await Promise.all([run(),run()]);assert.equal(outcomes.filter(s=>s.startsWith('RESERVED')).length,1);assert.equal(outcomes.filter(s=>s.startsWith('BLOCKED')).length,1);const d=JSON.parse(fs.readFileSync(file));assert.equal(d.reserved,1);assert.equal(d.committedMicroUSD,300000);});
test('synthetic NOT live: only known app credentials loaded, old exhausted-budget env ignored; never real .env',()=>{const out=loadApplicationEnv({OPENAI_MODEL:'explicit-model',NEWSREN_AI_REQUEST_LIMIT:'12'},{read:()=>"OPENAI_API_KEY='synthetic-not-secret'\nOPENAI_MODEL=ignored\nNEWSREN_AI_JOURNAL_PATH=old\nOTHER=ignored"});assert.deepEqual(out,{OPENAI_API_KEY:'synthetic-not-secret',OPENAI_MODEL:'explicit-model'});});
test('synthetic NOT live: trusted production allowance disables all dormant provider routes',async()=>{const {budget}=fixture();let calls=0;const ai=createAI({env:{OPENAI_API_KEY:'synthetic',OPENAI_MODEL:SUBMISSION_POLICY.model},submissionAllowance:budget,provider:async()=>{calls++;},corpus:{articles:[],sources:[],edges:[]}});assert.equal(ai.health().rank.state,'configured');assert.equal(ai.health().discovery.state,'unavailable');for(const kind of ['chat','search','refresh'])await assert.rejects(ai.workspace({kind,packet:{}}),/legacy-route-disabled/);await assert.rejects(ai.ask({}),/legacy-route-disabled/);await assert.rejects(ai.discover({}),/legacy-route-disabled/);assert.equal(calls,0);assert.equal(budget.state().reserved,0);});

// SYNTHETIC NONPRODUCTION ONLY; not a copy of the actual failed ledger.
const hash=b=>createHash('sha256').update(b).digest('hex');
function stoppedFixture(){const f=fixture();f.budget.record(f.budget.reserve(),{accepted:false});const dir=path.dirname(f.file),source='// SYNTHETIC frozen validator path, NOT production evidence.\n';fs.writeFileSync(dir+'/synthetic-source.mjs',source);fs.writeFileSync(dir+'/synthetic-evidence.json',JSON.stringify({classification:'application-validation',identityVerified:true,providerStatus:'completed',sourceSHA256:hash(source),toolCallCount:0}));fs.writeFileSync(dir+'/NR-011-cycle-2-synthetic.md','SYNTHETIC review fixture, NOT an independent review or operator approval.');return f;}
function recoveryOptions(file){return {expectedLedgerSHA256:hash(fs.readFileSync(file)),reviewedBuildSHA256:reviewedBuildHash(),reviewReference:'NR-011-cycle-2-synthetic.md',reviewSHA256:hash(fs.readFileSync(path.dirname(file)+'/NR-011-cycle-2-synthetic.md')),approval:SUBMISSION_POLICY.approval,parentDecision:'NR011-reviewed-material-fix-zero-credit-continuation',evidenceSHA256:hash(fs.readFileSync(path.dirname(file)+'/synthetic-evidence.json'))};}
test('SYNTHETIC local operator recovery has ZERO credit/count delta; legacy halted until invoked, restart/new reserve retains failed record',()=>{
 const {file,budget}=stoppedFixture(),old=JSON.parse(fs.readFileSync(file)),options=recoveryOptions(file);
 assert.equal(createSubmissionAllowance({syntheticFile:file}).state().reason,'live-run-stopped');
 const state=budget.reviewedRecovery(options);assert.equal(state.reserved,1);assert.equal(state.committedMicroUSD,300000);assert.equal(state.estimatedMicroUSD,0);assert.equal(state.reason,null);
 const after=JSON.parse(fs.readFileSync(file));assert.deepEqual(after.records,old.records);for(const k of ['policy','reserved','committedMicroUSD','estimatedMicroUSD'])assert.deepEqual(after[k],old[k]);
 assert.equal(after.recoveries[0].countDelta,0);assert.equal(after.recoveries[0].moneyDelta,0);assert.equal(after.recoveries[0].previousLedgerSHA256,options.expectedLedgerSHA256);
 const restart=createSubmissionAllowance({syntheticFile:file});assert.equal(restart.reserve(),1);assert.equal(restart.state().committedMicroUSD,600000);restart.record(1,{accepted:false,usage:{input_tokens:1000,output_tokens:1000}});assert.equal(restart.state().reason,'live-run-stopped');assert.deepEqual(JSON.parse(fs.readFileSync(file)).records[0],old.records[0]);
 assert.throws(()=>createSubmissionAllowance({syntheticFile:file}).reviewedRecovery(recoveryOptions(file))); // no automatic second recovery
});
test('SYNTHETIC operator rejects wrong approval/hash/review, pending, capraise/refund/deletion/duplicate without mutation',()=>{
 for(const mutation of ['approval','hash','review','extra','pending','cap','refund','remove','duplicate','accepted','unknownusage','model','pricing','identity','inflight','missing','buildhash','reviewhash','evidencehash','source','security','transport']){
  const {file}=stoppedFixture();let d=JSON.parse(fs.readFileSync(file));
  if(mutation==='cap')d.policy.capMicroUSD++;
  if(mutation==='model')d.policy.model='wrong';if(mutation==='pricing')d.policy.inputMicroUSDPerMillion=0;if(mutation==='identity')d.policy.id='wrong';if(mutation==='inflight')d.records[0].status='reserved';
  if(mutation==='refund')d.committedMicroUSD=0;
  if(mutation==='remove')d.records=[];
  if(mutation==='duplicate')d.records.push(d.records[0]);
  if(mutation==='accepted'){d.records[0].status='accepted';d.records[0].usage={input_tokens:1000,output_tokens:1000};d.records[0].estimatedMicroUSD=5250;d.estimatedMicroUSD=5250;}
  if(mutation==='unknownusage'){d.records[0].usage={input_tokens:1000,output_tokens:1000};d.records[0].estimatedMicroUSD=5250;d.estimatedMicroUSD=5250;}
  fs.writeFileSync(file,JSON.stringify(d));const o=recoveryOptions(file);
  if(mutation==='buildhash')o.reviewedBuildSHA256='f'.repeat(64);if(mutation==='reviewhash')o.reviewSHA256='f'.repeat(64);if(mutation==='evidencehash')o.evidenceSHA256='f'.repeat(64);if(mutation==='source')fs.appendFileSync(path.dirname(file)+'/synthetic-source.mjs','tampered');
  if(['security','transport'].includes(mutation)){const ef=path.dirname(file)+'/synthetic-evidence.json',e=JSON.parse(fs.readFileSync(ef));e.classification=mutation==='security'?'rank-model':'provider-failure';fs.writeFileSync(ef,JSON.stringify(e));o.evidenceSHA256=hash(fs.readFileSync(ef));}
  if(mutation==='approval')o.approval='wrong';if(mutation==='hash')o.expectedLedgerSHA256='f'.repeat(64);if(mutation==='review')o.reviewReference='../bad.md';if(mutation==='extra')o.capMicroUSD=6000000;if(mutation==='pending')fs.writeFileSync(file+'.pending','unfinished');
  if(mutation==='missing'){fs.unlinkSync(file);assert.throws(()=>createSubmissionAllowance({syntheticFile:file}).reviewedRecovery(o));assert.equal(fs.existsSync(file),false);continue;}
  const before=fs.readFileSync(file);assert.throws(()=>createSubmissionAllowance({syntheticFile:file}).reviewedRecovery(o));assert.deepEqual(fs.readFileSync(file),before);
 }
});
test('SYNTHETIC recovery race has one durable audit, preserved charge and original cap across processes/restarts',async()=>{
 const {file}=stoppedFixture(),options=recoveryOptions(file);
 const code="import {createSubmissionAllowance} from './lib/submission-allowance.mjs';try{createSubmissionAllowance({syntheticFile:process.argv[1]}).reviewedRecovery(JSON.parse(process.argv[2]));console.log('RECOVERED');}catch{console.log('BLOCKED');}";
 const run=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',code,file,JSON.stringify(options)],{env:process.env});let out='';p.stdout.on('data',b=>out+=b);p.on('error',reject);p.on('close',n=>n===0?resolve(out.trim()):reject(Error('child failed')));});
 const outcomes=await Promise.all([run(),run()]);assert.equal(outcomes.filter(s=>s==='RECOVERED').length,1);assert.equal(outcomes.filter(s=>s==='BLOCKED').length,1);
 const b=createSubmissionAllowance({syntheticFile:file});for(let i=1;i<10;i++){assert.equal(b.reserve(),i);b.record(i,{accepted:true,usage});}
 assert.equal(b.state().committedMicroUSD,3000000);assert.equal(b.state().reason,'quota-exhausted');assert.throws(()=>b.reserve(),/quota-exhausted/);assert.throws(()=>createSubmissionAllowance({syntheticFile:file}).reviewedRecovery(recoveryOptions(file)));assert.equal(JSON.parse(fs.readFileSync(file)).recoveries.length,1);
});
test('SYNTHETIC recovery write/fsync/rename/directory-sync faults leave crash guards, restart fails closed',()=>{
 for(const fault of ['write','file-sync','rename','directory-sync']){
  const {file,budget}=stoppedFixture(),options=recoveryOptions(file),before=JSON.parse(fs.readFileSync(file));
  const originals={writeFileSync:fs.writeFileSync,fsyncSync:fs.fsyncSync,renameSync:fs.renameSync};let syncs=0;
  try{
   if(fault==='write')fs.writeFileSync=()=>{throw Error('SYNTHETIC IO fault');};
   if(fault==='rename')fs.renameSync=()=>{throw Error('SYNTHETIC IO fault');};
   fs.fsyncSync=(...args)=>{syncs++;if(fault==='file-sync'&&syncs===1||fault==='directory-sync'&&syncs===2)throw Error('SYNTHETIC IO fault');return originals.fsyncSync(...args);};
   assert.throws(()=>budget.reviewedRecovery(options),/budget-unavailable/);
  }finally{Object.assign(fs,originals);}
  assert.equal(fs.existsSync(file+'.lock'),true);const after=JSON.parse(fs.readFileSync(file));assert.deepEqual(after.records,before.records);assert.equal(after.committedMicroUSD,300000);assert.equal(after.reserved,1);assert.equal(createSubmissionAllowance({syntheticFile:file}).state().reason,'budget-unavailable');
 }
});

test('SYNTHETIC injection cannot redirect synthetic recovery authority to production or arbitrary file',()=>{for(const file of [path.resolve('artifacts/NR-011/overnight-eval-1/budget.json'),path.resolve('budget.json')])assert.throws(()=>createSubmissionAllowance({syntheticFile:file}),/budget-unavailable/);});

// New continuation fixtures are constructed from synthetic requests, never copied
// from either real ledger. Real historical timestamps/records are not test data.
function completionFixture(){
 const f=stoppedFixture();f.budget.reviewedRecovery(recoveryOptions(f.file));
 f.budget.record(f.budget.reserve(),{accepted:true,usage:{input_tokens:1247,output_tokens:299}});
 f.budget.record(f.budget.reserve(),{usage:{input_tokens:2924,output_tokens:798}});
 const dir=path.dirname(f.file);fs.writeFileSync(dir+'/NR-010-matching-recovery-20261028-synthetic.md','SYNTHETIC review, not acceptance.');return f;
}
function completionOptions(file){return {...recoveryOptions(file),approval:'NR010-NR011-completion-user-2026-10-28',parentDecision:'NR010-NR011-reviewed-completion-zero-credit-continuation',reviewReference:'NR-010-matching-recovery-20261028-synthetic.md',reviewSHA256:hash(fs.readFileSync(path.dirname(file)+'/NR-010-matching-recovery-20261028-synthetic.md'))};}
test('SYNTHETIC completion preserves 3/.90/8065 and every record/audit0; next reserve 4/1.20; later stop never ignored',()=>{
 const {file,budget}=completionFixture(),old=JSON.parse(fs.readFileSync(file)),options=completionOptions(file);
 assert.equal(budget.state().reason,'live-run-stopped');const state=budget.reviewedCompletionRecovery(options);assert.equal(state.reserved,3);assert.equal(state.committedMicroUSD,900000);assert.equal(state.estimatedMicroUSD,8065);assert.equal(state.reason,null);
 const d=JSON.parse(fs.readFileSync(file));assert.equal(d.version,3);assert.deepEqual(d.records,old.records);assert.deepEqual(d.recoveries[0],old.recoveries[0]);for(const k of ['policy','reserved','committedMicroUSD','estimatedMicroUSD'])assert.deepEqual(d[k],old[k]);assert.equal(d.recoveries[1].index,2);assert.equal(d.recoveries[1].moneyDelta,0);assert.equal(d.recoveries[1].countDelta,0);assert.equal(d.recoveries[1].previousLedgerSHA256,options.expectedLedgerSHA256);
 const b=createSubmissionAllowance({syntheticFile:file});assert.equal(b.reserve(),3);assert.equal(b.state().reserved,4);assert.equal(b.state().committedMicroUSD,1200000);b.record(3,{recoverableApplicationRejection:true,usage:{input_tokens:100,output_tokens:100}});assert.equal(b.state().reason,null);assert.equal(JSON.parse(fs.readFileSync(file)).records[3].status,'rejected');
 b.record(b.reserve(),{usage:{input_tokens:100,output_tokens:100}});assert.equal(b.state().reason,'live-run-stopped');assert.throws(()=>createSubmissionAllowance({syntheticFile:file}).reviewedCompletionRecovery(completionOptions(file)));assert.deepEqual(JSON.parse(fs.readFileSync(file)).records.slice(0,3),old.records);
});
test('SYNTHETIC completion refuses wrong hash/evidence/review/build/approval/decision, policy/usage/pending/locks/symlink and repeat; no mutation',()=>{
 for(const fault of ['hash','evidence','reviewhash','reviewfile','build','approval','decision','extra','policy','usage','unknown','pending','lock','symlink','reserved','exhausted','firstaudit','source','security','transport','evidence-identity','evidence-tools','evidence-status','reviewtype','repeat']){
  const {file,budget}=completionFixture();let d=JSON.parse(fs.readFileSync(file));
  if(fault==='policy')d.policy.capMicroUSD++;if(fault==='usage')d.records[2].usage.output_tokens++;if(fault==='unknown'){d.records[2].usage=null;d.records[2].estimatedMicroUSD=null;d.estimatedMicroUSD=2281;}if(fault==='reserved')d.records[2].status='reserved';if(fault==='exhausted')d.reserved=30;if(fault==='firstaudit')d.recoveries[0].recordSHA256='f'.repeat(64);fs.writeFileSync(file,JSON.stringify(d));
  const o=completionOptions(file);if(fault==='hash')o.expectedLedgerSHA256='f'.repeat(64);if(fault==='evidence')o.evidenceSHA256='f'.repeat(64);if(fault==='reviewhash')o.reviewSHA256='f'.repeat(64);if(fault==='reviewfile')o.reviewReference='../bad.md';if(fault==='reviewtype')o.reviewReference=[o.reviewReference];if(fault==='build')o.reviewedBuildSHA256='f'.repeat(64);if(fault==='approval')o.approval='wrong';if(fault==='decision')o.parentDecision='wrong';if(fault==='extra')o.credit=1;
  if(['pending','lock'].includes(fault))fs.writeFileSync(file+'.'+fault,'SYNTHETIC crash guard');if(fault==='source')fs.appendFileSync(path.dirname(file)+'/synthetic-source.mjs','tampered');
  if(['security','transport'].includes(fault)){const p=path.dirname(file)+'/synthetic-evidence.json',e=JSON.parse(fs.readFileSync(p));e.classification=fault;fs.writeFileSync(p,JSON.stringify(e));o.evidenceSHA256=hash(fs.readFileSync(p));}
  if(['evidence-identity','evidence-tools','evidence-status'].includes(fault)){const p=path.dirname(file)+'/synthetic-evidence.json',e=JSON.parse(fs.readFileSync(p));if(fault==='evidence-identity')e.identityVerified=false;if(fault==='evidence-tools')e.toolCallCount=1;if(fault==='evidence-status')e.providerStatus='incomplete';fs.writeFileSync(p,JSON.stringify(e));o.evidenceSHA256=hash(fs.readFileSync(p));}
  if(fault==='symlink'){fs.renameSync(file,file+'.target');fs.symlinkSync(file+'.target',file);}if(fault==='repeat')budget.reviewedCompletionRecovery(o);
  const before=fs.readFileSync(file);assert.throws(()=>createSubmissionAllowance({syntheticFile:file}).reviewedCompletionRecovery(o),undefined,fault);assert.deepEqual(fs.readFileSync(file),before,fault);
 }
});
test('SYNTHETIC V3 history coverage binds only unchanged original records/audit; rejected requires known valid usage; default is fail closed',()=>{
 for(const fault of ['record0','record2','audit0','audit2','unknown-rejected','uncovered-stop']){
  const {file,budget}=completionFixture();budget.reviewedCompletionRecovery(completionOptions(file));const d=JSON.parse(fs.readFileSync(file));
  if(fault==='record0')d.records[0].reservedAt='2026-01-01T00:00:00Z';if(fault==='record2')d.records[2].reservedAt='2026-01-01T00:00:00Z';if(fault==='audit0')d.recoveries[0].reviewSHA256='f'.repeat(64);if(fault==='audit2')d.recoveries[1].countDelta=1;
  if(['unknown-rejected','uncovered-stop'].includes(fault)){d.reserved++;d.committedMicroUSD+=300000;d.records.push({index:3,stage:'question-rank',reservedAt:new Date().toISOString(),reservedMicroUSD:300000,status:fault==='unknown-rejected'?'rejected':'stopped',usage:null,estimatedMicroUSD:null});}
  fs.writeFileSync(file,JSON.stringify(d));assert.equal(createSubmissionAllowance({syntheticFile:file}).state().reason,'budget-unavailable',fault);
 }
 for(const u of [null,{input_tokens:1,output_tokens:1,total_tokens:1}]){const {budget}=fixture();budget.record(budget.reserve(),{recoverableApplicationRejection:true,usage:u});assert.equal(budget.state().reason,'live-run-stopped');}
});
test('SYNTHETIC completion concurrent operators have one winner; original lifetime cap remains $3 AND30, no replacement credit',async()=>{
 const {file}=completionFixture(),o=completionOptions(file);const code="import {createSubmissionAllowance} from './lib/submission-allowance.mjs';try{createSubmissionAllowance({syntheticFile:process.argv[1]}).reviewedCompletionRecovery(JSON.parse(process.argv[2]));console.log('OK');}catch{console.log('BLOCKED');}";
 const run=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',code,file,JSON.stringify(o)],{env:process.env});let out='';p.stdout.on('data',b=>out+=b);p.on('error',reject);p.on('close',n=>n===0?resolve(out.trim()):reject(Error('child failed')));});const results=await Promise.all([run(),run()]);assert.equal(results.filter(r=>r==='OK').length,1);assert.equal(results.filter(r=>r==='BLOCKED').length,1);
 const b=createSubmissionAllowance({syntheticFile:file});for(let i=3;i<10;i++){assert.equal(b.reserve(),i);b.record(i,{accepted:true,usage});}assert.equal(b.state().reserved,10);assert.equal(b.state().committedMicroUSD,3000000);assert.equal(b.state().reason,'quota-exhausted');assert.equal(b.state().limit,30);assert.throws(()=>b.reserve(),/quota-exhausted/);assert.throws(()=>createSubmissionAllowance({syntheticFile:file}).reviewedCompletionRecovery(completionOptions(file)));assert.equal(JSON.parse(fs.readFileSync(file)).recoveries.length,2);
});
test('SYNTHETIC completion durability faults preserve records/audit0/holds; restart fails closed, never delete crash guards',()=>{
 for(const fault of ['write','file-sync','rename','directory-sync']){
  const {file,budget}=completionFixture(),o=completionOptions(file),before=JSON.parse(fs.readFileSync(file)),originals={writeFileSync:fs.writeFileSync,fsyncSync:fs.fsyncSync,renameSync:fs.renameSync};let syncs=0;
  try{if(fault==='write')fs.writeFileSync=()=>{throw Error('SYNTHETIC IO');};if(fault==='rename')fs.renameSync=()=>{throw Error('SYNTHETIC IO');};fs.fsyncSync=(...a)=>{syncs++;if(fault==='file-sync'&&syncs===1||fault==='directory-sync'&&syncs===2)throw Error('SYNTHETIC IO');return originals.fsyncSync(...a);};assert.throws(()=>budget.reviewedCompletionRecovery(o),/budget-unavailable/);}finally{Object.assign(fs,originals);}
  const after=JSON.parse(fs.readFileSync(file));assert.deepEqual(after.records,before.records);assert.deepEqual(after.recoveries[0],before.recoveries[0]);assert.equal(after.reserved,3);assert.equal(after.committedMicroUSD,900000);assert.equal(after.estimatedMicroUSD,8065);assert.equal(fs.existsSync(file+'.lock'),true);assert.equal(createSubmissionAllowance({syntheticFile:file}).state().reason,'budget-unavailable');
 }
});
