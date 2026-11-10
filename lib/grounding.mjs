import {normalize} from './retrieval.mjs';
const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
const rejection=reason=>Object.assign(Error('invalid-provider-output'),{reason});
// Conservative completion vocabulary, scoped only to a selected scheduled event.
// Explicit future passive phrases are not claims that the event happened.
function completionWording(text){
 const description=text.replace(/\b(?:will be|to be|scheduled to be|planned to be) (?:held|adopted|launched|introduced|released|announced|issued|convened)\b/gi,'scheduled');
 return /\b(?:took place|held|adopted|convened|occurred|happened|launched|introduced|released|announced|issued)\b/i.test(description);
}
export function validateReply(v,p){
 if(!fields(v,['text','citations','basis'])||typeof v.text!=='string'||!v.text.trim())throw rejection('reply-schema');
 if(v.text.length>2200)throw rejection('reply-length');
 if(p.InferredRelationships?.some(r=>r.eventStatus==='scheduled')&&completionWording(v.text))throw rejection('reply-scheduled-event');
 if(/https?:\/\//i.test(v.text))throw rejection('reply-url');
 if(!Array.isArray(v.citations)||v.citations.length>8||!v.citations.every(id=>typeof id==='string'&&p.sources.some(s=>s.id===id)))throw rejection('citation-unknown');
 const citations=[...new Set(v.citations)];
 if(!Array.isArray(v.basis)||!v.basis.length||v.basis.length>4||!v.basis.every(x=>['source-reporting','Newsren-summary','Newsren-inference','evidence-gap'].includes(x)))throw rejection('reply-basis');
 if(!citations.length&&v.basis.some(x=>x!=='evidence-gap'))throw rejection('citation-missing');
 // Pair straight/curly quotes independently: a closing straight quote must never
 // open a span crossing into the next scare-quoted term. Ask is paraphrase-only.
 const text=normalize(v.text);
 const quotes=[...v.text.matchAll(/"([^"\n]*)"|“([^“”\n]*)”/g)];
 if(quotes.some(q=>(q[1]??q[2]).length>=15)||/(?:says?|said|states?|wrote|reports?|reads?|quote)\s*[: ,]*[“"]|according to [^.!?\n]{0,80}[“"]/i.test(v.text))throw rejection('reply-direct-quote');
 // Long copied spans remain disallowed even without quotation punctuation.
 const words=text.split(' '),sourceTexts=p.sources.flatMap(s=>[s.retrievedText,s.retainedExcerpt?.text]).filter(s=>typeof s==='string').map(normalize);
 for(let i=0;i+15<=words.length;i++)if(sourceTexts.some(s=>s.includes(words.slice(i,i+15).join(' '))))throw rejection('reply-direct-quote');
 // Negation belongs to this access predicate, not any unrelated word in a sentence.
 for(const m of text.matchAll(/\b(?:have|accessed|read|retrieved) (?:the )?full[- ]text|\b(?:is|an?) (?:exact|verbatim) quote|\bsource[- ]asserted (?:fact|connection)/g)){
  const before=text.slice(0,m.index);
  const negated=/(?:\b(?:don't|doesn't|didn't|haven't|hasn't|hadn't|isn't|wasn't|can't|couldn't|cannot|not|never)|\b(?:do|does|did|have|has|had|is|was|can|could) not)(?: (?:provide|include)| (?:currently|actually|yet))?\s+$/.test(before);
  // "not an exact quote" has its negator immediately before the article.
  if(!negated)throw rejection('reply-access-claim');
 }
 return {...v,citations,basis:[...new Set(v.basis)]};
}
// Conservative clause-level disclaimer grammar, NOT a semantic causation detector.
// Only explicit absence/uncertainty of evidence exempts causal vocabulary. Each
// conjunction-separated clause is checked so a disclaimer cannot launder an assertion.
export function hasCausalAssertion(value){
 return normalize(value).split(/[.!?;:,]|\b(?:and|but|yet|however|although|because|therefore|whereas|so)\b/).some(clause=>{
  const matches=[...clause.matchAll(/\b(caus(?:e[ds]?|ing|ation|al)|led to|in response to|prompted|triggered|resulted in|source.asserted)\b/g)];
  if(!matches.length)return false;
  const disclaimer=/^(?:(?:this|it|that|the (?:evidence|source|excerpts?)) (?:does not|doesn't|cannot|can't) (?:show|establish|prove|demonstrate|imply) (?:(?:that|whether) )?|(?:there is |we have )no evidence (?:that|of) |(?:it is|it's) (?:unclear|unknown|uncertain) whether )/.test(clause.trim());
  // A single explicit evidence disclaimer may scope one causal predicate only.
  if((disclaimer||/^without implying /.test(clause.trim()))&&matches.length===1)return false;
  return matches.some(m=>!/(?:\b(?:not|no|never|didn't|doesn't|don't|cannot|can't)|\b(?:did|does|do|can) not) (?:a |an )?$/.test(clause.slice(0,m.index)));
 });
}

export {completionWording};
