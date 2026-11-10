import {publicationDisplayFor} from './corpus.mjs';
// Calendar browsing only: publication never inherits retrieval/modified dates.
export const DATE_GROUPS=['Today','Yesterday','This week','Older','Future publication date','Date unknown/unverified'];
export const sgtDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const dayNumber=d=>Date.parse(d+'T00:00:00Z')/86400000;
export function publicationDate(source,now=new Date()){
 const original=source.publicationOriginal?.observedValue||source.publicationOriginal?.value||source.dateAssurance?.observedValue||source.publicationDate;
 const verified=source.dateAssurance?.verified===true;
 const converted=publicationDisplayFor(original);
 const timed=converted.derived===true&&(!/^\d{4}-\d{2}-\d{2}T/.test(original)||validDay(original.slice(0,10)));
 const dateOnly=validDay(original),day=timed?sgtDay(original):dateOnly?original:null;
 const today=sgtDay(now),instant=timed?Date.parse(original):null;
 let group='Date unknown/unverified';
 if(verified&&day){if(day>today||instant!==null&&instant>new Date(now).getTime())group='Future publication date';else{const age=dayNumber(today)-dayNumber(day),weekday=new Date(today+'T00:00:00Z').getUTCDay(),monday=dayNumber(today)-(weekday+6)%7;group=age===0?'Today':age===1?'Yesterday':dayNumber(day)>=monday?'This week':'Older';}}
 const eligible=group!=='Date unknown/unverified'&&group!=='Future publication date';
 const precision=timed?'SGT (UTC+08); original publisher timestamp retained':dateOnly?'publisher day; timezone unknown':'invalid/missing publication date';
 return {original,day,instant,eligible,group,precision,label:`${day||'Date unknown'} · ${precision}${!eligible?' · '+group:''}`};
}
export function sortPublications(items,sourceFor,now=new Date()){
 return [...items].sort((a,b)=>{const x=publicationDate(sourceFor(a),now),y=publicationDate(sourceFor(b),now);return Number(y.eligible)-Number(x.eligible)||(x.eligible&&y.eligible?(y.day.localeCompare(x.day)||Number(y.instant!==null)-Number(x.instant!==null)||(y.instant??0)-(x.instant??0)):DATE_GROUPS.indexOf(x.group)-DATE_GROUPS.indexOf(y.group))||String(a.id).localeCompare(String(b.id));});
}
export function groupPublications(items,sourceFor,now=new Date()){
 const sorted=sortPublications(items,sourceFor,now);return DATE_GROUPS.map(label=>({label,items:sorted.filter(a=>publicationDate(sourceFor(a),now).group===label)})).filter(g=>g.items.length);
}
export function updateProvenance(s){
 const u=s.substantiveUpdate;
 const evidence=u?.evidence||u?.evidenceRef;
 if(u?.verified===true&&u.description&&evidence&&publicationDate({publicationDate:u.observedValue||u.date,dateAssurance:{verified:true}}).day)return `Substantively updated: ${u.observedValue||u.date} · ${u.description}`;
 return s.updatedAt?`Publisher metadata modified: ${s.updatedAt}; substantive change not verified`:'No verified substantive update recorded';
}
