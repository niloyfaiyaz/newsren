import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createServer} from '../server.mjs';import {KEY,readBank,snapshot,saveSnapshot,editSnapshot,deleteSnapshot,exportBank} from '../public/lib/storage.mjs';import {workspace} from '../public/lib/question.mjs';import {projectRelationships} from '../public/lib/corpus.mjs';
const corpus=JSON.parse(fs.readFileSync('public/data/archive.json')),ids=['nr008-zello','nr008-surveillance','nr008-platforms','nr008-whatsapp','nr008-deepfake','nr008-oversight'];
test('ordinary archive read, explicit save/reload/dedup/edit/export/delete preserve synthetic legacy fields',()=>{
 const old={...snapshot(corpus,'study-mode','2024-01-01T00:00:00Z'),notes:'SYNTHETIC legacy <img src=x>',tags:['old'],folder:'Original folder',unknownLegacyField:{retain:true}};
 let raw=JSON.stringify({version:1,cards:[old]},null,2),writes=0;const initial=raw,storage={getItem:k=>{assert.equal(k,KEY);return raw;},setItem:(k,v)=>{assert.equal(k,KEY);writes++;raw=v;}};
 assert.deepEqual(readBank(storage).cards[0],old);for(const id of ids){const a=corpus.articles.find(a=>a.id===id);assert.ok(a.evidenceApplications.length);assert.ok(a.contentNotes.length);snapshot(corpus,id);assert.ok(projectRelationships(corpus,a.eventId,true).length);}
 assert.equal(writes,0);assert.equal(raw,initial);assert.equal(workspace().text,'');
 for(const id of ids)saveSnapshot(storage,snapshot(corpus,id));assert.equal(writes,6);assert.equal(readBank(storage).cards.length,7);assert.deepEqual(readBank(storage).cards[0],old);
 const before=raw;assert.throws(()=>saveSnapshot(storage,snapshot(corpus,ids[0])),/already saved/);assert.equal(raw,before);
 const chosen=readBank(storage).cards.find(c=>c.id===ids[0]);editSnapshot(storage,chosen.id,{notes:'SYNTHETIC explicit note'},JSON.stringify(chosen));assert.match(exportBank(readBank(storage).cards),/SYNTHETIC explicit note/);assert.match(exportBank(readBank(storage).cards),/2024-07-16T10:00:00\+00:00/);deleteSnapshot(storage,chosen.id);assert.deepEqual(readBank(storage).cards[0],old);assert.equal(readBank(storage).cards.length,6);
});
test('ordinary failures have no destructive fallback or success on corrupt/blocked/quota/unconfirmed/conflict',()=>{
 const card=snapshot(corpus,ids[0]);for(const fault of ['corrupt','blocked','quota','unconfirmed','conflict']){let raw=fault==='corrupt'?'SYNTHETIC corrupt':null,n=0,writes=0;const storage={getItem(){if(fault==='blocked')throw Error('blocked');if(fault==='conflict'&&++n>=3)return JSON.stringify({version:1,cards:[]});return raw;},setItem(k,v){writes++;if(fault==='quota')throw Error('quota');if(fault!=='unconfirmed')raw=v;}};assert.throws(()=>saveSnapshot(storage,card));assert.equal(raw,fault==='corrupt'?'SYNTHETIC corrupt':null);assert.equal(writes,['quota','unconfirmed'].includes(fault)?1:0);}
});
test('only ordinary archive and dates route exist; deleted runtime assets and arbitrary paths return404',async()=>{
 const s=await createServer(undefined,{env:{NEWSREN_AI_REQUEST_LIMIT:'0'}});await new Promise(r=>s.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+s.address().port;try{
 const archive=await fetch(base+'/data/archive.json');assert.equal(archive.status,200);assert.equal((await archive.json()).articles.length,109);
 const dates=await fetch(base+'/lib/dates.mjs');assert.equal(dates.status,200);assert.match(dates.headers.get('content-type'),/text\/javascript/);
 for(const path of ['/lib/demo.mjs','/data/democracy-demo.json','/lib/unknown.mjs'])assert.equal((await fetch(base+path)).status,404);
 }finally{await new Promise(r=>s.close(r));}
});
test('ordinary export retains original observation and legacy fallbacks without inferred zones or substantive updates',()=>{
 const card=snapshot(corpus,'nr008-zello');for(const [original,assurance,expected] of [[{value:'legacy-exact'},undefined,'legacy-exact'],[undefined,{observedValue:'fallback-exact'},'fallback-exact']]){const c=structuredClone(card);c.sources=[c.sources[0]];c.sources[0].publicationOriginal=original;c.sources[0].dateAssurance=assurance;assert.ok(exportBank([c]).includes('Original publication value: '+expected));}
 const legacy=structuredClone(card);delete legacy.sources[0].publicationOriginal;delete legacy.sources[0].dateAssurance;legacy.notes='SYNTHETIC legacy note';assert.match(exportBank([legacy]),/SYNTHETIC legacy note/);assert.match(exportBank([legacy]),/Original publication value: unknown/);
 const modified=structuredClone(card);modified.sources[0].updatedAt='2026-10-25T00:00:00Z';assert.match(exportBank([modified]),/Publisher metadata modified: 2026-10-25T00:00:00Z; substantive change not verified/);assert.match(exportBank([modified]),/No verified substantive update recorded/);
 const updated=structuredClone(card);updated.sources[0].substantiveUpdate={verified:true,observedValue:'2026-10-25',description:'Correction',evidenceRef:'retained-ref'};assert.match(exportBank([updated]),/Substantively updated: 2026-10-25 · Correction/);
});
