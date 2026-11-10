import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isControlledDispatch} from './controlled-dispatch.mjs';
const CONTROLLED=Object.freeze({approval:'NR010-NR011-controlled-completion-user-2026-10-29',decision:'NR010-NR011-reviewed-controlled-zero-credit-continuation',ledger:'41b64429a1f86a0e8800206dc8cc237124dc34a586a7c568e718f51d0177a5a8',evidence:'97e044a32d4f9f6baa2f291cc2ec657eb65020134ffface46afad0258bfbd389',records:'acbbc32bca0edd560bf81881a91748cc4184a8b96ecfdc92d157d253a45b2989',audits:'e77ab285d2304d3781a196fef5a5de6f0f53b63e18e4dcf2195feb2f867a6f84'});
const sha=b=>createHash('sha256').update(b).digest('hex');
// Trusted application policy, never supplied by the client or an environment assertion.
// Published maximum-input contract bounds cost, not actual semantic/output feasibility.
export const SUBMISSION_POLICY=Object.freeze({id:'nr011-submission-eval-1',approval:'01a17be7-81e0-75fe-babc-1ce82abb70e9/latestovernightuserturn',model:'gpt-5.4-mini-2026-03-17',endpoint:'https://api.openai.com/v1/responses',serviceTier:'default',region:'global-standard',pricingVerifiedAt:'2026-10-27T07:38:00Z',inputMaximum:272000,contextMaximum:400000,outputMaximum:8000,inputMicroUSDPerMillion:750000,outputMicroUSDPerMillion:4500000,searchToolMicroUSD:10000,pricingSHA256:'93d302a9b7a384877533bc3ab5bb48eebf4b56bd6add0f194095054b2a13f952',modelSHA256:'83625d2f3548c29379b3b2a44b183a26d266d2f5c3ffda7161dd19c9213a9058',maxRequests:30,capMicroUSD:3000000,rankReservationMicroUSD:300000,hostedSearchEnabled:false,hostedSearchReason:'hosted-tool-billable-pass-bound-unverified',concurrency:1});
export const SUBMISSION_FILE=path.resolve('artifacts/NR-011/overnight-eval-1/budget.json');
const COMPLETION=Object.freeze({approval:'NR010-NR011-completion-user-2026-10-28',decision:'NR010-NR011-reviewed-completion-zero-credit-continuation',ledger:'2362e2612f618ba3cc75e1f04fcfce88426b0f0d2f96b04b00851d2f7189fd35',evidence:'6ce4634135e3c14ba2b78cda1929e3a56601b67e3c8aea365b360697fc007ee2',records:'b808009487067b4502a1f82ec197a086ca9f382f379a11950c1bb410647e1b64',audit0:'2a325c9ee555ada805e595463b3e637fe52ce25e1b3ac34b5b1576a1040a6c64'});
const policyJSON=JSON.stringify(SUBMISSION_POLICY);
const initial=()=>({version:1,policy:SUBMISSION_POLICY,reserved:0,committedMicroUSD:0,estimatedMicroUSD:0,stopped:false,records:[]});
function syncDirectory(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
// Explicit one-time operator/build provisioning, NEVER called by startup/request handlers.
export function provisionSubmissionAllowance(){
 const dir=path.dirname(SUBMISSION_FILE);fs.mkdirSync(dir,{recursive:false,mode:0o700});
 const fd=fs.openSync(SUBMISSION_FILE,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(initial(),null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}syncDirectory(dir);
}
export function createSubmissionAllowance({syntheticFile=null,dispatchControl=null}={}){
 const file=syntheticFile||SUBMISSION_FILE;
 if(syntheticFile&&(!path.isAbsolute(file)||!['artifacts/NR-011/cycle-1','artifacts/NR-011/cycle-2','artifacts/NR-010/matching-recovery-20261028'].some(c=>file.startsWith(path.resolve(c+'/synthetic-nonproduction-journals')+path.sep))))throw Error('budget-unavailable');
 let fault=null;
 const check=d=>{
  if(!d||Object.keys(d).sort().join(',')!==(d.version>=2?'committedMicroUSD,estimatedMicroUSD,policy,records,recoveries,reserved,stopped,version':'committedMicroUSD,estimatedMicroUSD,policy,records,reserved,stopped,version')||![1,2,3,4].includes(d.version)||JSON.stringify(d.policy)!==policyJSON||!Number.isInteger(d.reserved)||d.reserved<0||d.reserved>30||d.committedMicroUSD!==d.reserved*300000||d.committedMicroUSD>3000000||!Array.isArray(d.records)||d.records.length!==d.reserved||typeof d.stopped!=='boolean'||!Number.isInteger(d.estimatedMicroUSD)||d.estimatedMicroUSD<0)throw Error('budget-unavailable');
  if(d.version>=2){
   if(!Array.isArray(d.recoveries)||d.recoveries.length!==(d.version===4?3:d.version===3?2:1))throw Error('budget-unavailable');
   const a=d.recoveries[0];
   if(!a||Object.keys(a).sort().join(',')!=='approval,countDelta,evidenceSHA256,index,moneyDelta,parentDecision,previousLedgerSHA256,recordSHA256,recoveredAt,reviewReference,reviewSHA256,reviewedBuildSHA256'||a.index!==0||a.countDelta!==0||a.moneyDelta!==0||a.approval!==SUBMISSION_POLICY.approval||a.parentDecision!=='NR011-reviewed-material-fix-zero-credit-continuation'||!['previousLedgerSHA256','recordSHA256','evidenceSHA256','reviewSHA256','reviewedBuildSHA256'].every(k=>/^[a-f0-9]{64}$/.test(a[k]))||typeof a.reviewReference!=='string'||!/^NR-011-cycle-2[-a-z0-9]*\.md$/.test(a.reviewReference)||!Number.isFinite(Date.parse(a.recoveredAt))||d.records[0]?.status!=='stopped'||a.recordSHA256!==sha(JSON.stringify(d.records[0])))throw Error('budget-unavailable');
  if(!syntheticFile&&(a.previousLedgerSHA256!=='8d37a4d1b263b7aaf3fa0f2a89a33d82041ab444057c94f8c950e258261fac74'||a.evidenceSHA256!=='eb6428f8a5418e84fbf5411c355511f3fcdc3a6c7925380a36997b2a941abb67'))throw Error('budget-unavailable');
  }
  if(d.version>=3){
   const a=d.recoveries[1];
   if(!a||Object.keys(a).sort().join(',')!=='approval,countDelta,evidenceSHA256,firstAuditSHA256,index,moneyDelta,parentDecision,previousLedgerSHA256,recordSHA256,recordsSHA256,recoveredAt,reviewReference,reviewSHA256,reviewedBuildSHA256'||a.index!==2||a.countDelta!==0||a.moneyDelta!==0||a.approval!==COMPLETION.approval||a.parentDecision!==COMPLETION.decision||!['previousLedgerSHA256','recordSHA256','recordsSHA256','firstAuditSHA256','evidenceSHA256','reviewSHA256','reviewedBuildSHA256'].every(k=>/^[a-f0-9]{64}$/.test(a[k]))||typeof a.reviewReference!=='string'||!/^NR-010-matching-recovery-20261028[-a-z0-9]*\.md$/.test(a.reviewReference)||typeof a.recoveredAt!=='string'||!Number.isFinite(Date.parse(a.recoveredAt))||d.records[2]?.status!=='stopped'||a.recordSHA256!==sha(JSON.stringify(d.records[2]))||a.recordsSHA256!==sha(JSON.stringify(d.records.slice(0,3)))||a.firstAuditSHA256!==sha(JSON.stringify(d.recoveries[0])))throw Error('budget-unavailable');
   if(!syntheticFile&&(a.previousLedgerSHA256!==COMPLETION.ledger||a.evidenceSHA256!==COMPLETION.evidence||a.recordsSHA256!==COMPLETION.records||a.firstAuditSHA256!==COMPLETION.audit0))throw Error('budget-unavailable');
  }
  if(d.version===4){
   const a=d.recoveries[2];
   if(!a||Object.keys(a).sort().join(',')!=='approval,countDelta,evidenceSHA256,index,moneyDelta,noActiveProofSHA256,parentDecision,previousLedgerSHA256,priorAuditsSHA256,recordsSHA256,recoveredAt,reviewReference,reviewSHA256,reviewedBuildSHA256'||a.index!==6||a.countDelta!==0||a.moneyDelta!==0||a.approval!==CONTROLLED.approval||a.parentDecision!==CONTROLLED.decision||!['previousLedgerSHA256','recordsSHA256','priorAuditsSHA256','evidenceSHA256','reviewedBuildSHA256','reviewSHA256','noActiveProofSHA256'].every(k=>/^[a-f0-9]{64}$/.test(a[k]))||!/^NR-010-controlled-continuation-20261029[-a-z0-9]*\.md$/.test(a.reviewReference)||!Number.isFinite(Date.parse(a.recoveredAt))||a.recordsSHA256!==sha(JSON.stringify(d.records.slice(0,7)))||a.priorAuditsSHA256!==sha(JSON.stringify(d.recoveries.slice(0,2)))||d.records[6]?.status!=='stopped'||d.records[6].usage!==null)throw Error('budget-unavailable');
   if(!syntheticFile&&(a.previousLedgerSHA256!==CONTROLLED.ledger||a.evidenceSHA256!==CONTROLLED.evidence||a.recordsSHA256!==CONTROLLED.records||a.priorAuditsSHA256!==CONTROLLED.audits))throw Error('budget-unavailable');
  }
  let estimate=0;for(const [i,r]of d.records.entries()){
   if(!r||Object.keys(r).sort().join(',')!=='estimatedMicroUSD,index,reservedAt,reservedMicroUSD,stage,status,usage'||r.index!==i||r.stage!=='question-rank'||r.reservedMicroUSD!==300000||!['reserved','accepted','rejected','stopped'].includes(r.status)||typeof r.reservedAt!=='string'||Number.isNaN(Date.parse(r.reservedAt)))throw Error('budget-unavailable');
   if(r.usage!==null){if(!usageValid(r.usage)||r.estimatedMicroUSD!==estimateUsage(r.usage))throw Error('budget-unavailable');estimate+=r.estimatedMicroUSD;}else if(r.estimatedMicroUSD!==null)throw Error('budget-unavailable');
   if(['accepted','rejected'].includes(r.status)&&!r.usage||r.status==='stopped'&&!d.stopped&&!(d.version>=2&&i===0||d.version>=3&&i===2||d.version===4&&i===6))throw Error('budget-unavailable');
  }if(estimate!==d.estimatedMicroUSD)throw Error('budget-unavailable');return d;
 };
 function transaction(fn){
  if(fault)throw Error(fault);let lock,writing=false,durable=false;
  try{
   const parent=fs.realpathSync(path.dirname(file));if(parent!==path.dirname(file)||!parent.startsWith(fs.realpathSync('.')+path.sep)||fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile()||fs.statSync(file).size>100000)throw Error('budget-unavailable');
   lock=fs.openSync(file+'.lock','wx',0o600);if(fs.existsSync(file+'.pending'))throw Error('budget-unavailable');const raw=fs.readFileSync(file,'utf8'),d=check(JSON.parse(raw));fn?.(d,sha(raw));
   if(fn){check(d);writing=true;const pending=file+'.pending',fd=fs.openSync(pending,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(d,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(pending,file);syncDirectory(parent);durable=true;}return d;
  }catch(e){if(['quota-exhausted','live-run-stopped','busy','dispatch-paused'].includes(e.message))throw e;fault='budget-unavailable';throw Error(fault);}
  finally{if(lock!==undefined){fs.closeSync(lock);if(!writing||durable)fs.unlinkSync(file+'.lock');}}
 }
 return {policy:SUBMISSION_POLICY,
  // Trusted LOCAL operator only. No HTTP/env/startup caller. This deliberately
  // supports only the one evidenced legacy application-validation failure, not
  // arbitrary future stops, transport/security faults or pending requests.
  reviewedRecovery(options){
   const required=['expectedLedgerSHA256','reviewedBuildSHA256','reviewReference','reviewSHA256','approval','parentDecision','evidenceSHA256'];
   if(!options||Object.keys(options).sort().join(',')!==required.sort().join(',')||options.approval!==SUBMISSION_POLICY.approval||options.parentDecision!=='NR011-reviewed-material-fix-zero-credit-continuation'||!['expectedLedgerSHA256','reviewedBuildSHA256','reviewSHA256','evidenceSHA256'].every(k=>/^[a-f0-9]{64}$/.test(options[k]))||!/^NR-011-cycle-2[-a-z0-9]*\.md$/.test(options.reviewReference))throw Error('recovery-not-authorised');
   transaction((d,hash)=>{
    if(hash!==options.expectedLedgerSHA256||d.version!==1||!d.stopped||d.reserved!==1||d.committedMicroUSD!==300000||d.estimatedMicroUSD!==0||d.records[0].status!=='stopped'||d.records[0].usage!==null||d.records[0].estimatedMicroUSD!==null)throw Error('recovery-ineligible');
    // Production is pinned to exact owned failure AND frozen compiled sources.
    // Synthetic journals never provide evidence authority for the actual file.
    if(!syntheticFile){
     if(file!==fileURLToPath(new URL('../artifacts/NR-011/overnight-eval-1/budget.json',import.meta.url)))throw Error('recovery-ineligible');
     if(hash!=='8d37a4d1b263b7aaf3fa0f2a89a33d82041ab444057c94f8c950e258261fac74'||options.evidenceSHA256!=='eb6428f8a5418e84fbf5411c355511f3fcdc3a6c7925380a36997b2a941abb67')throw Error('recovery-ineligible');
     for(const [p,h]of [['artifacts/NR-011/live-eval-1/B-rank-response.json',options.evidenceSHA256],['artifacts/NR-011/cycle-1/source-final/lib/ai.mjs','c0fe985855232d739df00080e64a575b3766f8c1d1ce1efe9c629c184b400f45'],['artifacts/NR-011/cycle-1/source-final/public/lib/question.mjs','7e9fb6d032f9fe41061eb7a3857d7d9ed0da08c1b59636fe7aa646361dd64d26']])if(sha(readRegular(p))!==h)throw Error('recovery-evidence-mismatch');
     if(reviewedBuildHash()!==options.reviewedBuildSHA256||sha(readRegular(path.resolve('../Newsren/docs/reviews',options.reviewReference)))!==options.reviewSHA256)throw Error('recovery-review-mismatch');
    }else{
     // Synthetic evidence is explicitly local/nonproduction, but exercises the
     // same build/review/source and completed-application-failure bindings.
     const dir=path.dirname(file),raw=readRegular(path.join(dir,'synthetic-evidence.json')),e=JSON.parse(raw);
     if(sha(raw)!==options.evidenceSHA256||JSON.stringify(Object.keys(e).sort())!==JSON.stringify(['classification','identityVerified','providerStatus','sourceSHA256','toolCallCount'])||e.classification!=='application-validation'||e.identityVerified!==true||e.providerStatus!=='completed'||e.toolCallCount!==0||sha(readRegular(path.join(dir,'synthetic-source.mjs')))!==e.sourceSHA256)throw Error('recovery-evidence-mismatch');
     if(reviewedBuildHash()!==options.reviewedBuildSHA256||sha(readRegular(path.join(dir,options.reviewReference)))!==options.reviewSHA256)throw Error('recovery-review-mismatch');
    }
    d.version=2;d.recoveries=[{index:0,recoveredAt:new Date().toISOString(),previousLedgerSHA256:hash,recordSHA256:sha(JSON.stringify(d.records[0])),reviewedBuildSHA256:options.reviewedBuildSHA256,reviewReference:options.reviewReference,reviewSHA256:options.reviewSHA256,approval:options.approval,parentDecision:options.parentDecision,evidenceSHA256:options.evidenceSHA256,countDelta:0,moneyDelta:0}];d.stopped=false;
   });return this.state();
  },
  // Separate V2-only continuation for the exact second evidenced failure.
  // The original V1 recovery above remains one-shot and unchanged in authority.
  reviewedCompletionRecovery(options){
   const required=['expectedLedgerSHA256','reviewedBuildSHA256','reviewReference','reviewSHA256','approval','parentDecision','evidenceSHA256'];
   if(!options||Object.keys(options).sort().join(',')!==required.sort().join(',')||options.approval!==COMPLETION.approval||options.parentDecision!==COMPLETION.decision||!['expectedLedgerSHA256','reviewedBuildSHA256','reviewSHA256','evidenceSHA256'].every(k=>/^[a-f0-9]{64}$/.test(options[k]))||typeof options.reviewReference!=='string'||!/^NR-010-matching-recovery-20261028[-a-z0-9]*\.md$/.test(options.reviewReference))throw Error('recovery-not-authorised');
   transaction((d,hash)=>{
    if(hash!==options.expectedLedgerSHA256||d.version!==2||!d.stopped||d.reserved!==3||d.committedMicroUSD!==900000||d.estimatedMicroUSD!==8065||d.records[0].status!=='stopped'||d.records[0].usage!==null||d.records[1].status!=='accepted'||JSON.stringify(d.records[1].usage)!=='{"input_tokens":1247,"output_tokens":299}'||d.records[2].status!=='stopped'||JSON.stringify(d.records[2].usage)!=='{"input_tokens":2924,"output_tokens":798}')throw Error('recovery-ineligible');
    if(!syntheticFile){
     if(file!=='/Users/niloyfaiyaz/Documents/Newsren-v2/artifacts/NR-011/overnight-eval-1/budget.json'||file!==fileURLToPath(new URL('../artifacts/NR-011/overnight-eval-1/budget.json',import.meta.url))||hash!==COMPLETION.ledger||options.evidenceSHA256!==COMPLETION.evidence||sha(JSON.stringify(d.records))!==COMPLETION.records||sha(JSON.stringify(d.recoveries[0]))!==COMPLETION.audit0)throw Error('recovery-ineligible');
     for(const [p,h]of [['artifacts/NR-011/live-eval-3/B2-main-response.json',COMPLETION.evidence],['artifacts/NR-011/cycle-2/source-final/lib/ai.mjs','39bd164f46426cd6921a39e9f2e0b8de9d0f81aefe6fa84bc65ffa0ee2d687f7'],['artifacts/NR-011/cycle-2/source-final/public/lib/question.mjs','609eb2794eab7e8bde9e95f99592ec780cb4002ef5df6dc74008204e02c8b1ca']])if(sha(readRegular(p))!==h)throw Error('recovery-evidence-mismatch');
     if(reviewedBuildHash()!==options.reviewedBuildSHA256||sha(readRegular(path.resolve('../Newsren/docs/reviews',options.reviewReference)))!==options.reviewSHA256)throw Error('recovery-review-mismatch');
    }else{
     const dir=path.dirname(file),raw=readRegular(path.join(dir,'synthetic-evidence.json')),e=JSON.parse(raw);
     if(sha(raw)!==options.evidenceSHA256||JSON.stringify(Object.keys(e).sort())!==JSON.stringify(['classification','identityVerified','providerStatus','sourceSHA256','toolCallCount'])||e.classification!=='application-validation'||e.identityVerified!==true||e.providerStatus!=='completed'||e.toolCallCount!==0||sha(readRegular(path.join(dir,'synthetic-source.mjs')))!==e.sourceSHA256)throw Error('recovery-evidence-mismatch');
     if(reviewedBuildHash()!==options.reviewedBuildSHA256||sha(readRegular(path.join(dir,options.reviewReference)))!==options.reviewSHA256)throw Error('recovery-review-mismatch');
    }
    d.recoveries.push({index:2,recoveredAt:new Date().toISOString(),previousLedgerSHA256:hash,recordSHA256:sha(JSON.stringify(d.records[2])),recordsSHA256:sha(JSON.stringify(d.records)),firstAuditSHA256:sha(JSON.stringify(d.recoveries[0])),reviewedBuildSHA256:options.reviewedBuildSHA256,reviewReference:options.reviewReference,reviewSHA256:options.reviewSHA256,approval:options.approval,parentDecision:options.parentDecision,evidenceSHA256:options.evidenceSHA256,countDelta:0,moneyDelta:0});d.version=3;d.stopped=false;
   });return this.state();
  },
  reviewedControlledRecovery(options){
   const keys=['expectedLedgerSHA256','reviewedBuildSHA256','reviewReference','reviewSHA256','approval','parentDecision','evidenceSHA256','noActiveProofSHA256'];
   if(!options||Object.keys(options).sort().join(',')!==keys.sort().join(',')||options.approval!==CONTROLLED.approval||options.parentDecision!==CONTROLLED.decision||!['expectedLedgerSHA256','reviewedBuildSHA256','reviewSHA256','evidenceSHA256','noActiveProofSHA256'].every(k=>/^[a-f0-9]{64}$/.test(options[k]))||!/^NR-010-controlled-continuation-20261029[-a-z0-9]*\.md$/.test(options.reviewReference))throw Error('recovery-not-authorised');
   transaction((d,hash)=>{
    if(hash!==options.expectedLedgerSHA256||d.version!==3||!d.stopped||d.reserved!==7||d.committedMicroUSD!==2100000||d.estimatedMicroUSD!==28921||d.records.map(r=>r.status).join(',')!=='stopped,accepted,stopped,rejected,accepted,accepted,stopped'||d.records[6].usage!==null)throw Error('recovery-ineligible');
    const base=syntheticFile?path.dirname(file):path.resolve('artifacts/NR-010/controlled-continuation-20261029');
    if(fs.existsSync(path.join(base,'dispatch-control/runtime.lock')))throw Error('recovery-ineligible');
    if(!syntheticFile&&(file!=='/Users/niloyfaiyaz/Documents/Newsren-v2/artifacts/NR-011/overnight-eval-1/budget.json'||file!==fileURLToPath(new URL('../artifacts/NR-011/overnight-eval-1/budget.json',import.meta.url))||hash!==CONTROLLED.ledger||sha(JSON.stringify(d.records))!==CONTROLLED.records||sha(JSON.stringify(d.recoveries))!==CONTROLLED.audits||options.evidenceSHA256!==CONTROLLED.evidence))throw Error('recovery-ineligible');
    if(sha(readRegular(path.join(base,'reconciliation.json')))!==options.evidenceSHA256)throw Error('recovery-evidence-mismatch');
    const proofRaw=readRegular(path.join(base,'no-active-proof.json')),proof=JSON.parse(proofRaw);
    if(sha(proofRaw)!==options.noActiveProofSHA256||Object.keys(proof).sort().join(',')!=='activeNativeAgents,ledgerSHA256,observedAt,port3001Listening,previewProcessesAbsent,reviewedBuildSHA256'||proof.activeNativeAgents!==0||proof.port3001Listening!==false||proof.previewProcessesAbsent!==true||proof.ledgerSHA256!==hash||proof.reviewedBuildSHA256!==options.reviewedBuildSHA256||!Number.isFinite(Date.parse(proof.observedAt))||Date.now()-Date.parse(proof.observedAt)<0||Date.now()-Date.parse(proof.observedAt)>300000)throw Error('recovery-evidence-mismatch');
    if(reviewedBuildHash()!==options.reviewedBuildSHA256||sha(readRegular(syntheticFile?path.join(base,options.reviewReference):path.resolve('../Newsren/docs/reviews',options.reviewReference)))!==options.reviewSHA256)throw Error('recovery-review-mismatch');
    d.recoveries.push({index:6,recoveredAt:new Date().toISOString(),previousLedgerSHA256:hash,recordsSHA256:sha(JSON.stringify(d.records)),priorAuditsSHA256:sha(JSON.stringify(d.recoveries)),reviewedBuildSHA256:options.reviewedBuildSHA256,reviewReference:options.reviewReference,reviewSHA256:options.reviewSHA256,approval:options.approval,parentDecision:options.parentDecision,evidenceSHA256:options.evidenceSHA256,noActiveProofSHA256:options.noActiveProofSHA256,countDelta:0,moneyDelta:0});d.version=4;d.stopped=false;
   });return this.state();
  },
  state(){try{const d=transaction();const reason=d.version===4&&(!isControlledDispatch(dispatchControl)||!dispatchControl.ready(d.recoveries[2].reviewedBuildSHA256))?'dispatch-paused':d.stopped||d.records.some(r=>r.status==='reserved')?'live-run-stopped':d.reserved>=30||d.committedMicroUSD+300000>3000000?'quota-exhausted':null;return {state:reason?'unavailable':'configured',reason,id:SUBMISSION_POLICY.id,limit:30,reserved:d.reserved,remaining:30-d.reserved,capMicroUSD:3000000,committedMicroUSD:d.committedMicroUSD,estimatedMicroUSD:d.estimatedMicroUSD,remainingMicroUSD:3000000-d.committedMicroUSD};}catch{return {state:'unavailable',reason:fault||'budget-unavailable',remaining:0};}},
  reserve(stage='question-rank'){if(stage!=='question-rank')throw Error('hosted-search-disabled');let index;transaction(d=>{if(d.version===4&&(!isControlledDispatch(dispatchControl)||!dispatchControl.ready(d.recoveries[2].reviewedBuildSHA256)||!dispatchControl.claimed()))throw Error('dispatch-paused');if(d.stopped||d.records.some(r=>r.status==='reserved'))throw Error('live-run-stopped');if(d.reserved>=30||d.committedMicroUSD+300000>3000000)throw Error('quota-exhausted');index=d.reserved++;d.committedMicroUSD+=300000;d.records.push({index,stage,reservedAt:new Date().toISOString(),reservedMicroUSD:300000,status:'reserved',usage:null,estimatedMicroUSD:null});});return index;},
  record(index,{accepted=false,usage=null,recoverableApplicationRejection=false}={}){transaction(d=>{const r=d.records[index];if(!r||r.status!=='reserved')throw Error('budget-unavailable');const valid=usageValid(usage);r.usage=valid?{input_tokens:usage.input_tokens,output_tokens:usage.output_tokens}:null;r.estimatedMicroUSD=valid?estimateUsage(usage):null;if(valid)d.estimatedMicroUSD+=r.estimatedMicroUSD;r.status=accepted&&valid?'accepted':recoverableApplicationRejection===true&&valid?'rejected':'stopped';if(r.status==='stopped')d.stopped=true;});}
 };
}
const usageValid=u=>u&&Object.keys(u).every(k=>['input_tokens','output_tokens','total_tokens'].includes(k))&&Number.isInteger(u.input_tokens)&&u.input_tokens>=0&&u.input_tokens<=272000&&Number.isInteger(u.output_tokens)&&u.output_tokens>=0&&u.output_tokens<=8000&&(u.total_tokens===undefined||u.total_tokens===u.input_tokens+u.output_tokens);
const estimateUsage=u=>Math.ceil((u.input_tokens*750000+u.output_tokens*4500000)/1000000);
// Synthetic initial state for focused tests only; cannot provision production credit.
export function syntheticSubmissionState(){return initial();}

// Deterministic application source binding; no secrets/history/ledger/profile reads.
function readRegular(p){const absolute=path.resolve(p);if(fs.realpathSync(absolute)!==absolute||!fs.lstatSync(absolute).isFile())throw Error('recovery-evidence-mismatch');return fs.readFileSync(absolute);}
export function reviewedBuildHash(){
 const files=['server.mjs','package.json'];
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith('.'))continue;const p=dir+'/'+e.name;if(e.isSymbolicLink())throw Error('recovery-review-mismatch');if(e.isDirectory())walk(p);else if(e.isFile())files.push(p);}}
 for(const d of ['lib','public','tests'])walk(d);
 return sha(files.sort().map(p=>p+'\0'+sha(readRegular(p))+'\n').join(''));
}
