import { THEME_KEYS } from './themes.mjs';
const text = x => typeof x === 'string' && x.trim().length > 0;
const date = x => text(x) && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x;
// Only offset-bearing observed timestamps can be converted to Singapore time.
// Date-only values have an unknown zone; never silently interpret them as UTC.
export function publicationDisplayFor(observedValue, publisherDate = null) {
  const timed = typeof observedValue === 'string' && (/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(observedValue) || /\d{2}:\d{2}:\d{2} (?:GMT|[+-]\d{4})$/.test(observedValue));
  const instant = timed ? Date.parse(observedValue) : NaN;
  if (Number.isFinite(instant)) return {day:new Date(instant + 8*3600000).toISOString().slice(0,10),zone:'Asia/Singapore',derived:true,basis:observedValue,label:'SGT (UTC+08:00)'};
  return {day:publisherDate,zone:'publisher date; zone unknown',derived:false,basis:observedValue ?? null,label:'Publisher date (zone unknown)'};
}
export function validateCorpus(c) {
  const fail = m => { throw new Error(`Archive unavailable: ${m}`); };
  if (!c || c.version !== 1) fail('unsupported schema');
  for (const k of ['sources','articles','events','edges']) {
    if (!Array.isArray(c[k])) fail(`missing ${k}`);
    const ids = c[k].map(x => x?.id);
    if (ids.some(x => !text(x)) || new Set(ids).size !== ids.length) fail(`invalid ${k} IDs`);
  }
  if (!c.sources.length || !c.articles.length || !c.events.length) fail('empty corpus');
  const sources = new Map(c.sources.map(s => [s.id,s]));
  const events = new Map(c.events.map(e => [e.id,e]));
  const articles = new Map(c.articles.map(a => [a.id,a]));
  const urls = new Set();
  for (const s of c.sources) {
    let u; try { u = new URL(s.url); } catch { fail('invalid source URL'); }
    if (u.protocol !== 'https:' || u.username || u.password || urls.has(u.href)) fail('unsafe or duplicate source URL');
    urls.add(u.href);
    if (!(date(s.publicationDate) && s.datePrecision === 'day' || s.publicationDate === null && s.datePrecision === 'unknown') || !(s.retrievedAt === null && s.accessLevel === 'unknown' || s.accessLevel === 'metadata-and-excerpt' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(Z|[+-]\d{2}:\d{2})$/.test(s.retrievedAt) && !Number.isNaN(Date.parse(s.retrievedAt)))) fail('unsupported source/date/access claim');
    for (const k of ['publisher','availability','provenance','verification','rights']) if (!text(s[k])) fail(`missing source ${k}`);
    if (!['reporting','opinion','research','announcement'].includes(s.editorialType) || typeof s.independentReporting !== 'boolean' || !text(s.independentReportingRationale) || s.independentReporting && s.editorialType !== 'reporting') fail('invalid editorial classification');
    if (s.excerpt) {
      if (s.excerpt.length>1250 || s.excerptFidelity!=='normalised-selected-passage' || s.evidenceKind!=='normalisedretainedpassage' || !Array.isArray(s.excerptParagraphs) || s.excerptParagraphs.join('\n\n')!==s.excerpt || !text(s.excerptAssurance) || !s.excerptTransformNotes?.length) fail('unsupported curated fidelity');
      const expected=publicationDisplayFor(s.dateAssurance?.observedValue,s.publicationDate);
      if (!s.publicationOriginal || s.publicationOriginal.historicalStoredDay!==s.publicationDate || Object.keys(expected).some(k=>s.publicationDisplay?.[k]!==expected[k])) fail('unsupported zoned publication display');
    }
    const d=s.dateAssurance;
    if (!d || !['observed-metadata','visible-dateline','url-only','prior-unconfirmed','unknown'].includes(d.tier) || d.verified !== ['observed-metadata','visible-dateline'].includes(d.tier) || d.verified && (!date(s.publicationDate) || !text(d.observedValue) || !text(d.observedAt)) || d.tier==='unknown' && s.publicationDate!==null) fail('unsupported date assurance');
  }
  const support = (r, allowed) => {
    const s=sources.get(r?.sourceId);
    if (r?.kind!=='normalisedretainedpassage' || !s || !allowed.includes(s.id) || r.excerptId!==s.excerptId || r.excerptHash!==s.excerptHash || !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.start<0 || r.end<=r.start || r.end>s.excerpt?.length || s.excerpt.slice(r.start,r.end)!==r.quote || !text(r.provenance) || !text(r.limitations)) fail('invalid claim support span');
  };
  for (const a of c.articles) {
    if (!THEME_KEYS.includes(a.primaryTopic) || !['initial','context','legacy-inactive'].includes(a.editorialTier) || a.active !== (a.editorialTier!=='legacy-inactive')) fail('invalid theme or editorial tier');
    if (a.active && !text(sources.get(a.sourceId)?.excerpt)) fail('missing primary topic or retained evidence');
    if (!sources.has(a.sourceId) || !events.has(a.eventId)) fail('invalid article reference/title');
    if (a.publisherHeadline !== null || a.headlineVerification) {
      const v = a.headlineVerification;
      if (!v || !['verified','unavailable'].includes(v.status) || v.url !== sources.get(a.sourceId).url || !text(v.observedAt) || !/^\d{4}-\d{2}-\d{2}T/.test(v.observedAt) || Number.isNaN(Date.parse(v.observedAt))) fail('invalid headline provenance');
      if (v.status === 'verified' ? !text(a.publisherHeadline) || v.observedHeading !== a.publisherHeadline || !['h1','schemaHeadline','title'].includes(v.method) : a.publisherHeadline !== null || !text(v.reason)) fail('unsupported headline claim');
    }
    if (a.listHook !== undefined && (!text(a.listHook) || a.listHook.length > 120 || /[\r\n]/.test(a.listHook))) fail('invalid list hook');
    for (const k of ['explanatoryTitle','gist','analysis','limitations','contentVersion']) if (!text(a[k])) fail(`missing article ${k}`);
    if (!Array.isArray(a.themes) || !a.themes.length || !a.themes.every(text) || !Array.isArray(a.evidence) || !a.evidence.length || !a.evidence.every(text)) fail('missing evidence/themes');
    if (!Array.isArray(a.evidenceRefs) || !a.evidenceRefs.includes(a.sourceId) || !a.evidenceRefs.every(r => sources.has(r))) fail('unsupported article evidence');
    const s=sources.get(a.sourceId);
    if (a.dateVerified !== s.dateAssurance.verified && a.active) fail('article date assurance mismatch');
    if (a.active) {
      if (!Array.isArray(a.claimSupport) || !a.claimSupport.length || a.claimSupport.map(x=>x.claim).join(' ')!==a.gist) fail('missing gist claim map');
      for (const claim of a.claimSupport) { if (!text(claim.claim) || !claim.premiseSpans?.length) fail('empty claim'); support(claim.support,a.evidenceRefs); for(const r of claim.premiseSpans) support(r,a.evidenceRefs); }
      if(a.evidenceKind!=='normalisedretainedpassage' || !a.hookPremises?.length) fail('missing normalised premise method');
      for(const r of a.hookPremises) support(r,a.evidenceRefs);
      if (!Array.isArray(a.sourceClaims) || a.sourceClaims.length!==a.evidence.length || a.sourceClaims.some((x,i)=>x.text!==a.evidence[i]) || a.evidence.includes(a.gist)) fail('source evidence must be separate from gist');
      for (const claim of a.sourceClaims) { support(claim.support,a.evidenceRefs); if(claim.text!==claim.support.quote) fail('source claim differs from retained span'); }
      if (!text(a.analysisSupport?.kind) || !a.analysisSupport.premises?.length || !text(a.analysisSupport.limitations)) fail('missing analysis premises');
      for(const r of a.analysisSupport.premises) support(r,a.evidenceRefs);
    }
    if (a.editorialTier==='initial' && (!a.dateVerified || a.headlineVerification?.status!=='verified' || s.accessLevel!=='metadata-and-excerpt')) fail('initial article not qualified');
  }
  for (const e of c.events) if (!(date(e.date) || e.date === null && e.datePrecision === 'unknown') || !text(e.title) || !Array.isArray(e.articleIds) || !e.articleIds.length || !e.articleIds.every(id => articles.get(id)?.eventId === e.id)) fail('invalid event');
  const types = ['earlier development','update in the same issue','documented response','parallel development','shared debate','contrast','proposed/uncertain influence'];
  for (const e of c.edges) {
    if (!events.has(e.fromEvent) || !events.has(e.toEvent) || e.fromEvent === e.toEvent || !types.includes(e.type)) fail('unsupported relationship');
    for (const k of ['lane','explanation','uncertainty','verification','originalType']) if (!text(e[k])) fail(`missing edge ${k}`);
    if (!['source-asserted','Newsren-inferred'].includes(e.interpretation)) fail('missing interpretation');
    if (!Array.isArray(e.dates) || e.dates.length !== 2 || e.dates[0] !== events.get(e.fromEvent).date || e.dates[1] !== events.get(e.toEvent).date) fail('edge chronology mismatch');
    const refs = [e.fromEvent,e.toEvent].flatMap(id => events.get(id).articleIds.map(a => articles.get(a).sourceId));
    if (!Array.isArray(e.evidenceRefs) || !refs.every(r => e.evidenceRefs.includes(r)) || !e.evidenceRefs.every(r => sources.has(r))) fail('unsupported edge evidence');
    if (!Array.isArray(e.premiseSupport) || !refs.every(id=>e.premiseSupport.some(r=>r.sourceId===id))) fail('missing endpoint premises');
    for(const r of e.premiseSupport) support(r,refs);
  }
  const primary=c.articles.filter(a=>a.editorialTier==='initial');
  if (new Set(primary.map(a=>a.sourceId)).size!==primary.length) fail('duplicate initial source coverage');
  return c;
}
export function projectRelationships(c, anchor, expanded = false) {
  if (!c.events.some(e => e.id === anchor)) throw new Error('Unknown map anchor');
  const incident=c.edges.filter(e => e.fromEvent === anchor || e.toEvent === anchor);
  return expanded ? incident : incident.slice(0,2);
}
