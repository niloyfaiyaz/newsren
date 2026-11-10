import {publicationDate,groupPublications,sgtDay,updateProvenance} from './lib/dates.mjs';
import {THEMES,resolveTheme,themeLabel,isInitialArticle} from './lib/themes.mjs';
import {literalQualifiers,societyDependent,jurisdictionLabel} from './lib/practice.mjs';
import {workspace, questionPacket, bankRevision, invalidate, clearAssessment, validateContext, requestSociety, displaySociety, evidenceSociety, ROLES, validateBankRanking, assessmentEpoch} from './lib/question.mjs';
import { KEY, readBank, snapshot, saveSnapshot, editSnapshot, deleteSnapshot, findCards, exportBank } from './lib/storage.mjs';
import { validateCorpus, projectRelationships } from './lib/corpus.mjs';
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let corpus;
let questionSubmitted=false, choosingEvidence=false;
const rankEpoch=assessmentEpoch();let rankController=null,observedBank=null;
let pickerQuery='', pickerTheme='';
let bankTheme='', bankRenderedVersions=new Map();
const activeStorage=()=>localStorage;
let sessionRead=new Set();
let state = {mode:'explore',view:'welcome',topic:null,article:'study-mode',anchor:'study-mode',edge:null,expanded:false,list:false};
let exploreState = {...state};
let listPosition = {scroll:0,mainScroll:0,focus:null};
let q=workspace();
let questionDraft = '';
let bankFilters={query:'',folder:'',tag:''}, bankDrafts=new Map();
let bankMessage='', deletePending=null, deleteExpected=null, workspaceController=null;
let refreshState={status:'',requestedAt:null,lastSuccessfulAt:null,candidates:[]};
let drafts=new Map(), replies=new Map(), conversations=new Map(), discoveries=new Map();
let selectedCandidate=null,discoveryController=null;
let aiConfig={state:'unavailable',reason:'configuration-unavailable'}, liveController=null;
let savedView=null;
let externalOrigin=null,askOrigin=null;
const disclosureMemory=new Map();
function viewKey(){return state.mode==='question'?'question':state.mode==='bank'?'bank:'+(savedView||'list'):JSON.stringify([state.mode,state.view,state.topic,state.article,state.edge]);}
function detailKey(e){return e.dataset.detailKey;}
function rememberDetails(){const open=new Set(disclosureMemory.get(viewKey())||[]);for(const e of $('stage').querySelectorAll('details')){if(e.open)open.add(detailKey(e));else open.delete(detailKey(e));}disclosureMemory.set(viewKey(),open);}
function paneContext(){rememberDetails();return {state:{...state},scroll:window.scrollY,mainScroll:$('main').scrollTop,focus:focusKey(document.activeElement)};}
function revealHeading(id){const heading=$(id);if(!heading)return;heading.tabIndex=-1;heading.focus({preventScroll:true});const pane=$('main'),h=heading.getBoundingClientRect(),r=pane.getBoundingClientRect();pane.scrollTop+=h.top-r.top-12;if(getComputedStyle(pane).overflowY!=='auto')heading.scrollIntoView({block:'start',behavior:'instant'});}
function returnContext(position){if(!position)return;restoreControl(position.focus);$('main').scrollTop=position.mainScroll;window.scrollTo(0,position.scroll);}
let session=crypto.randomUUID();
let explorePosition=null;
let serial = 0, current = 0;
let snapshots = new Map();
const article = id => corpus.articles.find(a => a.id === id);
const source = a => corpus.sources.find(s => s.id === a.sourceId);
const excerptDisplay=text=>text&&/[.!?…][’"”)]?$/.test(text.trim())?text:text+'…';
const date = d => !d?'unknown':new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z'));
const safeLink=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!x.username&&!x.password?x.href:'#';}catch{return '#';}};
const activeArticles=()=>corpus.articles.filter(isInitialArticle);
const displayTheme=value=>themeLabel(value)||value||'Explore';
function cancelContext(){liveController?.abort();discoveryController?.abort();workspaceController?.abort();cancelRank();}
function cancelRank(){rankEpoch.cancel();if(rankController){rankController=null;q.status='Assessment cancelled; no coverage conclusion. Continue explicitly to assess again.';}}
function observeBank(cards){const revision=bankRevision(cards);if(observedBank!==null&&observedBank!==revision){cancelRank();clearAssessment(q);}observedBank=revision;return revision;}
window.addEventListener('storage',e=>{if(e.key===KEY||e.key===null){cancelRank();clearAssessment(q);observedBank=null;if(state.mode==='question')renderKeepingPosition();}});
function announce(text){const message=text||'';if($('app-status').textContent!==message)$('app-status').textContent=message;}
function invalidateAssessment(){cancelRank();clearAssessment(q);$('ranking-results')?.remove();if($('question-status'))$('question-status').textContent=q.status;announce('Your evidence choices were updated.');}
const questionContext=()=>JSON.stringify([q.text,q.society,q.scope,q.gaps,q.selected,q.excluded]);
const back = label => `<button class="text-button" data-action="back">← ${label}</button>`;
function stash() {
  snapshots.set(current,paneContext());
  if (state.mode === 'explore') { explorePosition={state:{...state},scroll:window.scrollY,mainScroll:$('main').scrollTop,focus:document.activeElement?.id}; exploreState = {...state}; if(document.body.classList.contains('list-checkpoint')) listPosition={scroll:window.scrollY,mainScroll:$('main').scrollTop,focus:document.activeElement?.classList.contains('row-title')?document.activeElement.id:listPosition.focus}; }
}
function go(change) {
  const parent=paneContext();
  if(change.topic){const canonical=resolveTheme(change.topic);if(!canonical){change={...change,topic:null,view:'welcome'};}else change={...change,topic:canonical};}
  announce('');bankMessage='';cancelContext();stash(); state = {...state,...change,...((change.mode&&change.mode!==state.mode || change.view && (change.view!==state.view || change.article) || change.savedView&&change.savedView!==savedView) ? {returnTo:parent}: {})}; current = ++serial;
  savedView=state.mode==='bank'?state.savedView||null:null;history.pushState({newsren:current,session},''); render();
}
function restore(snapshot) {
  announce('');bankMessage='';cancelContext();state = {...snapshot.state};savedView=state.savedView||null; render(false);
  const initialFocus=document.activeElement,restoredState=state;
  requestAnimationFrame(() => { if(state!==restoredState||document.activeElement!==initialFocus||document.body.classList.contains('ask-open'))return;if (snapshot.focus) restoreControl($(snapshot.focus)?'id:'+snapshot.focus:snapshot.focus); window.scrollTo(0,snapshot.scroll || 0); $('main').scrollTop=snapshot.mainScroll || 0; });
}
window.addEventListener('popstate',e => {
  stash();const snapshot = e.state?.session===session ? snapshots.get(e.state?.newsren) : null;
  if (snapshot) { current = e.state.newsren; restore(snapshot); }
  else {cancelContext();state={mode:'explore',view:'welcome',topic:null,article:'study-mode',anchor:'study-mode',edge:null,expanded:false,list:false};savedView=null;current=++serial;history.replaceState({newsren:current,session},'');render();announce('Earlier navigation belonged to a previous session. Returned to Explore; unsaved drafts are memory-only and reset on reload. Saved Bank cards are unchanged.');}
});
function publication(s){const d=publicationDate(s);return d.day?date(d.day)+(d.group==='Date unknown/unverified'?' · unverified':d.group==='Future publication date'?' · future date':''):'Publication date unknown';}

function dateProvenance(s){const o=s.publicationOriginal;return `<p>Publication: ${esc(publication(s))}. ${esc(s.publicationDisplayAssurance||'Legacy date assurance; not converted or rewritten.')} ${o?`Original publication value: ${esc(o.observedValue||o.value||'unknown')}; publisher day: ${esc(o.publisherDay||'unknown')}; zone: ${esc(o.zone||'unknown')}; historical stored day: ${esc(o.historicalStoredDay||'unknown')}; provenance: ${esc(o.provenance||'publisher observation; see date assurance')}; assurance: ${esc(o.assuranceTier||s.dateAssurance?.tier||'unknown')}.`:''} ${esc(updateProvenance(s))}. Source checked/retrieved: ${esc(s.retrievedAt||'unknown')}; not publication. Event date unknown unless independently established.</p>`;}
function passage(s){return s.excerpt?`<p>${s.excerptFidelity==='normalised-selected-passage'?'Normalised selected passage · not full text · not publisher-verbatim quotation':'Retained selected passage · legacy fidelity not recorded; no publisher-verbatim certification'}</p><p class="muted">Source as of ${esc(s.sourceAsOf||publication(s))}; relative times refer to the source’s publication context, not today. ${esc(s.excerptAssurance||'Legacy excerpt fidelity not independently verified.')}</p><blockquote class="source-passage">${esc(s.excerpt)}</blockquote>${s.excerptTransformNotes?.length?`<p class="muted">Transform notes: ${s.excerptTransformNotes.map(esc).join('; ')}</p>`:''}`:'';}
function provenance(a){const s=source(a);return `<details><summary>Evidence & source provenance</summary><p><strong>Source-reported selected evidence · normalised source claims, not gist</strong></p><ul>${a.evidence.map(e=>`<li>${esc(e)}</li>`).join('')}</ul><p><a href="${esc(safeLink(s.url))}" target="_blank" rel="noopener noreferrer">Original source · ${esc(s.publisher)} ↗</a></p>${dateProvenance(s)}<p>Date assurance: ${esc(s.dateAssurance?.tier||'legacy unconfirmed')} · ${esc(s.dateMethod||'legacy supplied')}. ${esc(s.dateObservation?.method||'')} Heading metadata—not claim verification. ${esc(s.headlineAssurance||'Headline claims are not independently verified.')} Access level: ${esc(s.accessLevel)}; no full-text access is claimed. Availability: ${esc(s.availability)}.</p><p>Editorial type: ${esc(s.editorialType||'unknown')}. ${s.independentReporting?'Independently reported (editorial classification)':'Not classified as independent reporting'}: ${esc(s.independentReportingRationale||'not recorded')}. Access depth: ${esc(s.accessDepth||s.accessLevel)}.</p><p>${esc(s.provenance)}</p>${a.id==='gpt4-experiments'?'<p class="limits">Exact original passage not independently verified; prior retained abstract only.</p>':''}${passage(s)}<p>Rights/review: ${esc(s.rights)}. No independent editorial review in this build. Version ${esc(a.contentVersion)}.</p></details>`;}
function welcome() {
 return `<p class="eyebrow">A little observatory for big stories</p><h1>Follow your<br>curiosity.</h1><p class="hero-note">Pick a corner of the world. One story, then the bigger picture.</p><div class="themes">${THEMES.map((t,i)=>[t.key,['◎','⌘','◇','↗','↟','✧'][i],t.label]).map(([t,s,n])=>`<button id="topic-${t}" class="theme" data-topic="${t}"><span class="symbol" aria-hidden="true">${s}</span><strong>${esc(n)}</strong></button>`).join('')}</div><p class="muted">Curated public sources, not a live feed. Context items may have weaker date assurance.</p>`;
}
function datedList(rows,historical=false,now=new Date()){
 return groupPublications(rows,source,now).map(g=>`<section class="date-group"><h2>${esc(g.label)}${historical?' · historical/supporting context':''}</h2><ol role="list" class="news-list" aria-label="${esc(g.label)}${historical?' historical context':''}">${g.items.map(a=>{const s=source(a),d=publicationDate(s,now);return `<li class="news-row"><article><h3><button id="open-${esc(a.id)}" class="row-title" data-article="${esc(a.id)}">${esc(a.publisherHeadline||a.explanatoryTitle)}</button></h3><p class="row-meta">${esc(s.publisher)} · <time ${d.day?`datetime="${esc(d.day)}"`:''}>${esc(publication(s))}</time>${sessionRead.has(a.id)?' · Read (this session)':''}</p><p class="list-hook">${esc(a.listHook)}</p></article></li>`;}).join('')}</ol></section>`).join('');
}
function topics() {
 const rows=corpus.articles.filter(a=>a.active&&a.primaryTopic===state.topic&&(isInitialArticle(a)||a.editorialTier==='context'));
 return `<div class="news-list-heading"><div><p class="eyebrow">Explore / ${esc(displayTheme(state.topic))}</p><h1>${esc(displayTheme(state.topic))} stories</h1></div><button id="themes" class="text-button" data-action="themes">All themes →</button></div>${datedList(rows)}`;
}

function readingLimits(text,id){const clean=String(text).replace('Newsren interpretation is a question, not an additional reported fact. ','').replace('Selected-passage paraphrase only, not a full-article summary. ','').replace('Source assertions/figures remain attributed and as of publication; rights unconfirmed.','').trim()||'Only selected source passages are retained; see the original for the full account.';return ['nr007-report-038','nr007-report-041'].includes(id)?clean.replace('A lawsuit, procedural order, price intervention and final judgement are different stages; do not infer a finding beyond this passage.','A lawsuit, procedural order and final judgement are different stages; do not infer a finding beyond this passage.'):clean;}
function evidenceUses(a){return '';}
// Presentation only: retained article, source, claim spans and saved snapshots are never rewritten.
function currentComparison(e){
 const wording={
  'policy-detector-fairness':'The DfE states its position on generative AI in education; Stanford HAI describes detector claims marketed to educators. Compare a stated position with tool claims, not demonstrated policy oversight or fairness.',
  'reporting-ai-trust':'The Guardian reports on the Telegraph’s AI-focused business plans and job cuts, and on Blue Planet producers’ footage choices intended to reassure viewers about authenticity. These are different uses of AI and responses to it, not a shared finding about trust.',
  'nr008-edge-mobilise-identify':'Kenyan interviewees describe phone-based protest mobilisation; in Moscow, Zhivtsova recognised a prior protest-detention photograph on officers’ phones. Compare communication for mobilisation with a reported photograph encounter, not a verified identification mechanism.',
  'nr008-edge-private-public':'Rest of World examines party campaigning on WhatsApp away from public view in India; Al Jazeera reports allegations about Meta’s treatment of campaigns in Brazil. Compare different accountability questions in political communication.'
 };
 return wording[e.id]||e.explanation;
}
function comparisonLimit(e){return e.id==='policy-detector-fairness'?'No causal link or documented response is established. A stated education position and detector marketing do not establish fairness or implemented oversight.':e.uncertainty;}
function figureNote(a){
 if(!['nr007-report-020','nr007-report-026'].includes(a.id))return '';
 const other=article(a.id==='nr007-report-020'?'nr007-report-026':'nr007-report-020'),own=source(a),s=other&&source(other);
 if(!other||!own||!s)return '';
 return `<p class="limits figure-correction">Figure disagreement: ${esc(own.publisher)} · ${esc(publication(own))} · “${esc(a.publisherHeadline)}” reports ${a.id==='nr007-report-020'?'$110bn':'$111bn'} for the deal. The other report gives ${a.id==='nr007-report-020'?'$111bn':'$110bn'}: <button class="text-button" data-related="${esc(other.id)}">${esc(other.publisherHeadline)}</button> (${esc(s.publisher)} · ${esc(publication(s))}). These are separately attributed figures, not a reconciled total.</p>`;
}
function contentAdvisory(a){
 const subjects={"article-18": "COVID-19 and health-system gaps.", "article-19": "Infectious diseases and public-health risks.", "article-20": "Malaria.", "article-22": "Chronic illness, including cancer.", "article-46": "Life-threatening extreme heat.", "article-55": "Workplace harassment.", "article-62": "Pandemic prevention and response.", "nr007-report-004": "War-related death and suffering.", "nr007-report-005": "Death, violence, drug use and sexual content.", "nr007-report-006": "Historical mass murder.", "nr007-report-007": "Drug use.", "nr007-report-011": "Cancer recurrence and death.", "nr007-report-014": "Cancer and barriers to treatment.", "nr007-report-022": "Allegations involving child sexual abuse images.", "nr007-report-030": "War and threatened military intervention.", "nr007-report-034": "Threats of sexual violence and an alleged attack.", "nr007-report-038": "Pesticide pollution and cancer-linked health risks.", "nr007-report-040": "Deaths and injuries in an industrial disaster.", "nr007-report-045": "Cocaine use and drug-related deaths.", "nr007-report-048": "Rape and its aftermath.", "nr007-report-050": "Unsuccessful IVF and grief.", "nr007-report-060": "School shooting, deaths of children and grief.", "nr007-report-061": "Bullying and harassment.", "nr007-report-062": "Measles outbreaks.", "nr007-report-063": "Severe illness and threatened deportation."};
 return a.contentWarning?'Content advisory: '+(subjects[a.id]||String(a.contentWarning).split(' Nonblocking;')[0].replace(/^Content advisory: /,'')):'';
}
function articleQualifications(a,s){return `${a.contentWarning?`<p class="limits early-warning">${esc(contentAdvisory(a))}</p>`:''}${s.figureDiscrepancyNote?figureNote(a)||`<p class="limits figure-correction">${esc(s.figureDiscrepancyNote)}</p>`:''}`;}
function readingAccount(a){
 const accounts={
  'nr008-zello':'Rest of World describes phone-based mobilisation during protests in Kenya: an app let protesters turn phones into walkie-talkies. Its retained interviews discuss the organising challenge and the unexpected scale of young people’s use of technology.',
  'nr008-surveillance':'On 13 March 2022, English teacher Yulia Zhivtsova entered Moscow’s CSKA metro station on her way to meet friends. Rest of World’s account then describes officers comparing her with an image on their phones. She recognised a photograph taken during her detention the month before for protesting the war in Ukraine; the officers seemed unsure they had the right person.',
  'article-18':'WHO announced the SCORE for Health Data Technical Package to strengthen health information systems, especially during the COVID-19 pandemic. Its account says many countries lack the infrastructure to gather health data and the capacity to analyse it.',
  'nr007-report-020':'The Guardian reports a $110bn Paramount and Warner Bros Discovery deal, led by Skydance chief executive David Ellison, spanning studios, TV networks and news outlets. Its retained account includes an unnamed Skydance executive’s assessment of what comes next.'
 };
 return accounts[a.id]||a.gist;
}
function reportingTakeaway(a){
 const conclusions={
  'detector-bias':'A scholar quoted by Stanford HAI warns against putting faith in detectors described as “unreliable and easily gamed”.',
  'article-18':'WHO Director-General Dr Tedros Adhanom Ghebreyesus argues that countries must be able to measure progress to make progress, and that reliable data helps coordinate health responses.',
  'article-21':'WHO presents the renewed partnership as a joint commitment to health security, universal health coverage and sustainable development amid financial challenges.',
  'article-22':'WHO says the initiative will re-establish Lebanon’s Central Public Health Laboratory and prioritise medication and healthcare support for over 50,000 people with chronic diseases.',
  'article-26':'WHO places the contributions within the France–WHO Framework Agreement for 2020–2025, linking strategic priorities with instruments for collaboration.',
  'article-42':'UNEP calls for urgent, stringent emissions cuts to minimise warming overshoot; its lowest-possible scenario gives about a 50% chance of returning to or below 1.5°C by 2100.',
  'article-61':'WHO presents the agreement as support for its programme of work and Qatar’s commitment to health and sustainable development.',
  'article-63':'WMO says 2024 was likely the first calendar year more than 1.5°C above the 1850–1900 average. Its estimate has an uncertainty margin of ±0.13°C.',
  'nr007-report-020':'The unnamed Skydance executive calls it “the calm before the storm” and says Ellison got what he wanted but there is “a price to pay”.',
  'nr007-report-023':'CEO Carolin Hulshoff Pol says the next chapter will pursue revenue streams including video, audio, puzzles, events, B2B, licensing and commerce.',
  'nr007-report-041':'Newsren interpretation: the reported finding distinguishes formal environmental protection from fulfilment of a regulator’s statutory duty in this wetland case.',
  'nr007-report-053':'The producers’ stated aim is to reassure viewers through less polished footage.',
  'nr008-zello':'Political analyst Herman Manyora credits turning phones into walkie-talkies with overcoming a longstanding mobilisation challenge. Moses Kemibaro describes the scale of young people’s technology use as unexpected.',
  'nr008-deepfake':'Mayor Bianca Motley Broom calls the episode a sad commentary on democracy and political discourse, and says it reinforces tired stereotypes about women in leadership.',
  'nr008-oversight':'The oversight board describes Meta’s safeguards as “consistently and fundamentally inadequate” for the rapid rise of AI deepfakes, according to The Guardian.'
 };
 return conclusions[a.id]||'No wider conclusion is supplied by the available source passage.';
}
function takeawayMarkup(a,s){
 const text=reportingTakeaway(a),notes={
  'article-22':'These are intended activities, not demonstrated results.',
  'nr007-report-020':'This is that executive’s perspective, not an established outcome.',
  'nr007-report-023':'This is a business plan, not a measured result.',
  'nr007-report-053':'That intention does not independently authenticate each scene.'
 };
 const policy=text==='No wider conclusion is supplied by the available source passage.';
 return `<p>${policy||text.startsWith('Newsren interpretation:')?'':`<strong>${esc(s.publisher)} · source takeaway:</strong> `}${esc(text)}</p>${notes[a.id]?`<p class="limits"><strong>Newsren qualification:</strong> ${esc(notes[a.id])}</p>`:''}`;
}
function claimLimits(a){
 if(a.id==='nr008-zello')return readingLimits(a.limitations,a.id)+' The retained selection does not give the protest trigger, exact timing or outcomes.';
 if(a.id==='gpt4-experiments')return 'Preprint · prior retained abstract only; exact original passage not independently verified. No full-paper review or broader finding is available here.';
 if(a.id==='nr007-report-020')return '';
 if(a.id==='nr007-report-026')return 'The investment is reported, with Semafor identified as the original report; the retained passage offers no assessment of its effects.';
 if(a.id==='nr007-report-023')return 'The expectation of as many as 100 job losses comes from newsroom insiders, not a confirmed final total.';
 if(a.id==='nr007-report-053')return '';
 return readingLimits(a.limitations,a.id).replace('Selected-passage account only; attribution and uncertainty remain with the named source. Publication is not event occurrence; no general or Singapore-wide conclusion follows. ','');
}
function sourceDetails(a,s){return `<details data-detail-key="${esc(a.id)}:retained-source"><summary>Retained source detail</summary><p>Selected source evidence · retained wording, not a full article. ${esc(s.publisher)}.</p><ul>${a.evidence.filter(e=>!s.excerpt?.includes(e)).map(e=>`<li>${esc(e)}</li>`).join('')}</ul>${s.excerpt?`<p>Retained passage · ${esc(s.excerptAssurance||'original wording not independently certified')}</p><blockquote>${esc(s.excerpt)}</blockquote>`:''}</details>`;}
function relatedArticles(a){return projectRelationships(corpus,a.eventId,true).map(e=>{const event=corpus.events.find(n=>n.id===(e.fromEvent===a.eventId?e.toEvent:e.fromEvent)),to=article(event.articleIds[0]);return `<article class="related-card"><p class="eyebrow">${esc(e.type==='shared debate'?'Parallel comparison':e.type)}</p><h3><button class="row-title" data-related="${esc(to.id)}" data-relation="${esc(e.id)}">${esc(to.publisherHeadline||to.explanatoryTitle)}</button></h3><p class="row-meta">${esc(source(to).publisher)} · ${esc(publication(source(to)))}</p><p><strong>Newsren comparison · current:</strong> ${esc(currentComparison(e))}</p><p class="limits">${esc(comparisonLimit(e))}</p><button data-save-related="${esc(to.id)}">${savedLabel(to.id)}</button><p data-related-status="${esc(to.id)}" role="status"></p></article>`;}).join('');}
function saveArticleSnapshot(id){
 const already='Already saved to Bank. Existing notes and evidence are unchanged.';
 if(bankCards().some(c=>c.id===id))return already;
 try{saveSnapshot(activeStorage(),snapshot(corpus,id));return 'Saved to Bank';}
 catch(error){
  if(error.message==='Snapshot already saved; existing notes and evidence were not overwritten.'&&bankCards().some(c=>c.id===id))return already;
  throw error;
 }
}
function savedLabel(id){try{return bankCards().some(c=>c.id===id)?'Saved to Bank':'Save to Bank';}catch{return 'Save to Bank';}}

function story(a,detail=false) {
 sessionRead.add(a.id);const s=source(a),related=relatedArticles(a),limits=claimLimits(a);
 return `<div class="prose">${back(detail?'Return to previous article or connections':`${displayTheme(state.topic||a.primaryTopic)} stories`)}<h1>${esc(a.publisherHeadline||a.explanatoryTitle)}</h1><p class="source-line">${esc(s.publisher)} · ${esc(publication(s))} · <a href="${esc(safeLink(s.url))}" target="_blank" rel="noopener noreferrer">Read original ↗</a></p><div class="actions"><button id="save-story" data-action="save">${savedLabel(a.id)}</button><button id="next-map" data-action="map">View connections</button></div><p id="save-status" role="status"></p><section aria-labelledby="happened-title"><h2 id="happened-title">What happened</h2>${articleQualifications(a,s)}<p class="gist">${esc(readingAccount(a))}</p>${limits?`<p class="limits">${esc(limits)}</p>`:''}</section><section aria-label="The takeaway"><h2>The takeaway</h2>${takeawayMarkup(a,s)}</section>${sourceDetails(a,s)}<section aria-label="The bigger picture"><h2>The bigger picture</h2><p>${related?'The cards below compare specific accounts and their different reporting scopes. These are Newsren comparisons, not proof of a general trend or a chain of causes.':'No supported related article is available here. This retained account alone does not establish a wider trend.'}</p></section><section aria-label="Related articles"><h2>Related articles</h2>${related||'<p>No related articles in this collection yet.</p>'}</section>${q.text?'<button data-action="question-return">Return to your exact question →</button>':''}</div>`;
}

function edgeContent(e) {
 const from=article(corpus.events.find(n=>n.id===e.fromEvent).articleIds[0]),originalTo=article(corpus.events.find(n=>n.id===e.toEvent).articleIds[0]),to=e.toEvent===state.anchor?from:originalTo;
 return `<p class="eyebrow">${esc(e.type==='shared debate'?'Parallel comparison':e.type)}</p><h3>${esc(to.publisherHeadline||to.explanatoryTitle)}</h3><p class="row-meta">${esc(source(to).publisher)} · ${esc(publication(source(to)))}</p><p><strong>Newsren comparison · current:</strong> ${esc(currentComparison(e))}</p><p class="limits">${esc(comparisonLimit(e))}</p><button id="edge-${esc(e.id)}" data-edge="${esc(e.id)}" data-target="${esc(to.id)}">Read related article</button>`;
}

function map() {
  const a=article(corpus.events.find(e=>e.id===state.anchor).articleIds[0]),edges=projectRelationships(corpus,state.anchor,state.expanded);
  return `${back('Return to story')}<h1>Connections</h1><p class="map-intro">${edges.length?'Compare the source-backed endpoints below. These are different kinds of evidence.':'No verified connections yet. No relationship or timeline has been invented.'}</p><p class="limits">Chronology is not causation. Branches compare ideas, not a chain of causes. Curated source checks are not a live feed; publication and event dates are separate.</p><div class="map-anchor"><span class="eyebrow">Your anchor · ${esc(publication(source(a)))}</span><h2>${esc(a.publisherHeadline||a.explanatoryTitle)}</h2></div><div class="map-controls">${edges.length?`<button id="list-toggle" data-action="list" aria-pressed="${state.list}">${state.list?'Show relationship map':'Show accessible relationship list'}</button>`:''}${projectRelationships(corpus,state.anchor,true).length>2?`<button id="expand-map" data-action="expand" aria-expanded="${state.expanded}">${state.expanded?'Fewer connections':'More relevant connections'}</button>`:''}</div>${edges.length?state.list?`<ol role="list" class="relationship-list" aria-label="Relationship list">${edges.map(e=>`<li class="${e.id===state.edge?'selected':''}">${edgeContent(e)}</li>`).join('')}</ol>`:`<div class="lanes" role="group" aria-label="Relationship map with separate branches">${edges.map(e=>`<section class="lane ${e.id===state.edge?'selected':''}" aria-label="${esc(e.lane)}">${edgeContent(e)}</section>`).join('')}</div>`:'<p>No verified connections yet.</p>'}`;
}
function bankCards(){return readBank(activeStorage()).cards;}
function personalLabel(id){return 'Your role & notes · '+(q.roles[id]?'Role: '+q.roles[id]:'no role assigned')+(q.usage[id]?.trim()?' · usage note added':' · no usage note');}
function updatePersonalLabel(id){const summary=[...$('stage').querySelectorAll('[data-personal-state]')].find(e=>e.dataset.personalState===id);if(summary)summary.textContent=personalLabel(id);}
function societyControl(){return societyDependent(q.text)?`<details class="society-control" data-detail-key="question-society-control"><summary>Society: ${esc(q.society)} · Change</summary><label for="question-society">Society for this question</label><input id="question-society" maxlength="120" value="${esc(q.society)}"></details>`:'';}
function cardMetadata(c){return `<p class="row-meta">${esc(c.sources[0]?.publisher||'Publisher unknown')} · ${esc(publication(c.sources[0]||{}))} · ${esc(displayTheme(c.themes[0]||'Theme unknown'))}</p>`;}
function evidenceCard(c){return `<article class="bank-card" data-card="${esc(c.id)}"><h3 id="card-${esc(c.id)}"><button class="row-title" data-question-inspect="${esc(c.id)}">${esc(c.title)}</button></h3>${cardMetadata(c)}<p>${esc(c.gist)}</p><label class="selection-label"><input type="checkbox" aria-label="Include in your shortlist: ${esc(c.title)}" data-include="${esc(c.id)}" ${q.selected.includes(c.id)?'checked':''}>Include in your shortlist</label><p class="limits">${esc(readingLimits(c.limitations,c.id))}</p><details data-detail-key="${esc(c.id)}:personal"><summary data-personal-state="${esc(c.id)}">${esc(personalLabel(c.id))}</summary><label for="role-${esc(c.id)}">Your chosen evidence role</label><select id="role-${esc(c.id)}" data-role="${esc(c.id)}"><option value="">Not assigned</option>${ROLES.map(r=>`<option ${q.roles[c.id]===r?'selected':''}>${r}</option>`).join('')}</select><label for="usage-${esc(c.id)}">Your usage notes · optional</label><textarea id="usage-${esc(c.id)}" data-usage="${esc(c.id)}" maxlength="2000">${esc(q.usage[c.id]||'')}</textarea></details></article>`;}

function question() {
 let cards=[],error='';try{cards=bankCards();observeBank(cards);const ids=new Set(cards.map(c=>c.id));q.selected=q.selected.filter(id=>ids.has(id));q.excluded=q.excluded.filter(id=>ids.has(id));invalidate(q,cards);}catch(e){cancelRank();clearAssessment(q);error=e.message;}
 pickerTheme=resolveTheme(pickerTheme)||'';
 const query=pickerQuery.trim().toLocaleLowerCase(),visible=cards.filter(c=>choosingEvidence||q.selected.includes(c.id)).filter(c=>!choosingEvidence||((!pickerTheme||c.themes.some(t=>resolveTheme(t)===pickerTheme))&&(!query||[c.title,c.gist].join(' ').toLocaleLowerCase().includes(query))));
 return `<div class="question-work"><h1>What question are you working on?</h1><label for="question-draft">Your exact question</label><textarea id="question-draft" maxlength="1000" rows="3">${esc(q.text)}</textarea><div id="society-control">${societyControl()}</div><p class="muted">Continue assesses your exact question against all saved gists, evidence and necessary source context when AI is enabled. Personal notes and source links are not sent.</p><button id="submit-question" class="primary" data-action="submit-question">Continue with this question →</button><p id="question-validation" class="limits"></p>${questionSubmitted?`<section aria-labelledby="question-results-title"><h2 id="question-results-title" tabindex="-1">Evidence for your question</h2><p class="muted">${aiConfig.rank?.state==='configured'?'Suggestions do not change your shortlist, chosen roles or notes.':'Choose saved articles manually; these are not ranked or assessed for relevance. AI assessment is unavailable.'}</p><p id="question-status" role="status">${esc(q.status)}</p>${rankController?'<button data-action="cancel-rank">Cancel assessment</button>':''}${rankingView()}${error?`<p class="status">Bank unreadable. ${esc(error)} No data changed.</p>`:!cards.length?'<p>No saved articles yet. Your Bank cannot support this question while it is empty.</p><button data-action="external">Explore possibilities</button><button data-action="explore">Explore articles</button>':`<button id="choose-evidence" data-action="choose-evidence">${choosingEvidence?'Done choosing saved articles':'Choose saved articles'}</button>${!choosingEvidence?`<p>${cards.length} saved articles available</p>`:""}${choosingEvidence?`<form id="picker-filter-form" class="bank-filters"><div><label for="picker-search">Search titles and gists · optional</label><input id="picker-search" type="search" value="${esc(pickerQuery)}"></div><div><label for="picker-theme">Theme</label><select id="picker-theme"><option value="">All themes</option>${THEMES.map(t=>`<option value="${t.key}" ${pickerTheme===t.key?'selected':''}>${t.label}</option>`).join('')}</select></div><button type="submit">Search</button></form><p role="status">${visible.length} of ${cards.length} saved articles</p>${!visible.length?'<p>No saved matches.</p>':''}${pickerQuery||pickerTheme?'<button data-action="clear-picker-filters">Clear filters</button>':''}`:''}<section aria-label="Saved evidence choices">${visible.map(evidenceCard).join('')}</section>`}</section>`:''}${q.external?externalView():''}</div>`;
}

function rankingView(){if(!q.results)return '';const useful=q.results.results.filter(r=>r.disposition==='useful');return `<section id="ranking-results"><h2>Suggested evidence</h2><p>${q.results.coverage.assessed} saved articles assessed. Check each suggested use against its limits; passage checks do not prove semantic quality.</p>${!useful.length?(q.results.results.some(r=>r.disposition==='insufficient-retained-evidence')?'<p>Some saved articles lack enough retained evidence to assess. No supported useful evidence was identified; this is not confirmation that those articles are irrelevant.</p>':'<p>No useful evidence identified in this completed Bank assessment. This is not a judgement about articles outside your Bank.</p>')+'<button data-action="external">Explore possibilities</button>':''}${useful.map(r=>`<article class="bank-card"><h3><button data-question-inspect="${esc(r.id)}">${esc(bankCards().find(c=>c.id===r.id)?.title||r.id)}</button></h3><p>${esc(r.explanation)}</p><p>Usable evidence: ${esc(r.evidence)}</p><p>Suggested roles: ${r.roles.map(esc).join(', ')}</p><p>Basis: ${r.basis.map(esc).join(', ')}</p><p>Context: ${esc(r.context)}</p><p class="limits">${esc(r.limits)}</p>${r.anchors.map(a=>`<blockquote>${esc(a.quote)} — ${esc(a.sourceId||a.field)}</blockquote>`).join('')}</article>`).join('')}<details data-detail-key="assessment:other"><summary>Other saved evidence · reasons</summary>${q.results.results.filter(r=>r.disposition!=='useful').map(r=>`<p><strong>${esc(bankCards().find(c=>c.id===r.id)?.title||r.id)}</strong> · ${esc(r.disposition)}: ${esc(r.explanation)} ${esc(r.limits)}</p>`).join('')}</details>${q.results.gaps.length?`<h3>Possible coverage gaps</h3><ul>${q.results.gaps.map(g=>`<li>${esc(g)}</li>`).join('')}</ul>`:''}</section>`;}

function externalView(){const available=aiConfig.discovery?.state==='configured';return `<section id="external-panel" class="discovery" aria-labelledby="external-title"><h2 id="external-title" tabindex="-1">Explore possibilities</h2><p>No search starts until you confirm. A short search query derived from your question is sent to GOV.UK’s public search; no Bank cards, personal notes or choices are sent. This is public-source search, not hosted AI web search or unrestricted web coverage. At most two sources are retrieved. Search descriptions are not full articles; inspect actual selected passages before deciding to save.</p><button id="search-evidence" data-action="search-evidence" ${!available||workspaceController?'disabled':''}>Confirm search public sources</button>${!available?`<p>Search unavailable: ${esc(aiConfig.discovery?.reason||'configuration-unavailable')}. Your question and choices are retained.</p>`:''}${workspaceController?'<button data-action="cancel-workspace">Cancel request</button>':''}<p role="status">${esc(q.searchStatus)}</p>${candidateList(q.candidates,'question')}<button data-action="close-external">Return to same question</button><button data-action="rank">Reassess whole updated Bank</button></section>`;}
function refreshView(){return `<section class="discovery"><h2>A fresh look?</h2><p>This list is curated, never a live or today feed. Refresh is explicit; no automatic fetch or save. A future successful search returns candidates to inspect, not a replacement list.</p><button id="refresh-feed" data-action="refresh" ${aiConfig.state!=='configured'?'disabled':''} aria-describedby="refresh-availability">Look for fresh sources${aiConfig.state!=='configured'?' · unavailable':''}</button><p id="refresh-availability">${esc(refreshState.status||availability())}</p><p class="muted">Requested: ${esc(refreshState.requestedAt||'not requested')}. Last successful retrieval: ${esc(refreshState.lastSuccessfulAt||'none in this session')}. Publication dates stay separate.</p>${candidateList(refreshState.candidates,'feed')}</section>`;}
function candidateList(candidates,origin){return candidates.map(c=>`<details data-detail-key="candidate:${esc(origin)}:${esc(c.id)}:proof"><summary>${esc(c.title)} · candidate, not assessed</summary><p>Source: <a href="${esc(safeLink(c.source.finalURL))}" target="_blank" rel="noopener noreferrer">${esc(c.source.publisher||'public source')} ↗</a></p><p>Published: ${esc(c.source.publicationDate||'unknown')}. Retrieved: ${esc(c.source.retrievedAt||'unknown')}. Event: unknown.</p><p>Selected source excerpt · not a full summary</p><blockquote>${esc(c.source.retrievedText)}</blockquote><p class="limits">${esc(readingLimits(c.limitations,c.id))}</p><button data-save-candidate="${esc(c.id)}" data-origin="${origin}">Save this selected source to Bank</button></details>`).join('');}
function personalDraft(c){if(!bankDrafts.has(c.id))bankDrafts.set(c.id,{notes:c.notes,folder:c.folder||c.themes[0],tags:(c.tags||[]).join(', '),expected:JSON.stringify(c)});return bankDrafts.get(c.id);}
function deleteConfirmation(c){return `<div class="notice" role="group" aria-label="Confirm removal: ${esc(c.title)}"><p>Remove “${esc(c.title)}” from this device? Its saved notes will also be removed. Export first if needed. This cannot be undone.</p><button data-confirm-delete="${esc(c.id)}">Confirm delete</button><button data-action="cancel-delete">Keep card</button></div>`;}
function savedReference(s,c,live){
 const matching=live&&live.contentVersion===c.contentVersion;
 const known=matching?corpus.articles.find(a=>a.sourceId===s.id&&a.contentVersion===c.contentVersion):null;
 const label=matching&&s.id===live.sourceId?'Saved article source':matching?'Additional saved reference':'Saved reference (primary identity not established)';
 return `${label}: ${esc(s.publisher)}${known?' · '+esc(known.publisherHeadline||known.explanatoryTitle):''} · ${esc(publication(s))}`;
}
function bank() {
 try{
  const cards=bankCards();
  bankRenderedVersions=new Map(cards.map(c=>[c.id,JSON.stringify(c)]));
  if(savedView){const c=cards.find(c=>c.id===savedView);if(c){const d=personalDraft(c),live=article(c.id);return `<div class="prose"><button data-action="bank-list">← Bank</button>${q.text?'<button data-action="question-return">Return to exact question →</button>':''}<p class="eyebrow">Saved evidence · snapshot</p><h1>${esc(c.title)}</h1><p class="source-line">${c.sources.map(s=>`${savedReference(s,c,live)} · <a href="${esc(safeLink(s.url))}" target="_blank" rel="noopener noreferrer">Read original ↗</a>`).join(' · ')}</p><p class="status">${esc(bankMessage||'This is a saved snapshot, not updated context.')}</p>${!live?(c.contentVersion==='external-selected-excerpt-v1'?'<p class="limits">External selected excerpt, not a curated article or full-article summary. Your retained passage and source remain available offline.</p>':'<p class="limits">Original article is no longer in this collection; your saved gist and sources remain.</p>'):live.contentVersion!==c.contentVersion?'<p class="status">The collection version has changed. Your saved evidence was not replaced. Inspect current context separately.</p>':''}<section aria-label="Saved gist and evidence"><h2>Saved gist</h2><p>${esc(c.gist)}</p><h2>Saved evidence · at the time of saving</h2><ul>${c.evidence.map(e=>`<li>${esc(e)}</li>`).join('')}</ul><h2>Saved reporting and qualifications</h2>${!c.analysis.includes("?")?`<p><strong>Newsren interpretation · saved:</strong> ${esc(c.analysis)}</p>`:""}<p class="limits">${esc(readingLimits(c.limitations,c.id))}</p><h2>Saved comparisons · stored wording</h2><p class="muted">Original comparison records captured in this snapshot, not updated to the current reading clarifications below.</p>${c.connections.map(e=>`<p><strong>Saved Newsren comparison · ${esc(e.type)}:</strong> ${esc(e.explanation)} ${esc(e.uncertainty)}</p>`).join('')||'<p>No connections saved.</p>'}${c.sources.map((s,i)=>`<p class="muted">Saved reference ${i+1} · ${savedReference(s,c,live)} · Availability at save: ${esc(String(s.availability||'unknown').replace(/[.\s]+$/,''))}. Not rechecked.</p>${s.figureDiscrepancyNote?`<p class="limits">Saved source figure note: ${esc(s.figureDiscrepancyNote)}</p>`:''}`).join('')}<p class="muted">Event: ${date(c.eventDate)}. Themes: ${[...new Set(c.themes.map(displayTheme))].map(esc).join(', ')}.</p></section>${live?`<aside class="current-context" aria-label="Current collection context"><h2>Current collection context · not part of the saved snapshot</h2>${articleQualifications(live,source(live))}<h3>Current takeaway</h3>${takeawayMarkup(live,source(live))}${claimLimits(live)&&!readingLimits(c.limitations,c.id).includes(claimLimits(live))?`<p class="limits">${esc(claimLimits(live).replace(readingLimits(c.limitations,c.id),'').trim())}</p>`:""}<h3>Current related articles</h3>${relatedArticles(live)||'<p>No current related-article links available.</p>'}</aside>`:'<p class="limits">Only the saved qualifications remain available. Additional article advisories were not captured in this legacy snapshot.</p>'}${d.expected!==JSON.stringify(c)?'<div class="notice"><p>This card changed in another tab. Your unsaved draft is retained. Copy it before loading the saved version, or retain these personal fields against the refreshed version.</p><button data-action="copy-draft">Download retained draft</button><button data-action="reload-draft">Load current saved fields</button><button data-action="retain-draft">Retain draft with refreshed version</button></div>':''}<label for="bank-notes">Your notes</label><textarea id="bank-notes" maxlength="12000">${esc(d.notes)}</textarea><label for="bank-folder">Folder</label><input id="bank-folder" maxlength="80" value="${esc(d.folder)}"><label for="bank-tags">Tags · comma separated, up to 20</label><input id="bank-tags" maxlength="1600" value="${esc(d.tags)}"><div class="toolbar"><button class="primary" data-action="edit-card">Save personal changes</button><button data-action="export-card">Export this card</button><button data-delete="${esc(c.id)}">Delete this snapshot</button></div>${deletePending===c.id?deleteConfirmation(c):''}</div>`;}}
  // Read-time aliases only: never rewrite saved themes or free-form tags.
  const available=new Set(cards.flatMap(c=>c.themes.map(resolveTheme).filter(Boolean)));
  bankTheme=resolveTheme(bankTheme)||'';
  const filtered=findCards(cards,bankFilters).filter(c=>!bankTheme||c.themes.some(t=>resolveTheme(t)===bankTheme)),themes=THEMES;
  return `<h1 id="bank-title" tabindex="-1">Your Bank</h1><form id="bank-filter-form" class="bank-filters"><div><label for="bank-search">Search saved text</label><input id="bank-search" type="search" value="${esc(bankFilters.query)}"></div><div><label for="theme-filter">Theme</label><select id="theme-filter"><option value="">All themes</option>${themes.map(t=>`<option value="${t.key}" ${bankTheme===t.key?'selected':''}>${t.label}</option>`).join('')}</select></div><button type="submit">Search</button></form><div class="bank-summary"><p class="bank-count">${filtered.length} of ${cards.length} saved cards</p><button data-action="export-bank">Export Bank · Markdown</button></div>${bankMessage?`<p class="status" role="status">${esc(bankMessage)}</p>`:''}${filtered.map(c=>`<article class="bank-card" data-card="${esc(c.id)}"><h2><button class="row-title" data-saved="${esc(c.id)}">${esc(c.title)}</button></h2>${cardMetadata(c)}<p>${esc(c.gist)}</p><div class="bank-card-actions"><button class="text-button" data-saved="${esc(c.id)}">Notes & details${c.notes?' · notes saved':''} →</button><button class="text-button" data-delete="${esc(c.id)}" aria-label="Remove saved card: ${esc(c.title)}">Remove</button></div>${deletePending===c.id?deleteConfirmation(c):''}</article>`).join('')||(bankTheme||bankFilters.query||cards.length?`<p role="status">${bankTheme&&!available.has(bankTheme)?`No saved articles in ${esc(displayTheme(bankTheme))}.`:'No saved matches.'}</p><button data-action="clear-bank-filters">Clear filters</button><button data-action="explore">Explore articles</button>`:'<p>No saved articles yet. Save a story in Explore to keep its gist and sources here.</p><button data-action="explore">Explore articles</button>')}${q.text?'<button data-action="question-return">Return to exact question</button>':''}`;
 }catch(e){return `<h1>Bank unavailable</h1><p class="status">Storage is blocked, unreadable or corrupt. Existing data was not overwritten. ${esc(e.message)}</p><p>Your current article and drafts remain available. There is no automatic reset or clearing.</p><button data-action="export-raw">Download raw saved data for recovery</button><button data-action="explore">Return to Explore</button>`;}
}
function faq(){return `<div class="prose"><button data-action="faq-return">← Return to where you were</button><h1>FAQ</h1><h2>What does saving keep?</h2><p>Save keeps a local snapshot: the gist, selected evidence, sources, connections and limits. Open a Bank card to add notes, tags or a folder. Saving is optional; failures are shown beside Save.</p><h2>Where are my cards?</h2><p>Only in this browser on this device. Anyone using the same browser can read them. Avoid personal or sensitive information. There is no account or sync. Clearing browser storage or losing the device may erase your Bank.</p><h2>Can I keep a backup?</h2><p>Export in Bank downloads a Markdown reference copy, including your notes and source details. It is not a restorable backup; there is no import. Export before removing a card. Question choices and unsaved drafts stay only for this session and reset on reload.</p><h2>How should I use the evidence?</h2><p>Gists are short Newsren paraphrases of selected retained passages, not full articles or certified publisher-verbatim quotations. Timed publication records are converted to Singapore time (SGT); date-only records show the publisher’s date with no timezone inferred; original timestamp precision remains in records and exports. Publication dates are not event dates; relative times refer to publication context. The static computer and captions describe navigation, not conversation. Inspect original sources, dates, retained passages and limits in article or saved-card details. Connections compare specific cases; chronology is not causation. A useful example does not prove a general claim. Explain the connection yourself and check missing perspectives.</p><h2>What is curated, and what is AI?</h2><p>This is a curated collection, not a live feed or unrestricted search. Article-specific warnings, corrections and limitations stay beside each account. Older Bank snapshots did not capture every optional advisory or evidence-use note; matching current collection context is shown separately when available, never written into your saved facts. If an article later leaves the collection, optional advisories omitted from an older snapshot cannot be recovered. Publisher diversity is not proof of independent reporting; compare reporting methods and missing perspectives. Independent editorial review and rights clearance remain outstanding. Bank matching sends the exact question and the complete bounded Bank’s gists, retained evidence and necessary source qualifications only when enabled. Personal notes, tags, folders, usage notes, analysis and source links are excluded. Results stay in memory, are suggestions not official GP marking, and do not change your saved work. Context or budget limits fail honestly, never as an evidence gap. Chat and historical event discovery are currently unavailable. Explore possibilities requires explicit confirmation for bounded approved public-source search and selected-excerpt retrieval, not unrestricted browsing. Search snippets are not full articles. Saving and reassessment are separate explicit actions.</p></div>`;}
$('faq').addEventListener('click',()=>{if(state.mode!=='faq')go({mode:'faq'});});
$('stage').addEventListener('submit',e=>{if(e.target.id==='picker-filter-form'){e.preventDefault();renderKeepingPosition('id:picker-search');}if(e.target.id==='bank-filter-form'){e.preventDefault();renderKeepingPosition('id:bank-search');}});
function bankCaption(){try{return bankCards().length?'Your saved understanding, with room for your own notes.':'Your Bank is empty. Save a story when you want to keep it.';}catch{return 'Saved cards cannot be read right now. No data has been cleared.';}}
function questionCaption(){if(!questionSubmitted)return 'Keep your wording. Follow the evidence at your pace.';try{bankCards();return 'Your exact question and choices stay here while you explore.';}catch{return 'Your Bank cannot be read. Your question is retained; no data has been cleared.';}}
function render(focus=true) {
  for(const id of ['explore','question','bank'])$(id).disabled=false;
  
  const welcomeView=state.mode==='explore'&&state.view==='welcome';
  $('companion').classList.toggle('welcome',welcomeView);
  document.body.classList.toggle('reading',!welcomeView);
  const paletteView=true;
  document.body.classList.toggle('palette-checkpoint',paletteView);
  document.body.classList.toggle('list-checkpoint',state.mode==='explore' && state.view==='topics' && state.topic!==null);
  const mood=welcomeView?'greeting':state.mode!=='explore'?'idle':state.view==='map'?'pointing':'idle';
  $('face').src='/assets/idle.svg'; $('face').alt='Purple pixel computer';
  $('caption').innerHTML=`<span class="eyebrow">Interface guidance · not AI</span><p>${welcomeView?'Big stories. Small steps.<br>What catches your eye?':state.mode==='faq'?'Help with saving and using evidence.':state.mode==='question'?questionCaption():state.mode==='bank'?bankCaption():state.view==='map'?(projectRelationships(corpus,state.anchor,state.expanded).length?'Different branches. Different kinds of evidence.':'No verified connections here yet. No relationship has been invented.'):state.view==='topics'?`${displayTheme(state.topic)}. Pick a story; follow the evidence.`:state.view==='topics'?'Choose a theme.':state.article==='uk-education-guidance'?'A policy position is not evidence of classroom outcomes.':state.article==='detector-bias'?'A detector’s intended use is different from tested accuracy.':'Read the evidence, then explore what it does and doesn’t show.'}</p>`;
  for(const mode of ['explore','question']) $(mode).setAttribute('aria-pressed',String(state.mode===mode));
  $('bank').setAttribute('aria-pressed',String(state.mode==='bank'));
  document.title=(state.mode==='faq'?'FAQ':state.mode==='bank'?(savedView?'Saved evidence':'Your Bank'):state.mode==='question'?'Question':state.view==='welcome'?'Explore':state.view==='topics'?displayTheme(state.topic):state.view==='map'?'Connections':article(state.article)?.publisherHeadline||'Connections')+' · Newsren';
  $('stage').innerHTML=state.mode==='faq'?faq():state.mode==='question'?question():state.mode==='bank'?bank():state.view==='welcome'?welcome():state.view==='topics'?topics():state.view==='map'?map():story(article(state.article),state.view==='detail');
  keyControls();const openDetails=disclosureMemory.get(viewKey());if(openDetails)for(const e of $('stage').querySelectorAll('details'))e.open=openDetails.has(detailKey(e));if(state.mode==='bank'&&bankMessage)announce(bankMessage);
  if(focus) { window.scrollTo(0,0); $('main').scrollTop=0; $('main').focus({preventScroll:true}); }
}
function returnExplore() { if(state.mode!=='explore') { const position=explorePosition; go(exploreState); if(position)restore(position); } }
function semanticBack(){if(state.mode!=='explore')return returnExplore();const target=state.returnTo;if(target){go(target.state);restore(target);}else go({view:'welcome',topic:null});}
$('explore').addEventListener('click',returnExplore);
$('question').addEventListener('click',()=>{if(state.mode!=='question')go({mode:'question'});});
$('bank').addEventListener('click',()=>{if(state.mode!=='bank')go({mode:'bank',savedView:null});});
$('stage').addEventListener('input',e=>{
 const t=e.target;
 if(t.id==='question-draft'){cancelContext();q.practiceId=null;q.candidates=[];q.external=false;q.searchStatus='';$('external-panel')?.remove();questionDraft=q.text=t.value;questionSubmitted=false;clearAssessment(q);$('question-results-title')?.closest('section').remove();$('society-control').innerHTML=societyControl();keyControls();}
 if(t.id==='question-society'){cancelContext();q.society=t.value;invalidateAssessment();try{const cards=bankCards();for(const node of document.querySelectorAll('[data-jurisdiction-card]')){const c=cards.find(c=>c.id===node.dataset.jurisdictionCard);if(c)node.textContent=c.sources.map(s=>jurisdictionLabel(s,evidenceSociety(q))).join('; ');}}catch{}$('ranking-results')?.remove();}
 if(t.id==='question-scope'){cancelContext();q.scope=t.value;invalidateAssessment();$('ranking-results')?.remove();}
 if(t.id==='question-gaps'){cancelContext();q.gaps=t.value;invalidateAssessment();$('ranking-results')?.remove();}
 if(t.id==='picker-search')pickerQuery=t.value;
 if(t.dataset.usage){q.usage[t.dataset.usage]=t.value;updatePersonalLabel(t.dataset.usage);}
 if(t.id==='bank-search')bankFilters.query=t.value;
 if(savedView&&['bank-notes','bank-folder','bank-tags'].includes(t.id)){const d=bankDrafts.get(savedView);if(d)d[{'bank-notes':'notes','bank-folder':'folder','bank-tags':'tags'}[t.id]]=t.value;}
});
$('stage').addEventListener('change',e=>{
 const t=e.target;if(t.dataset.include){q.selected=t.checked?[...new Set([...q.selected,t.dataset.include])]:q.selected.filter(id=>id!==t.dataset.include);const pending=!!rankController;cancelRank();if(pending)renderKeepingPosition();}
 if(t.dataset.role){q.roles[t.dataset.role]=t.value;updatePersonalLabel(t.dataset.role);}
 if(t.id==='picker-theme'){pickerTheme=t.value;renderKeepingPosition();}
 if(t.id==='theme-filter'){bankTheme=t.value;renderKeepingPosition();}
 if(t.id==='folder-filter'){bankFilters.folder=t.value;renderKeepingPosition();}if(t.id==='tag-filter'){bankFilters.tag=t.value;renderKeepingPosition();}
});
function focusKey(e){return e?.id?'id:'+e.id:e?.dataset.focusKey||null;}
function keyControls(){for(const [i,e] of [...$('stage').querySelectorAll('details')].entries()){e.dataset.detailKey ||= 'view-detail:'+i;const summary=e.querySelector('summary');if(summary)summary.dataset.focusKey='detail:'+e.dataset.detailKey;}for(const e of $('stage').querySelectorAll('button,input,select,textarea,summary')){if(e.id||e.dataset.focusKey)continue;const attrs=[...e.attributes].filter(a=>a.name.startsWith('data-')&&a.name!=='data-focus-key').map(a=>a.name+'='+a.value).sort().join('|');e.dataset.focusKey=attrs||e.tagName+':'+e.textContent.trim().slice(0,120);}}
function restoreControl(key){const target=key?.startsWith('id:')?$(key.slice(3)):[...$('stage').querySelectorAll('[data-focus-key]')].find(e=>e.dataset.focusKey===key);const visible=e=>e&&!e.disabled&&e.getClientRects().length;const fallback=[document.querySelector('[data-action=cancel-discovery]'),$('question-draft'),$('bank-title'),$('bank-search'),$('main')].find(visible);(visible(target)?target:fallback)?.focus({preventScroll:true});}
function renderKeepingPosition(fallback=null){const position=paneContext();render(false);returnContext({...position,focus:fallback||position.focus});}
function download(name,text,type='text/markdown'){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

$('stage').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b)return;
  if(b.dataset.askEdge){state.edge=b.dataset.askEdge;selectedCandidate=null;openAsk();return;}
  if(b.dataset.candidate){selectedCandidate=discoveries.get(state.anchor)?.candidate||null;openAsk();return;}
  if(b.dataset.related)return go({mode:'explore',view:'detail',article:b.dataset.related,edge:b.dataset.relation});
  if(b.dataset.saveRelated){try{const id=b.dataset.saveRelated;const message=saveArticleSnapshot(id);b.textContent='Saved to Bank';$('stage').querySelector(`[data-related-status="${id}"]`).textContent=message;}catch(err){b.nextElementSibling.textContent='Save not confirmed. '+err.message;}return;}
  if(b.dataset.saved||b.dataset.questionInspect){const id=b.dataset.saved||b.dataset.questionInspect;deletePending=null;bankMessage='';go({mode:'bank',savedView:id});return;}
  if(b.dataset.delete){try{const c=bankCards().find(c=>c.id===b.dataset.delete);if(!c)throw Error('Card already removed; refresh Bank.');deletePending=c.id;deleteExpected=bankDrafts.get(c.id)?.expected||bankRenderedVersions.get(c.id);if(!deleteExpected)throw Error('Refresh Bank before removing this card.');renderKeepingPosition();document.querySelector('[data-action="cancel-delete"]')?.focus();}catch(e){deletePending=null;deleteExpected=null;bankMessage='Remove unavailable. '+e.message;renderKeepingPosition();}return;}
  if(b.dataset.confirmDelete){try{if(deletePending!==b.dataset.confirmDelete||!deleteExpected)throw Error('Open removal confirmation again.');deleteSnapshot(activeStorage(),b.dataset.confirmDelete,deleteExpected);bankDrafts.delete(b.dataset.confirmDelete);q.selected=q.selected.filter(id=>id!==b.dataset.confirmDelete);q.excluded=q.excluded.filter(id=>id!==b.dataset.confirmDelete);delete q.roles[b.dataset.confirmDelete];delete q.usage[b.dataset.confirmDelete];savedView=null;state.savedView=null;deletePending=null;deleteExpected=null;bankMessage='Deletion confirmed in this browser.';invalidateAssessment();render();revealHeading('bank-title');}catch(e){bankMessage='Delete not confirmed. '+e.message;renderKeepingPosition();}return;}
  if(b.dataset.exclude){const id=b.dataset.exclude;q.excluded=q.excluded.includes(id)?q.excluded.filter(x=>x!==id):[...q.excluded,id];q.selected=q.selected.filter(x=>x!==id);invalidateAssessment();renderKeepingPosition();return;}
  if(b.dataset.saveCandidate){saveCandidate(b.dataset.saveCandidate,b.dataset.origin);return;}
  if(b.dataset.topic) return go({mode:'explore',view:'topics',topic:b.dataset.topic});
  if(b.dataset.article) return go({view:'story',article:b.dataset.article,anchor:article(b.dataset.article).eventId,edge:null,expanded:false,list:false});
  if(b.dataset.edge) { state.edge=b.dataset.edge; return go({view:'detail',article:b.dataset.target,edge:b.dataset.edge}); }
  switch(b.dataset.action) {
    case 'back': semanticBack();break;
    case 'faq-return': {const origin=state.returnTo;if(origin){go(origin.state);restore(origin);}else returnExplore();break;}
    case 'themes': go({view:'welcome',topic:null});break;
    case 'explore': returnExplore();break;
    case 'map': go({view:'map',anchor:article(state.article).eventId,edge:null});break;
    case 'list': { rememberDetails();const y=window.scrollY; state.list=!state.list; render(false); $('list-toggle').focus({preventScroll:true}); window.scrollTo(0,y); break; }
    case 'expand': { rememberDetails();const y=window.scrollY; state.expanded=!state.expanded; render(false); $('expand-map').focus({preventScroll:true}); window.scrollTo(0,y);break; }
    case 'ask': openAsk();break;
    case 'discover': void discoverRelated();break;
    case 'cancel-discovery': discoveryController?.abort();break;
    case 'bank-list': {const origin=state.returnTo;deletePending=null;if(origin?.state.mode==='bank'&&!origin.state.savedView){go(origin.state);restore(origin);}else go({mode:'bank',savedView:null});break;}
    case 'bank-find': case 'question-find': renderKeepingPosition();break;
    case 'cancel-delete': {const id=deletePending;deletePending=null;deleteExpected=null;renderKeepingPosition(savedView?'id:bank-notes':'data-delete='+id);break;}
    case 'clear-bank-filters': bankFilters={query:'',folder:'',tag:''};bankTheme='';render();revealHeading('bank-title');break;
    case 'question-return': {let origin=state.returnTo;while(origin&&origin.state.mode!=='question')origin=origin.state.returnTo;if(origin){go(origin.state);restore(origin);}else go({mode:'question'});break;}
    case 'submit-question': if(!q.text.trim()){$('question-validation').textContent='Enter your question first.';$('question-draft').focus();break;}questionSubmitted=true;renderKeepingPosition();revealHeading('question-results-title');void assessBank();break;
    case 'clear-picker-filters': pickerQuery='';pickerTheme='';renderKeepingPosition('id:picker-search');break;
    case 'choose-evidence': choosingEvidence=!choosingEvidence;renderKeepingPosition('id:choose-evidence');break;
    case 'copy-draft': download('newsren-unsaved-draft.txt',JSON.stringify(bankDrafts.get(savedView),null,2),'text/plain');break;
    case 'reload-draft': bankDrafts.delete(savedView);bankMessage='Current saved personal fields loaded. Previous draft replaced by your choice.';renderKeepingPosition();break;
    case 'retain-draft': {const d=bankDrafts.get(savedView),c=bankCards().find(c=>c.id===savedView);if(d&&c)d.expected=JSON.stringify(c);bankMessage='Draft retained against the current saved version; review before saving.';renderKeepingPosition();break;}
    case 'shortlist': q.shortlist=!q.shortlist;renderKeepingPosition();break;
    case 'external': if(!q.external){externalOrigin=paneContext();q.external=true;renderKeepingPosition();}revealHeading('external-title');break;
    case 'close-external': q.external=false;renderKeepingPosition();returnContext(externalOrigin);externalOrigin=null;break;
    case 'rank': void assessBank();break;
    case 'cancel-rank': cancelRank();renderKeepingPosition();break;
    case 'search-evidence': void workspaceAction('search');break;
    case 'refresh': void workspaceAction('refresh');break;
    case 'cancel-workspace': workspaceController?.abort();break;
    case 'edit-card': try{const d=bankDrafts.get(savedView);editSnapshot(activeStorage(),savedView,{notes:d.notes,folder:d.folder,tags:d.tags.split(',').map(t=>t.trim()).filter(Boolean)},d.expected);bankDrafts.delete(savedView);bankMessage='Personal changes confirmed in this browser.';invalidateAssessment();renderKeepingPosition();}catch(e){bankMessage='Changes not confirmed. '+e.message;renderKeepingPosition();}break;
    case 'export-bank': case 'export-card': try{download('newsren-evidence.md',exportBank(b.dataset.action==='export-card'?bankCards().filter(c=>c.id===savedView):bankCards()));}catch(e){bankMessage='Export failed. '+e.message;renderKeepingPosition();}break;
    case 'export-raw': try{const raw=activeStorage().getItem(KEY);if(raw===null)throw Error('No saved data found.');download('newsren-raw-recovery.json',raw,'application/json');}catch(e){$('stage').insertAdjacentHTML('beforeend',`<p>Raw export unavailable: ${esc(e.message)}</p>`);}break;
    case 'save': try{const message=saveArticleSnapshot(state.article);$('save-story').textContent='Saved to Bank';$('save-status').textContent=message;}catch(err){$('save-status').textContent='Save not confirmed. '+err.message;}break;
  }
});
let opener;
const reasons={'invalid-input':'Check the question and enter a specific society of 1–120 characters; scope/gaps may each use 2,000.','missing-key':'Live AI is disabled: this preview has no application key loaded.','missing-model':'This preview has no enabled AI model.','quota-disabled':'The owner has not enabled a request allowance.','quota-exhausted':'The configured request allowance is used up.','insufficient-discovery-budget':'Related-event search needs two remaining reservations; no search was started.','busy':'Another request is running.','configuration-unavailable':'Configuration could not be checked.'};
function availability(){return aiConfig.state==='configured'?'AI configured; semantic quality remains unverified.':'AI help is unavailable right now. You can still read, save and search your saved text.';}
function conversationKey(){return state.mode==='question'?'question:'+questionContext():state.mode==='bank'?'bank:'+savedView:state.article+':'+(state.edge||'');}
function sourceMarkup(s){
  const excerpt=s.retrievedText||s.retainedExcerpt?.text;
  return `<details class="citation"><summary>${esc(s.id)} · ${esc(s.publisher||s.headline||'Retrieved source')}</summary><a href="${esc(safeLink(s.finalURL||s.url))}" target="_blank" rel="noopener noreferrer">Open source ↗</a><p>Publication: ${esc(s.publicationDate||'unknown')} (${esc(s.publicationDatePrecision||'precision not recorded')}). Event: ${esc(s.eventDate||'unknown')}. Retrieved: ${esc(s.retrievedAt||'unknown')}. Access: ${esc(s.accessLevel||'unknown')}.</p>${excerpt?`<p>${s.retrievedText?'Retrieved page excerpt · HTML text extraction':s.retainedExcerpt?.fidelityState?'Normalised selected passage · not publisher-verbatim quotation':s.retainedExcerpt?.exactVerified?'Retained checked public excerpt · no full-text claim':'Retained manual excerpt · exact original text NOT independently verified'}</p><blockquote>${esc(excerpt)}</blockquote>`:'<p>No retained source excerpt available.</p>'}</details>`;
}
const basisLabels={'source-reporting':'Source reporting (paraphrased)','Newsren-summary':'Newsren-authored summary','Newsren-inference':'Newsren inference','evidence-gap':'Evidence gap'};
let renderedConversation=null,renderedTurns=0,renderedTurnObjects=[];
function renderConversation(id){
 const turns=conversations.get(id)||[];
 if(renderedConversation!==id){$('ask-reply').replaceChildren();renderedTurnObjects=[];renderedConversation=id;}
 while(renderedTurnObjects.length&&renderedTurnObjects[0]!==turns[0]){renderedTurnObjects.shift();$('ask-reply').firstElementChild?.remove();}renderedTurns=renderedTurnObjects.length;
 const markup=turns.slice(renderedTurns).map(t=>`<div class="chat-turn"><p><strong>${t.role==='user'?'You':'Newsren · actual provider response'}</strong></p>${t.role==='assistant'?`<p class="limits">Answer basis: ${(Array.isArray(t.basis)&&t.basis.length&&t.basis.every(b=>Object.hasOwn(basisLabels,b))?t.basis.map(b=>esc(basisLabels[b])).join(' · '):'Not declared / unknown')}. Labels and citations are not proof of claim support.</p>`:''}<p>${esc(t.text)}</p>${t.sources?t.sources.map(sourceMarkup).join(''):''}${t.metadata?`<small>${esc(JSON.stringify(t.metadata))}</small>`:''}</div>`).join('');
 if(markup)$('ask-reply').insertAdjacentHTML('beforeend',markup);renderedTurns=turns.length;renderedTurnObjects=[...turns];
}
function budgetText(b){return b?`Requests reserved ${b.reserved}/${b.limit}; remaining ${b.remaining}. ${b.session?'Session '+b.session:'Process only'}. Not a monetary cap; search tool charges may apply.`:'';}
function openAsk(focus=true){
  if(focus){opener=document.activeElement;askOrigin=paneContext();}
  const a=article(state.article),isSaved=state.mode==='bank'&&!!savedView,questionContext=state.mode==='question',context=questionContext||state.mode==='explore'&&['story','detail','map'].includes(state.view);
  if(selectedCandidate&&selectedCandidate.articleId!==state.article)selectedCandidate=null;
  $('ask-context').textContent=questionContext?`Your exact question · ${displaySociety(q)} · ${q.selected.length} selected Bank cards`:context?`About: ${a.publisherHeadline||a.explanatoryTitle}${state.edge?' · selected curated connection':''}${selectedCandidate?' · selected live candidate':''}`:'Select an article to ask about its evidence.';
  const enabled=context&&aiConfig.state==='configured';
  const inputLabel=!context&&!isSaved?'Choose an article or Question context first':questionContext?'Follow-up about your exact question and selected Bank evidence':isSaved?'Question about this saved card · AI unavailable':'Question about the selected article';
  $('ask-label').textContent=inputLabel;
  if(isSaved){let title='unavailable — saved storage cannot be read';try{title=bankCards().find(c=>c.id===savedView)?.title||'unavailable — saved card not found';}catch{}$('ask-context').textContent='Saved card: '+title+' · saved-card AI help is unavailable; no current-article substitution.';}
  $('ask-status').textContent=enabled?'Send explicitly. Question requests send exact question, society, literal qualifiers, scope/gaps and selected source evidence; personal notes are excluded. Source excerpts, Newsren summaries and inferences are separate; sources/history are untrusted data. Only 3 recent exchanges (6 messages, 6000 characters) are sent; older turns are dropped. No personal information. '+budgetText(aiConfig.budget):`${availability()} Your reading position and drafts stay here.`;
  if(!context&&!isSaved)$('ask-status').textContent='Choose an article, or open Question for your exact question and selected evidence. Input and Send are disabled because no evidence context is selected. '+availability();
  $('ask-form').hidden=false;
  $('send-ask').disabled=!enabled||!!liveController; $('cancel-ask').hidden=!liveController;
  $('ask-input').disabled=!context;$('ask-input').setAttribute('aria-describedby','ask-status');$('ask-input').setAttribute('aria-label',inputLabel);$('send-ask').setAttribute('aria-describedby','ask-status');$('ask-input').value=drafts.get(conversationKey())||'';
  renderConversation(conversationKey());
  if($('drawer').parentElement!==document.querySelector('.shell'))document.querySelector('.shell').append($('drawer'));document.body.classList.add('ask-open');$('drawer').hidden=false;$('summon').setAttribute('aria-expanded','true');if(focus)$('close-drawer').focus({preventScroll:true});
}

function recentHistory(id){const all=conversations.get(id)||[];let turns=all.slice(-6);while(turns.reduce((n,t)=>n+t.text.length,0)>6000)turns=turns.slice(2);return {history:turns.map(({role,text})=>({role,text})),dropped:all.length-turns.length};}
const relatedDomains=['gov.uk','unesco.org','hai.stanford.edu','arxiv.org','moe.gov.sg','ed.gov','education.gov.au','oecd.org','education.ec.europa.eu'];
function supportedRelated(){const a=corpus.events.find(e=>e.id===state.anchor)?.articleIds[0],u=article(a);if(!u)return false;const host=new URL(source(u).url).hostname;return relatedDomains.some(d=>host===d||host.endsWith('.'+d));}
function discoveryView(){
 if(!supportedRelated())return '<section class="discovery"><h2>Related-event search unavailable for this publisher</h2><p>The current live-source allowlist is education-focused and does not support this anchor. No search or reservation is attempted. Checked curated connections above remain available; external search breadth is limited and currently unavailable.</p></section>';
 const d=discoveries.get(state.anchor);
 let body='';
 if(d?.status==='candidate'){
  const c=d.candidate,r=c.relationship;
  body=`<h3>${esc(c.title)}</h3><p>Live retrieval · ${esc(c.retrievedAt)} · candidate—not editorially verified</p><p>Event: ${esc(c.eventDate||'unknown')} (${esc(c.eventDatePrecision||'precision not recorded')}) · ${esc(c.eventStatus||'occurrence unknown')} · ${esc(r.type)} · ${esc(r.interpretation)}</p><p>${esc(r.explanation)}</p><p class="limits">${esc(r.uncertainty)} Quote substring checks are not semantic truth validation.</p>${r.anchors.map(q=>`<blockquote>${esc(q.quote)} <small>— ${esc(q.sourceId)}</small></blockquote>`).join('')}${c.sources.map(sourceMarkup).join('')}<button data-candidate="${esc(c.id)}">Use selected candidate in Ask context</button><p>Ephemeral (15 minutes). Not published to the archive or saved to Bank.</p>`;
 }else if(d?.status==='coverage')body=`<p>${esc(d.message)}</p><p>Existing event: ${esc(d.eventId)} · coverage, not a new event</p>${d.sources.map(sourceMarkup).join('')}`;
 else if(d)body=`<p>${esc(d.message||'Retrieval in flight…')}</p>`;
 return `<section class="discovery" aria-labelledby="discovery-title"><h2 id="discovery-title">Find related events</h2><p>Explicit live search outside this curated collection. Up to 2 provider requests, 1 hosted search and 3 bounded public HTML fetches. No retries. Shared allowance; tool fees may apply.</p><p class="limits">${esc(availability())}</p><button id="find-related" data-action="discover" ${discoveryController||liveController||aiConfig.state!=='configured'?'disabled':''}>Find related events${aiConfig.state!=='configured'?' · unavailable':''}</button>${discoveryController?'<button data-action="cancel-discovery">Cancel retrieval</button>':''}${body}${d?.diagnostics?`<details><summary>Bounded retrieval diagnostics</summary><pre>${esc(JSON.stringify(d.diagnostics,null,2))}</pre></details>`:''}${d?.metadata?`<details><summary>Provider metadata & budget</summary><p>${esc(JSON.stringify(d.metadata))}</p><p>${esc(budgetText(d.budget))}</p></details>`:''}</section>`;
}
async function discoverRelated(){
 if(discoveryController||liveController||!supportedRelated())return;
 const id=state.anchor,scroll=$('main').scrollTop;
 discoveryController=new AbortController();const controller=discoveryController;discoveries.set(id,{status:'loading',message:'Actual retrieval in flight…'});
 renderKeepingPosition();$('main').scrollTop=scroll;$('face').src='/assets/thinking.svg';
 const timer=setTimeout(()=>controller.abort(),85000);
 try{
  const response=await fetch('/api/related',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articleId:corpus.events.find(e=>e.id===id).articleIds[0]}),signal:controller.signal});const d=await response.json();
  if(controller.signal.aborted)throw Object.assign(Error('Cancelled'),{name:'AbortError'});if(d.budget)aiConfig.budget=d.budget;
  if(!response.ok){discoveries.set(id,{...d,status:'error',message:(d.error||'Retrieval failed')+(d.reason?' · '+d.reason:'')+'. No candidate fabricated.'});return;}
  discoveries.set(id,d);
 }catch(e){discoveries.set(id,{status:'error',message:(e.name==='AbortError'?'Cancelled; reservations may be consumed.':e.message)+ ' Article, input and history retained. No candidate fabricated.'});}
 finally{clearTimeout(timer);discoveryController=null;if(state.view==='map'&&state.anchor===id){renderKeepingPosition();$('main').scrollTop=scroll;}$('face').src='/assets/idle.svg';}
}

async function packetDigest(packet){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(packet))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function assessBank(){
 if(rankController)return;
 let packet,revision;try{const cards=bankCards();revision=observeBank(cards);packet=questionPacket(q,cards,corpus);if(!cards.length){q.status='No saved articles yet. No assessment request was sent.';renderKeepingPosition();return;}}
 catch(e){clearAssessment(q);q.status=e.message==='context-limit'?'The whole Bank exceeds this assessment’s context limit. Nothing was truncated or sent.':e.message;renderKeepingPosition();return;}
 if(aiConfig.rank?.state!=='configured'){q.status='AI assessment unavailable ('+(aiConfig.rank?.reason||aiConfig.reason||'configuration-unavailable')+'). No request sent; browse saved articles manually.';renderKeepingPosition();return;}
 const context=JSON.stringify([q.text,q.society,revision]),token=rankEpoch.begin(context);rankController=token.controller;clearAssessment(q);q.status='Assessing the complete saved Bank…';renderKeepingPosition();
 const timer=setTimeout(()=>token.controller.abort(),100000);
 const current=()=>{try{return state.mode==='question'&&rankEpoch.current(token,JSON.stringify([q.text,q.society,bankRevision(bankCards())]));}catch{return false;}};
 try{
  const manifest=await packetDigest(packet);if(!current())return;
  const response=await fetch('/api/question/rank',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({packet}),signal:token.controller.signal});const data=await response.json();
  if(!current())return;
  if(!response.ok&&data.error==='invalid-provider-output')throw Error(data.diagnostics?.recoverable===true?"Assessment output was malformed or could not be verified; no coverage conclusion. The request was charged. Your question and saved articles are unchanged. You may explicitly assess again if allowance remains.":"Assessment could not be verified; paid assessment is halted for accounting or safety checks. No coverage conclusion. Your question and saved articles are unchanged.");
  if(!response.ok)throw Error('Assessment unavailable ('+(typeof data.error==='string'&&/^[a-z-]+$/.test(data.error)?data.error:'provider-failure')+'). No coverage conclusion.');
  if(!data||Object.keys(data).sort().join(',')!=='coverage,gaps,manifest,results,status,version'||data.status!=='complete'||data.manifest!==manifest||!data.coverage||Object.keys(data.coverage).sort().join(',')!=='assessed,complete,useful'||data.coverage.complete!==true||data.coverage.assessed!==packet.cards.length)throw Error('Invalid assessment; no coverage conclusion.');
  validateBankRanking({version:data.version,results:data.results,gaps:data.gaps},packet);
  if(data.coverage.useful!==data.results.filter(r=>r.disposition==='useful').length)throw Error('Invalid assessment coverage.');
  q.results=data;q.revision=revision;q.status='Completed whole-Bank assessment. Inspect suggested uses and limits.';
 }catch(e){if(current())q.status=e.message;else if(rankController===token.controller)q.status='Assessment cancelled or stale; no coverage conclusion.';}
 finally{clearTimeout(timer);if(rankEpoch.finish(token)){rankController=null;if(state.mode==='question')renderKeepingPosition();}}
}

function validCandidates(data){
 if(!data||!['candidates','empty'].includes(data.status)||!Array.isArray(data.candidates)||data.candidates.length>2||!data.lastSuccessfulAt||Number.isNaN(Date.parse(data.lastSuccessfulAt)))throw Error('Malformed retrieval; no candidates accepted.');
 const ids=new Set();for(const c of data.candidates){if(!c||typeof c.id!=='string'||ids.has(c.id)||typeof c.title!=='string'||c.title.length>500||typeof c.limitations!=='string'||c.limitations.length>1200||!c.source||!c.source.exactVerified||safeLink(c.source.finalURL)==='#'||typeof c.source.retrievedText!=='string'||c.source.retrievedText.length>1200||!c.source.retrievedText.trim())throw Error('Unsupported candidate; no results accepted.');ids.add(c.id);}return data.candidates;
}
async function workspaceAction(kind){
 if(kind==='rank')return assessBank();
 if(workspaceController||liveController||discoveryController)return;
 const isRefresh=kind==='refresh',key=kind==='rank'?'status':'searchStatus';
 if(isRefresh)refreshState.requestedAt=new Date().toISOString();
 const unavailable=availability()+' No new request was sent. Your question, choices and drafts remain here.';
 try{validateContext(isRefresh?{...q,text:'Refresh curated sources'}:q);}catch(e){if(isRefresh)refreshState.status=e.message;else q[key]=e.message;renderKeepingPosition();return;}
 if((kind==='search'?aiConfig.discovery?.state:aiConfig.state)!=='configured'){if(isRefresh)refreshState.status=unavailable;else q[key]=unavailable;renderKeepingPosition();return;}
 let packet;try{const cards=bankCards();packet=kind==='rank'?questionPacket(q,cards):{question:isRefresh?`Find recent public ${displayTheme(state.topic)} articles`:q.text,scope:isRefresh?'':q.scope,gaps:isRefresh?'':q.gaps,society:isRefresh?q.society:requestSociety(q),practiceId:isRefresh?null:q.practiceId,qualifiers:isRefresh?[]:literalQualifiers(q.text),cards:[]};if(!packet.question.trim()||packet.question.length>1000)throw Error('Enter your exact practice question first.');}catch(e){if(isRefresh)refreshState.status=e.message;else q[key]=e.message;renderKeepingPosition();return;}
 const revision=bankRevision(bankCards()),exactQuestion=questionContext(),mode=state.mode,topic=state.topic;
 workspaceController=new AbortController();const controller=workspaceController,timer=setTimeout(()=>controller.abort(),kind==='rank'?23000:85000);
 if(kind==='rank')invalidateAssessment();if(isRefresh)refreshState.status='Explicit retrieval in flight…';else q[key]='Explicit request in flight…';
 // Render the stage directly: ordinary navigation cancels, but this progress render does not.
 renderKeepingPosition();
 for(const id of ['rank-bank','search-evidence','refresh-feed'])if($(id))$(id).setAttribute('aria-disabled','true');
 try{
  const response=await fetch(isRefresh?'/api/feed/refresh':'/api/question/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({packet}),signal:controller.signal});const data=await response.json();
  if(controller.signal.aborted)throw Object.assign(Error('Cancelled'),{name:'AbortError'});if(data.budget)aiConfig.budget=data.budget;if(!response.ok)throw Error(reasons[data.error]||'Service unavailable. No result accepted.');
  {const candidates=validCandidates(data);if(isRefresh){refreshState.candidates=candidates;refreshState.lastSuccessfulAt=data.lastSuccessfulAt;refreshState.status=data.message||'Retrieval completed; inspect before saving.';}else{if(questionContext()!==exactQuestion||state.mode!==mode)throw Error('Question changed; search results discarded. Search again explicitly.');q.candidates=candidates;q.searchStatus=data.message||'Retrieved candidates; usefulness not assessed.';}}
 }catch(e){const message=(e.name==='AbortError'?'Cancelled; an in-flight request may have consumed allowance.':e.message)+' No replacement evidence invented. Drafts preserved.';if(isRefresh)refreshState.status=message;else if(questionContext()===exactQuestion&&state.mode===mode)q[key]=message;}
 finally{clearTimeout(timer);if(workspaceController===controller)workspaceController=null;if(state.mode===mode&&(!isRefresh||state.topic===topic))renderKeepingPosition();}
}
async function saveCandidate(id,origin){
 
 try{
  const c=(origin==='feed'?refreshState.candidates:q.candidates).find(c=>c.id===id);if(!c)throw Error('Candidate no longer available.');validCandidates({status:'candidates',candidates:[c],lastSuccessfulAt:new Date().toISOString()});
  const url=safeLink(c.source.finalURL),canonical=u=>{const x=new URL(u);return x.origin+x.pathname.replace(/\/$/,'');};if(bankCards().some(card=>card.sources.some(s=>canonical(s.url)===canonical(url))))throw Error('This source is already in your Bank; it was not duplicated.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(url))))].map(b=>b.toString(16).padStart(2,'0')).join('');const cardId='external-'+hash.slice(0,24),published=/^\d{4}-\d{2}-\d{2}$/.test(c.source.publicationDate||'')?c.source.publicationDate:null;
  const card={id:cardId,title:c.title,gist:'Selected excerpt from '+c.title+'. Inspect the retained passage below; no full-article gist or question-relative relevance has been assessed.',analysis:'Not assessed. Compare this excerpt with your exact question and inspect its limitations.',evidence:[c.source.retrievedText],limitations:c.limitations,themes:[origin==='feed'?themeLabel(state.topic)||'Cross-theme':'Cross-theme'],folder:origin==='feed'?themeLabel(state.topic)||'Cross-theme':'Cross-theme',tags:[],notes:'',contentVersion:'external-selected-excerpt-v1',savedAt:new Date().toISOString(),eventDate:null,eventDatePrecision:'unknown',connections:[],sources:[{id:cardId+'-source',url,publisher:c.source.publisher||new URL(url).hostname,publicationDate:published,datePrecision:published?'day':'unknown',retrievedAt:c.source.retrievedAt||null,accessLevel:'retrieved public HTML selected excerpt; not search snippet or full article',availability:'Public selected excerpt at retrieval; not rechecked.',provenance:'Explicit '+(c.source.discoveryURL?'GOV.UK public-search':'external search')+' candidate chosen by student; actual public HTML selected passage, not a search snippet. Discovered via '+safeLink(c.source.discoveryURL||url)+'. Original publication metadata from retrieved HTML: '+(c.source.publicationDate||'unknown')+'. No event date or relevance inferred.',rights:'Rights unconfirmed; selected short excerpt only. No full-text archiving.',excerpt:c.source.retrievedText,excerptFidelity:'retrieved-selected-passage',excerptAssurance:'Deterministically selected short passage from bounded public HTML; not a full article or independently verified claim.'}]};
  saveSnapshot(activeStorage(),card);invalidateAssessment();q.revision=null;q.status='Chosen source saved and confirmed. Return to the same question and explicitly rerank; coverage has not been reassessed.';if(origin==='question'){q.searchStatus='Saved to Bank. Your exact question and previous choices are retained. Return and explicitly reassess the whole updated Bank.';}else refreshState.status='Chosen source saved in this browser; no automatic feed replacement or reranking.';
 }catch(e){if(origin==='question')q.searchStatus='Save not confirmed: '+e.message;else refreshState.status='Save not confirmed: '+e.message;}
 renderKeepingPosition();
}

let renderedDay=sgtDay();
function checkCalendar(visible=false){const day=sgtDay(),changed=day!==renderedDay;renderedDay=day;if(corpus&&state.mode==='explore'&&state.view==='topics'&&(changed||visible))renderKeepingPosition();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkCalendar(true);});
setInterval(checkCalendar,30000);

try {
  const response=await fetch('/data/archive.json'); if(!response.ok)throw new Error('Local archive request failed');
  corpus=validateCorpus(await response.json());
  try{const config=await fetch('/api/config');if(config.ok)aiConfig=await config.json();}catch{}
  history.replaceState({newsren:0,session},''); render(false); snapshots.set(0,{state:{...state},scroll:0,focus:'topic-arts-culture'});
} catch { $('stage').innerHTML='<h1>The archive couldn’t open.</h1><p>The local data is missing or invalid. No replacement stories or connections were invented. Reload to retry, or ask the owner to restore the local archive.</p>'; }
