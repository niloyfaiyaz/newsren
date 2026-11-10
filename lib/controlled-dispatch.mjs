// Temporary, trusted-local control plane. No HTTP provisioning and no environment bypass.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateBankPacket} from './question.mjs';
export const digest=v=>createHash('sha256').update(v).digest('hex');
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const CONTROL_DIR=path.join(ROOT,'artifacts/NR-010/controlled-continuation-20261029/dispatch-control');
const controllers=new WeakSet();
const fail=()=>{throw Error('dispatch-paused');};
function canonical(p,dir=false){if(path.resolve(p)!==p||fs.realpathSync(p)!==p)fail();const s=fs.lstatSync(p);if(s.uid!==process.getuid()||s.isSymbolicLink()||!(dir?s.isDirectory():s.isFile()))fail();return s;}
function directory(dir){canonical(dir,true);if((fs.statSync(dir).mode&0o077)!==0)fail();}
function sync(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function writeNew(p,v){const fd=fs.openSync(p,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(v,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}sync(path.dirname(p));}
function read(p){const s=canonical(p);if((s.mode&0o077)!==0||s.size>200000)fail();return JSON.parse(fs.readFileSync(p,'utf8'));}
function replace(p,v){writeNew(p+'.pending',v);fs.renameSync(p+'.pending',p);sync(path.dirname(p));}
function withLock(dir,fn){directory(dir);const p=path.join(dir,'operation.lock');let fd;try{fd=fs.openSync(p,'wx',0o600);return fn();}finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(p);sync(dir);}}}
function ownedDir(dir,synthetic){if(synthetic){const base=path.resolve('artifacts/NR-010/matching-recovery-20261028/synthetic-nonproduction-journals');if(!dir.startsWith(base+path.sep)||ROOT!==process.cwd()+path.sep)fail();}else if(dir!==CONTROL_DIR)fail();canonical(path.dirname(dir),true);}
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const identifier=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(x);
export function provisionControlledOwner({reviewedBuildSHA256,dir=CONTROL_DIR,synthetic=false}={}){
 ownedDir(dir,synthetic);if(!hex(reviewedBuildSHA256))fail();fs.mkdirSync(dir,{mode:0o700});
 const owner={version:1,leaseID:randomUUID(),token:randomBytes(32).toString('hex'),reviewedBuildSHA256,phase:'paused',grant:null};
 writeNew(path.join(dir,'owner.json'),owner);
 // Only an owned local file; never printed, served, put in a URL or client bundle.
 writeNew(path.join(dir,'browser-cookie.json'),{name:'newsren_owner',value:owner.token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Strict',secure:false});return {leaseID:owner.leaseID,phase:owner.phase};
}
export function grantControlledAction({dir=CONTROL_DIR,synthetic=false,requestID,initiatingAction,packet,expiresAt,parentAuthorisation}={}){
 ownedDir(dir,synthetic);if(!identifier(requestID)||!identifier(initiatingAction)||!identifier(parentAuthorisation)||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now()||Date.parse(expiresAt)>Date.now()+15*60000)fail();
 const p=validateBankPacket(packet);
 return withLock(dir,()=>{const o=read(path.join(dir,'owner.json'));if(o.phase!=='paused'||o.grant||fs.existsSync(path.join(dir,'request-'+requestID)))fail();
 o.grant={leaseID:o.leaseID,requestID,initiatingAction,parentAuthorisation,expiresAt,submittedIDs:p.cards.map(c=>c.id),questionSHA256:digest(p.question),packetSHA256:digest(JSON.stringify(p))};o.phase='armed';replace(path.join(dir,'owner.json'),o);return {requestID,phase:o.phase};});
}
export function isControlledDispatch(c){return controllers.has(c);}
export function createControlledDispatch({dir=CONTROL_DIR,synthetic=false,buildHash,auditSecrets=[]}={}){
 ownedDir(dir,synthetic);let leaseFD=null,fault=false,current=null;
 const ownerPath=path.join(dir,'owner.json');
 const owner=()=>{directory(dir);const o=read(ownerPath);if(Object.keys(o).sort().join(',')!=='grant,leaseID,phase,reviewedBuildSHA256,token,version'||!['paused','armed','claimed','halted'].includes(o.phase)||o.version!==1||!hex(o.token)||!identifier(o.leaseID)||!hex(o.reviewedBuildSHA256)||o.reviewedBuildSHA256!==buildHash)fail();return o;};
 function event(type,value){try{if(!current)fail();let redacted=false;
 const clean=v=>{if(typeof v==='string'){let t=v;for(const secret of [...auditSecrets,owner().token])if(typeof secret==='string'&&secret)t=t.replaceAll(secret,'[redacted]');t=t.replace(/\b(?:sk-[a-zA-Z0-9_-]+|Bearer\s+\S+)|\b(?:api[_ -]?key|authorization|password|secret)\s*[:=]\s*\S+|[\w.+-]+@[\w.-]+/gi,'[redacted]');if(t!==v)redacted=true;return t;}if(Array.isArray(v))return v.map(clean);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clean(x)]));return v;};
 const sanitized=clean(value);if(redacted){sanitized.auditRedacted=true;sanitized.captureIncomplete=true;}
 writeNew(path.join(current.dir,String(current.seq++).padStart(3,'0')+'-'+type+'.json'),sanitized);}catch{fault=true;fail();}}
 const api={
  acquire(){if(leaseFD!==null)fail();owner();leaseFD=fs.openSync(path.join(dir,'runtime.lock'),'wx',0o600);fs.writeFileSync(leaseFD,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));fs.fsyncSync(leaseFD);sync(dir);},
  close(){if(leaseFD!==null){fs.closeSync(leaseFD);leaseFD=null;fs.unlinkSync(path.join(dir,'runtime.lock'));sync(dir);}},
  ready(expectedBuild){try{return !fault&&leaseFD!==null&&owner().reviewedBuildSHA256===expectedBuild;}catch{return false;}},
  state(){try{const o=owner();return {state:!fault&&leaseFD!==null?o.phase:'paused',owner:true,leaseID:o.leaseID};}catch{return {state:'paused',owner:false};}},
  authenticate(cookie){try{if(fault||leaseFD===null)return false;const o=owner(),values=String(cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('newsren_owner='));if(values.length!==1)return false;const t=values[0].slice(14);return hex(t)&&timingSafeEqual(Buffer.from(t),Buffer.from(o.token));}catch{return false;}},
  begin(packet){const p=validateBankPacket(packet);if(fault||leaseFD===null||current)fail();return withLock(dir,()=>{const o=owner(),g=o.grant;
   if(o.phase!=='armed'||!g||Object.keys(g).sort().join(',')!=='expiresAt,initiatingAction,leaseID,packetSHA256,parentAuthorisation,questionSHA256,requestID,submittedIDs'||g.leaseID!==o.leaseID||!identifier(g.requestID)||!identifier(g.initiatingAction)||!identifier(g.parentAuthorisation)||!Number.isFinite(Date.parse(g.expiresAt))||Date.parse(g.expiresAt)<=Date.now()||g.packetSHA256!==digest(JSON.stringify(p))||g.questionSHA256!==digest(p.question)||JSON.stringify(g.submittedIDs)!==JSON.stringify(p.cards.map(c=>c.id)))fail();
   // Durable consumption precedes audit and reservation. Any partial crash stays paused/claimed.
   o.phase='claimed';o.grant=null;replace(ownerPath,o);
   const requestDir=path.join(dir,'request-'+g.requestID);fs.mkdirSync(requestDir,{mode:0o700});sync(dir);current={...g,dir:requestDir,seq:0,reservationIndex:null};
   event('intent',{requestID:g.requestID,leaseID:o.leaseID,initiatingAction:g.initiatingAction,submittedIDs:g.submittedIDs,questionSHA256:g.questionSHA256,packetSHA256:g.packetSHA256,model:'gpt-5.4-mini-2026-03-17',status:'claimed',packet:p});return {requestID:g.requestID};
  });},
  claimed(){try{return !fault&&leaseFD!==null&&!!current&&owner().phase==='claimed';}catch{return false;}},
  reserved(index){if(!Number.isInteger(index))fail();current.reservationIndex=index;event('reservation',{requestID:current.requestID,reservationIndex:index,status:'reserved'});},
  transport({httpStatus,requestID=null,errorCode='none'}={}){
   event('transport',{requestID:current.requestID,httpStatus:Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:null,providerRequestID:typeof requestID==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(requestID)?requestID:null,captureIncomplete:['capture-limit','invalid-envelope'].includes(errorCode),errorCode:['none','http-error','capture-limit','invalid-envelope'].includes(errorCode)?errorCode:'transport-error'});
  },
  captureModel(text,secrets=[]){
   if(typeof text!=='string')fail();const size=Buffer.byteLength(text),cap=96000;
   // Capture only actual model text, never an HTTP envelope. Do not repair output.
   let safe=text;for(const secret of secrets)if(typeof secret==='string'&&secret)safe=safe.replaceAll(secret,'[redacted]');safe=safe.replace(/\b(?:sk-[a-zA-Z0-9_-]+|Bearer\s+\S+)|\b(?:api[_ -]?key|authorization|password|secret)\s*[:=]\s*\S+|[\w.+-]+@[\w.-]+/gi,'[redacted]');
   const redacted=safe!==text;let capped=Buffer.byteLength(safe)>cap;if(capped)safe=Buffer.from(safe).subarray(0,cap).toString('utf8');
   event('model-text',{requestID:current.requestID,text:safe,originalSHA256:digest(text),originalBytes:size,redacted,captureIncomplete:redacted||capped,captureCapBytes:cap});
  },
  settle({outcome,usage=null,response=null,diagnostic='none',safeToContinue=false}={}){
   if(!['accepted','rejected','stopped','not-dispatched'].includes(outcome)||!['none','application-validation','provider-json','provider-no-text','provider-failure','cancelled','timeout','provider-incomplete','audit-failure','budget-unavailable','rank-model','rank-status','rank-tier','rank-tools','rank-usage','rank-response-identity'].includes(diagnostic))fail();
   const u=usage&&Number.isInteger(usage.input_tokens)&&Number.isInteger(usage.output_tokens)?{input_tokens:usage.input_tokens,output_tokens:usage.output_tokens}:null;
   event('outcome',{requestID:current.requestID,reservationIndex:current.reservationIndex,outcome,usage:u,diagnostic,response});
   withLock(dir,()=>{const o=owner();o.phase=safeToContinue?'paused':'halted';replace(ownerPath,o);});current=null;
  }
 };controllers.add(api);return api;
}
