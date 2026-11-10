// Literal, human-authored study prompts. Not semantic interpretation or AI analysis.
export const literalQualifiers=text=>['always','only','all','to what extent','discuss','assess','evaluate','consider','how far','should','examine','never','nothing but','no','everyone','most','too many'].filter(w=>new RegExp('\\b'+w+'\\b','i').test(text)).concat(/\bmore\b[^.!?\n]{0,120}\bthan\b/i.test(text)?['more … than']:[]);
export const qualifierGuide='Check the command word, who/where/when, and exceptions to universal claims. A bounded example cannot establish “always”, “only” or “all”. News evidence cannot settle normative values. Coverage is unassessed; consider counterexamples, limits and missing perspectives.';
export function choosePractice(q,item,confirmReplace){if(q.text&&q.text!==item.text&&!confirmReplace())return false;q.text=item.text;q.practiceId=item.id;q.results=null;q.revision=null;return true;}
const societyKey=value=>{const v=value.toLocaleLowerCase().replace(/[^a-z]/g,'');return ({uk:'uk',britain:'uk',unitedkingdom:'uk',us:'us',usa:'us',unitedstates:'us',unitedstatesofamerica:'us',sg:'sg',singapore:'sg'})[v]||v;};
export function jurisdictionLabel(s,society=null){
 const j=typeof s.jurisdiction==='string'?s.jurisdiction.trim():'';
 if(!j||/unknown|not established|overseas\/see passage|ambiguous/i.test(j))return 'Location unknown · do not infer from publisher';
 if(!society)return `${j} · source location metadata`;
 // Multi-location/international metadata does not establish local applicability.
 if(/[;/]|\binternational\b/i.test(j))return `${j} · local/comparative applicability unknown`;
 return societyKey(j)===societyKey(society)?`${j} evidence · applicability still needs checking`:`${j} · comparative evidence for ${society}; transfer not assumed`;
}

// Only explicit reader-relative location wording needs a separate society choice.
export const societyDependent=text=>/\b(?:(?:your|our|my|this)\s+(?:society|country|community)|where\s+(?:you|we)\s+live)\b/i.test(text);
