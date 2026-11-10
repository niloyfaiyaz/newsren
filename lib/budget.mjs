import fs from 'node:fs';
import path from 'node:path';
// Single writer with exclusive per-operation lock; never deletes or refills a journal.
export function createBudget(env={}) {
 const limit=/^(0|[1-9]|1[0-2])$/.test(env.NEWSREN_AI_REQUEST_LIMIT||'0')?Number(env.NEWSREN_AI_REQUEST_LIMIT||0):0;
 const session=env.NEWSREN_EVAL_SESSION_ID||null, file=env.NEWSREN_AI_JOURNAL_PATH;
 let used=0, fault=null;
 const controlled=!!(session||file);
 const validSession=typeof session==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(session);
 if(controlled&&(!validSession||!file||!path.isAbsolute(file)||!file.startsWith(path.resolve('.')+path.sep)))fault='budget-unavailable';
 const check=d=>{
  if(!d||d.version!==1||d.session!==session||d.limit!==limit||!Number.isInteger(d.reserved)||d.reserved<0||d.reserved>limit||!Array.isArray(d.records)||d.records.length!==d.reserved)throw Error('budget-unavailable');
  return d;
 };
 function transaction(fn){
  if(fault)throw Error(fault);
  let lock;
  try {
   const parent=fs.realpathSync(path.dirname(file));if(!parent.startsWith(fs.realpathSync('.')+path.sep)||fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile()||fs.statSync(file).size>100000)throw Error();
   lock=fs.openSync(file+'.lock','wx',0o600);
   const d=check(JSON.parse(fs.readFileSync(file,'utf8')));fn?.(d);
   if(fn){const temp=file+'.pending';const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(d));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}
   used=d.reserved;return d;
  } catch {fault='budget-unavailable';throw Error(fault);}
  finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(file+'.lock');}}
 }
 // Operator must explicitly provision a session journal, avoiding unknown-session auto creation.
 if(controlled&&!fault)try{transaction();}catch{}
 let active;
 return {
  acquire(){if(controlled){if(fault)throw Error(fault);try{active=fs.openSync(file+'.active','wx',0o600);}catch{throw Error('busy');}}},
  release(){if(active!==undefined){fs.closeSync(active);active=undefined;fs.unlinkSync(file+'.active');}},
  state(){if(controlled&&!fault)try{transaction();}catch{}return {limit,reserved:used,remaining:Math.max(0,limit-used),session,mode:controlled?'persistent-session':'process-only',error:fault};},
  reserve(stage){if(fault)throw Error(fault);if(used>=limit)throw Error(limit?'quota-exhausted':'quota-disabled');let index;
   if(controlled)transaction(d=>{if(d.reserved>=limit)throw Error();index=d.reserved++;d.records.push({stage,reservedAt:new Date().toISOString(),status:'reserved'});});else index=used++;
   return index;
  },
  record(index,metadata){if(controlled)transaction(d=>{d.records[index]={...d.records[index],...metadata};});}
 };
}

// NR-010 proposal capability ONLY. This never provisions a journal or grants credit.
export const RANK_COST_POLICY=Object.freeze({session:'nr010-semantic-live-1',model:'gpt-5.4-mini-2026-03-17',endpoint:'https://api.openai.com/v1/responses',tier:'default',region:'standard',inputUSDPerMillion:0.75,outputUSDPerMillion:4.5,pricingEvidence:'2026-10-27:93d302a9b7a384877533bc3ab5bb48eebf4b56bd6add0f194095054b2a13f952',limit:6,capMicroUSD:750000,reserveMicroUSD:125000,inputTokenLimit:100000,outputTokenLimit:8000});
export function createRankBudget(env={},{testOnlyJournalPath=null}={}){
 const file=env.NEWSREN_RANK_JOURNAL_PATH,session=env.NEWSREN_EVAL_SESSION_ID;
 let fault=null;
 const policy=JSON.stringify(RANK_COST_POLICY);
 const expected=path.resolve('artifacts/NR-010/live-eval-1/budget.json');
 const synthetic=typeof testOnlyJournalPath==='string'&&file===testOnlyJournalPath&&file.startsWith(path.resolve('artifacts/NR-010/cycle-2/synthetic-nonproduction-journals')+path.sep);
 if(file!==expected&&!synthetic)fault='budget-unavailable';
 if(!file||!path.isAbsolute(file)||session!==RANK_COST_POLICY.session||env.NEWSREN_AI_REQUEST_LIMIT!=='6'||!file.startsWith(path.resolve('.')+path.sep))fault='budget-unavailable';
 function transaction(fn){
  if(fault)throw Error(fault);let lock;
  try{
   const parent=fs.realpathSync(path.dirname(file)),cwd=fs.realpathSync('.');
   if(!parent.startsWith(cwd+path.sep)||fs.lstatSync(file).isSymbolicLink()||!fs.lstatSync(file).isFile()||fs.statSync(file).size>100000)throw Error();
   lock=fs.openSync(file+'.lock','wx',0o600);
   const d=JSON.parse(fs.readFileSync(file,'utf8'));
   if(!d||Object.keys(d).sort().join(',')!=='policy,records,reserved,reservedMicroUSD,stopped,version'||d.version!==2||JSON.stringify(d.policy)!==policy||!Number.isInteger(d.reserved)||d.reserved<0||d.reserved>6||d.reservedMicroUSD!==d.reserved*125000||!Array.isArray(d.records)||d.records.length!==d.reserved||typeof d.stopped!=='boolean')throw Error();
   for(const [i,r] of d.records.entries())if(!r||r.index!==i||r.stage!=='question-rank'||r.reservedMicroUSD!==125000||!['reserved','accepted','stopped'].includes(r.status)||Object.keys(r).some(k=>!['index','stage','reservedMicroUSD','status','reservedAt','usage'].includes(k))||typeof r.reservedAt!=='string'||r.usage!==undefined&&r.usage!==null&&(!Number.isInteger(r.usage.input_tokens)||!Number.isInteger(r.usage.output_tokens)||r.usage.input_tokens<0||r.usage.output_tokens<0||Object.keys(r.usage).sort().join(',')!=='input_tokens,output_tokens'))throw Error();
   fn?.(d);
   if(fn){const temp=file+'.pending',fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(d));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);const dir=fs.openSync(parent,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
   return d;
  }catch(e){if(['quota-exhausted','live-run-stopped'].includes(e.message))throw e;fault='budget-unavailable';throw Error(fault);}
  finally{if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(file+'.lock');}}
 }
 return {
  state(){try{const d=transaction();return {state:d.stopped||d.records.some(r=>r.status==='reserved')?'unavailable':'configured',reason:d.stopped||d.records.some(r=>r.status==='reserved')?'live-run-stopped':d.reserved===6?'quota-exhausted':null,reserved:d.reserved,reservedMicroUSD:d.reservedMicroUSD,remaining:6-d.reserved};}catch{return {state:'unavailable',reason:fault||'budget-unavailable',remaining:0};}},
  reserve(){let index;transaction(d=>{if(d.stopped)throw Error('live-run-stopped');if(d.reserved>=6||d.reservedMicroUSD+125000>750000)throw Error('quota-exhausted');
   // An unreconciled reservation after restart is unknown usage; no replacement credit.
   if(d.records.some(r=>r.status==='reserved'))throw Error('live-run-stopped');
   index=d.reserved++;d.reservedMicroUSD+=125000;d.records.push({index,stage:'question-rank',reservedMicroUSD:125000,status:'reserved',reservedAt:new Date().toISOString()});});return index;},
  record(index,{accepted=false,usage=null}={}){transaction(d=>{const r=d.records[index];if(!r||r.status!=='reserved')throw Error();const valid=usage&&Number.isInteger(usage.input_tokens)&&Number.isInteger(usage.output_tokens)&&usage.input_tokens>=0&&usage.input_tokens<=100000&&usage.output_tokens>=0&&usage.output_tokens<=8000;r.usage=valid?{input_tokens:usage.input_tokens,output_tokens:usage.output_tokens}:null;r.status=accepted&&valid?'accepted':'stopped';if(r.status==='stopped')d.stopped=true;});}
 };
}
