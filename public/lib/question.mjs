import {literalQualifiers,societyDependent} from './practice.mjs';
export const ROLES=['support','counterargument','qualification','context'];
export function workspace(){return {text:'',society:'Singapore',practiceId:null,scope:'',gaps:'',selected:[],excluded:[],roles:{},usage:{},query:'',shortlist:false,external:false,results:null,revision:null,status:'',searchStatus:'',candidates:[]};}
export function bankRevision(cards){return JSON.stringify(cards);}
export const displaySociety=q=>societyDependent(q.text)?q.society:'Global question';
export const evidenceSociety=q=>societyDependent(q.text)?q.society:null;
export const requestSociety=q=>societyDependent(q.text)?q.society:'Global; follow any locations named in the exact question';
export function validateContext(q){
 if(societyDependent(q.text)&&(typeof q.society!=='string'||!q.society.trim()||q.society.length>120))throw Error('Enter a specific society of 1–120 characters. Your exact question is unchanged.');
 if(!q.text.trim()||q.text.length>1000||q.scope.length>2000||q.gaps.length>2000)throw Error('Enter a question of up to 1,000 characters; scope and gaps may each use 2,000.');
}
export function clearAssessment(q){q.results=null;q.revision=null;q.status='Coverage not assessed; explicit reassessment required.';}
// Version 2 is a lossless bounded projection, never a shortlist or keyword filter.
export const BANK_LIMITS=Object.freeze({cards:100,projectionBytes:80000,bodyBytes:96000});
const bytes=s=>new TextEncoder().encode(s).length;
// Application JSON-byte contract, NOT a model token/encoding or semantic guarantee.
// Bytes include JSON escaping, quotes, keys, IDs and anchors; no field is sliced.
export const RANK_OUTPUT_LIMITS=Object.freeze({resultBytes:1800,gapsBytes:1200,totalBytes:32000});
export function bankOutputAdmission(p){
 const framing=bytes(JSON.stringify({version:2,results:[],gaps:[]}))-2;
 const outputBytes=framing+p.cards.length*RANK_OUTPUT_LIMITS.resultBytes+Math.max(0,p.cards.length-1)+RANK_OUTPUT_LIMITS.gapsBytes;
 // Reserve a complete useful-shaped envelope with all role/basis labels, one
 // minimum-length anchor, and four short prose fields. Each reserved code unit
 // uses the longest JSON escape (6 bytes); source/card IDs are measured exactly.
 // This is conservative application admission, not proof that meaningful prose
 // or every model completion will fit, nor that this synthetic anchor is valid.
 const identityFits=p.cards.every(c=>{
  const sourceId=c.sources.reduce((longest,s)=>bytes(JSON.stringify(s.id))>bytes(JSON.stringify(longest))?s.id:longest,'');
  return bytes(JSON.stringify({id:c.id,disposition:'useful',explanation:'\u0000'.repeat(40),evidence:'\u0000'.repeat(40),roles:ROLES,limits:'\u0000'.repeat(40),context:'\u0000'.repeat(40),basis:['source-reporting','Newsren-summary','Newsren-inference','evidence-gap'],anchors:[{field:'evidence',index:39,sourceId,quote:'\u0000'.repeat(15)}]}))<=RANK_OUTPUT_LIMITS.resultBytes;
 });
 return {outputBytes,outputAdmitted:identityFits&&outputBytes<=RANK_OUTPUT_LIMITS.totalBytes};
}
const only=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>ks.includes(k));
const text=(v,n=12000)=>typeof v==='string'&&v.length<=n;
const strings=(v,n=40)=>Array.isArray(v)&&v.length<=n&&v.every(x=>text(x));
const sourceFields=['id','publisher','publicationDate','datePrecision','accessLevel','availability','jurisdiction','excerpt','excerptFidelity','excerptAssurance','figureDiscrepancyNote','publicationDateAssurance','publicationZone','sourceAsOf','updatedAt'];
export function validateBankPacket(p){
 const bad=()=>{throw Error('invalid-input');};
 if(!only(p,['version','question','society','cards'])||p.version!==2||!text(p.question,1000)||!p.question.trim()||p.society!==undefined&&(!text(p.society,120)||!p.society.trim())||!Array.isArray(p.cards))bad();
 if(p.cards.length>BANK_LIMITS.cards||bytes(JSON.stringify(p))>BANK_LIMITS.projectionBytes)throw Error('context-limit');
 const ids=new Set();for(const c of p.cards){
  if(!only(c,['id','title','gist','evidence','limitations','contentVersion','eventDate','eventDatePrecision','qualification','sources'])||!text(c.id,100)||!c.id||ids.has(c.id)||!text(c.title,500)||!text(c.gist)||!text(c.limitations)||!text(c.contentVersion,200)||!(c.eventDate===null||text(c.eventDate,10))||!text(c.eventDatePrecision,40)||!strings(c.evidence)||!strings(c.qualification)||!Array.isArray(c.sources)||c.sources.length>8)bad();
  ids.add(c.id);const refs=new Set();for(const s of c.sources){if(!only(s,sourceFields)||!text(s.id,100)||!s.id||refs.has(s.id)||!sourceFields.every(k=>s[k]===undefined||s[k]===null&&['publicationDate','sourceAsOf','updatedAt'].includes(k)||text(s[k])))bad();refs.add(s.id);}
 }
 return p;
}
export function questionPacket(q,cards,corpus=null){
 validateContext(q);
 const packet={version:2,question:q.text,...(societyDependent(q.text)?{society:q.society}:{}),cards:cards.map(c=>{
  const current=corpus?.articles.find(a=>a.id===c.id&&a.contentVersion===c.contentVersion);
  const qualification=current?[...(current.contentNotes||[]),...(current.contentWarning?[current.contentWarning]:[]),...(current.evidenceApplications||[]).map(x=>x.limitations),...(current.corrections||[]).map(x=>'Current version correction: '+x.description)]:c.contentVersion==='external-selected-excerpt-v1'?['External retrieved selected excerpt only, not a curated corpus article or a full article. Search snippet is not evidence. Publication metadata is not event occurrence; question relevance requires assessment.']:['Legacy saved context only; optional advisories omitted at save cannot be recovered. No current-version substitution.'];
  return {id:c.id,title:c.title,gist:c.gist,evidence:[...c.evidence],limitations:c.limitations,contentVersion:c.contentVersion,eventDate:c.eventDate,eventDatePrecision:c.eventDatePrecision||'unknown',qualification,sources:c.sources.map(s=>{
   const r={};for(const k of sourceFields)if(s[k]!==undefined)r[k]=s[k];
   // Older source records have no ID; bind a stable card-local identity without inventing facts.
   r.id=s.id||c.id+'-source-'+c.sources.indexOf(s);r.publicationDate=s.publicationDisplay?.day??s.publicationDate;r.publicationDateAssurance=s.publicationDisplayAssurance||'Legacy stored date; timezone and assurance not recorded.';r.publicationZone=s.publicationDisplay?.label||'Legacy zone unknown';return r;
  })};
 })};
 return validateBankPacket(packet);
}
const resultFields=['id','disposition','explanation','evidence','roles','limits','context','basis','anchors'];
const bases=['source-reporting','Newsren-summary','Newsren-inference','evidence-gap'];
// Diagnostics contain only fixed rule/path names and numeric positions/sizes.
// Never include IDs, unknown keys, prose, questions, source text or provider envelopes.
export function validateBankRanking(v,p){
 const fail=(rule,path='root',counts={})=>{const e=Error('invalid-provider-output');e.reason='bank-'+rule;e.diagnostics={stage:'bank-output',rule,path,...counts};throw e;};
 const prose=t=>text(t,600)&&!/<|https?:\/\//i.test(t);
 if(!only(v,['version','results','gaps'])||Object.keys(v).length!==3||v.version!==2)fail('shape');
 if(!Array.isArray(v.results))fail('results-shape','results');
 const identitySeen=new Set(),allowedIds=new Set(p.cards.map(c=>c.id));
 for(const [i,r] of v.results.entries()){
  if(!r||typeof r!=='object'||typeof r.id!=='string')fail('result-shape','results',{item:i});
  if(!allowedIds.has(r.id))fail('unknown-card','results.id',{item:i});
  if(identitySeen.has(r.id))fail('duplicate-card','results.id',{item:i});
  identitySeen.add(r.id);
 }
 if(v.results.length!==p.cards.length)fail('coverage','results',{expected:p.cards.length,actual:v.results.length});
 if(!Array.isArray(v.gaps)||v.gaps.length>8)fail('gaps-shape','gaps');
 for(const [i,g]of v.gaps.entries())if(!prose(g)||!g.trim())fail('gap-prose','gaps',{item:i});
 if(!bankOutputAdmission(p).outputAdmitted)fail('output-admission');
 const total=bytes(JSON.stringify(v)),gapBytes=bytes(JSON.stringify(v.gaps));
 if(total>RANK_OUTPUT_LIMITS.totalBytes)fail('total-bytes','root',{actual:total,maximum:RANK_OUTPUT_LIMITS.totalBytes});
 if(gapBytes>RANK_OUTPUT_LIMITS.gapsBytes)fail('gaps-bytes','gaps',{actual:gapBytes,maximum:RANK_OUTPUT_LIMITS.gapsBytes});
 const seen=new Set();for(const [i,r]of v.results.entries()){
  if(!only(r,resultFields)||Object.keys(r).length!==resultFields.length)fail('result-shape','results',{item:i});
  const n=bytes(JSON.stringify(r));if(n>RANK_OUTPUT_LIMITS.resultBytes)fail('result-bytes','results',{item:i,actual:n,maximum:RANK_OUTPUT_LIMITS.resultBytes});
  const c=p.cards.find(c=>c.id===r.id);
  if(!c||seen.has(r.id))fail('card-membership','results.id',{item:i});
  if(!['useful','not-useful','insufficient-retained-evidence'].includes(r.disposition))fail('disposition','results.disposition',{item:i});
  for(const k of ['explanation','evidence','limits','context'])if(!prose(r[k]))fail('prose','results.'+k,{item:i});
  if(!r.explanation.trim()||!r.limits.trim())fail('required-prose','results',{item:i});
  if(!Array.isArray(r.roles)||r.roles.length>4||new Set(r.roles).size!==r.roles.length||!r.roles.every(x=>ROLES.includes(x)))fail('roles','results.roles',{item:i});
  if(!Array.isArray(r.basis)||!r.basis.length||r.basis.length>4||new Set(r.basis).size!==r.basis.length||!r.basis.every(x=>bases.includes(x)))fail('basis','results.basis',{item:i});
  if(!Array.isArray(r.anchors)||r.anchors.length>4)fail('anchors-shape','results.anchors',{item:i});
  if(r.disposition==='useful'){if(!r.evidence.trim()||!r.context.trim()||!r.roles.length||!r.anchors.length)fail('useful-required','results',{item:i});}
  else if(r.roles.length||r.anchors.length||r.evidence)fail('nonuseful-fields','results',{item:i});
  for(const [j,a]of r.anchors.entries()){
   const position={item:i,anchor:j};
   if(!only(a,['field','index','sourceId','quote'])||Object.keys(a).length!==4||!Number.isInteger(a.index)||!text(a.quote,240)||!a.quote.trim()||a.quote.length<15)fail('anchor-shape','results.anchors',position);
   let passage;if(a.field==='excerpt'){const source=c.sources.find(s=>s.id===a.sourceId);if(a.index!==0||!source)fail('anchor-source','results.anchors',position);passage=source.excerpt;}
   else if(a.field==='evidence'){if(a.sourceId!==''||a.index<0)fail('anchor-evidence-index','results.anchors',position);passage=c.evidence[a.index];}
   else if(a.field==='gist'){if(a.sourceId!==''||a.index!==0||!r.roles.every(x=>x==='context')||!r.basis.includes('Newsren-summary'))fail('anchor-gist-context','results.anchors',position);passage=c.gist;}
   else fail('anchor-field','results.anchors',position);
   if(typeof passage!=='string'||!passage.includes(a.quote))fail('anchor-membership','results.anchors',position);
  }seen.add(r.id);
 }
 return v;
}
// A navigation/edit generation is necessary even for A→B→A and ignored aborts.
export function assessmentEpoch(){let generation=0,active=null;return {
 cancel(){generation++;active?.controller.abort();active=null;},
 begin(context){this.cancel();const token={id:generation,context,controller:new AbortController()};active=token;return token;},
 current(token,context){return active===token&&generation===token.id&&!token.controller.signal.aborted&&context===token.context;},
 finish(token){if(active===token){active=null;return true;}return false;}
};}
export function invalidate(q,cards){if(q.revision!==null&&q.revision!==bankRevision(cards)){clearAssessment(q);return true;}return false;}
