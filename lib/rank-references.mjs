import {createHash} from 'node:crypto';

// Private generation contract only. Membership is not semantic entailment.
export const REFERENCE_WIRE='bank-references-1';
const exactKeys=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===ks.length&&Object.keys(v).every(k=>ks.includes(k));
const resultKeys=['id','disposition','explanation','evidence','roles','limits','context','basis','anchors'];
function fail(rule,path='root',counts={}){
 const e=Error('invalid-provider-output');e.reason='bank-'+rule;e.diagnostics={stage:'bank-output',rule,path,...counts};throw e;
}
// UTF-16 offsets match String.slice and the public quote length guard. Never
// bisect a surrogate pair. Every eligible field remains whole in untrustedBank.
const boundary=(text,n)=>n>0&&n<text.length&&/[\uD800-\uDBFF]/.test(text[n-1])&&/[\uDC00-\uDFFF]/.test(text[n])?n-1:n;
export function referenceSpans(text){
 if(typeof text!=='string'||text.length<15)return [];
 const spans=[];let start=0;
 while(start<text.length){
  let end=boundary(text,Math.min(start+220,text.length));
  if(end<text.length){
   // Prefer complete sentences, then words; no deletion/normalisation. Short
   // tails overlap the preceding span so every character remains selectable.
   const chunk=text.slice(start,end),sentences=[...chunk.matchAll(/[.!?][”’"']?(?:\s+|$)/gu)];
   const sentence=sentences.at(-1);const sentenceEnd=sentence?start+sentence.index+sentence[0].length:0;
   if(sentenceEnd-start>=60)end=sentenceEnd;
   else {const spaces=[...chunk.matchAll(/\s+/gu)],last=spaces.at(-1);if(last&&last.index>=60)end=start+last.index+last[0].length;}
  }
  if(text.length-end>0&&text.length-end<15)end=boundary(text,text.length-15);
  if(end-start<15){start=boundary(text,Math.max(0,text.length-220));end=text.length;}
  const quote=text.slice(start,end);
  if(quote.length>=15&&quote.length<=240&&quote.trim())spans.push({start,end,quote});
  if(end===text.length)break;
  start=end;
 }
 return spans;
}
// Called only with an already validated minimal packet. Opaque references bind
// the entire request, root position/identity, field/index/source, and exact span.
export function referenceCatalogue(packet){
 const requestHash=createHash('sha256').update(JSON.stringify(packet)).digest('hex');
 const catalogue=[];const issued=new Set();
 for(const [cardIndex,card] of packet.cards.entries()){
  const fields=[{field:'gist',index:0,sourceId:'',text:card.gist},...card.evidence.map((text,index)=>({field:'evidence',index,sourceId:'',text})),...card.sources.map(s=>({field:'excerpt',index:0,sourceId:s.id,text:s.excerpt}))];
  for(const {text,...location} of fields)for(const span of referenceSpans(text)){
   const ref='r_'+createHash('sha256').update(JSON.stringify([requestHash,cardIndex,card.id,location,span])).digest('hex').slice(0,24);
   if(issued.has(ref))throw Error('context-limit');issued.add(ref);
   catalogue.push({ref,cardId:card.id,...location,...span});
  }
 }
 return catalogue;
}
export function decodeRankReferences(value,packet,catalogue){
 if(!exactKeys(value,['version','results','gaps'])||value.version!==REFERENCE_WIRE)fail('reference-shape');
 if(!Array.isArray(value.results))fail('results-shape','results');
 const allowed=new Set(packet.cards.map(c=>c.id)),seen=new Set();
 // Preserve the public root identity prepass before looking at any anchors.
 for(const [item,r] of value.results.entries()){
  if(!r||typeof r!=='object'||typeof r.id!=='string')fail('result-shape','results',{item});
  if(!allowed.has(r.id))fail('unknown-card','results.id',{item});
  if(seen.has(r.id))fail('duplicate-card','results.id',{item});seen.add(r.id);
 }
 if(value.results.length!==packet.cards.length)fail('coverage','results',{expected:packet.cards.length,actual:value.results.length});
 if(Buffer.byteLength(JSON.stringify(value),'utf8')>32000)fail('reference-bytes');
 const refs=new Map(catalogue.map(r=>[r.ref,r]));
 return {version:2,results:value.results.map((r,item)=>{
  if(!exactKeys(r,resultKeys))fail('result-shape','results',{item});
  if(!Array.isArray(r.anchors)||r.anchors.length>4)fail('anchors-shape','results.anchors',{item});
  const anchors=r.anchors.map((a,anchor)=>{
   const position={item,anchor};
   if(!exactKeys(a,['ref'])||typeof a.ref!=='string')fail('reference-shape','results.anchors',position);
   const selected=refs.get(a.ref);
   if(!selected)fail('reference-unknown','results.anchors',position);
   if(selected.cardId!==r.id)fail('reference-card','results.anchors',position);
   const {field,index,sourceId,quote}=selected;
   return {field,index,sourceId,quote};
  });
  return {...r,anchors};
 }),gaps:value.gaps};
}
