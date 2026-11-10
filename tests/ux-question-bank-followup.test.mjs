import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {THEMES,resolveTheme,themeLabel} from '../public/lib/themes.mjs';
import {jurisdictionLabel} from '../public/lib/practice.mjs';
import {workspace,displaySociety,evidenceSociety,requestSociety,questionPacket} from '../public/lib/question.mjs';
import {snapshot,findCards} from '../public/lib/storage.mjs';
const app=fs.readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
const corpus=JSON.parse(fs.readFileSync(new URL('../public/data/archive.json',import.meta.url)));
const card=snapshot(corpus,'study-mode');
function extract(name){const a=app.indexOf('function '+name+'(');return app.slice(a,app.indexOf('\nfunction ',a+1));}
function renderer(cards,theme='',query=''){
 const ctx=vm.createContext({bankCards:()=>cards,bankRenderedVersions:new Map(),savedView:null,bankTheme:theme,bankFilters:{query},findCards,resolveTheme,THEMES,esc:String,displayTheme:themeLabel,cardMetadata:()=>'',bankMessage:'',deletePending:null,q:workspace()});
 vm.runInContext(extract('bank'),ctx);return ctx;
}
test('global geography is neutral; display is separate from immutable packet context',()=>{
 const q=workspace();q.text='  Does technology benefit society?\nDiscuss.  ';q.selected=[card.id];const before=JSON.stringify(q);
 assert.equal(displaySociety(q),'Global question');assert.equal(evidenceSociety(q),null);
 assert.equal(requestSociety(q),'Global; follow any locations named in the exact question');
 for(const jurisdiction of ['Singapore','United Kingdom','France; international']){const label=jurisdictionLabel({jurisdiction},evidenceSociety(q));assert.match(label,/source location metadata/);assert.doesNotMatch(label,/overseas|comparative|Global;/);}
 assert.equal(questionPacket(q,[card]).question,q.text);assert.equal(JSON.stringify(q),before);
});
test('society labels use only explicit metadata, aliases, and conservative multi-location uncertainty',()=>{
 for(const jurisdiction of [undefined,'','unknown','overseas/see passage','not established','ambiguous'])assert.match(jurisdictionLabel({jurisdiction,publisher:'Singapore',url:'https://sg.example'},'Singapore'),/Location unknown/);
 assert.match(jurisdictionLabel({jurisdiction:'Singapore'},'SG'),/Singapore evidence/);
 assert.match(jurisdictionLabel({jurisdiction:'USA'},'United States'),/evidence · applicability/);
 assert.match(jurisdictionLabel({jurisdiction:'United Kingdom'},'Singapore'),/comparative evidence for Singapore/);
 for(const jurisdiction of ['Singapore; international','France; United States','International'])assert.match(jurisdictionLabel({jurisdiction},'Singapore'),/applicability unknown/);
 const q=workspace();q.text='What matters in your society?';q.society='UK';assert.equal(displaySociety(q),'UK');assert.equal(evidenceSociety(q),'UK');
});
test('six canonical options only; aliases dedup read-time without writing records',()=>{
 const legacy={...card,themes:['Technology','science-technology','Science and Technology','health'],tags:['free tag']};const before=JSON.stringify(legacy);
 const ctx=renderer([legacy],'Technology');const html=ctx.bank();
 assert.equal(ctx.bankTheme,'science-technology');assert.equal((html.match(/<option /g)||[]).length,7);assert.equal((html.match(/>Science and Technology<\/option>/g)||[]).length,1);assert.doesNotMatch(html,/>health<\/option>|>free tag<\/option>/);assert.match(html,/1 of 1 saved cards/);assert.equal(JSON.stringify(legacy),before);
});
test('invalid theme clears but valid empty theme and query persist with exact empty text and both recovery actions',()=>{
 const other={...card,themes:['arts-culture'],notes:'remaining'};
 const invalid=renderer([other],'health','no matching query');assert.match(invalid.bank(),/0 of 1 saved cards/);assert.equal(invalid.bankTheme,'');
 for(const cards of [[],[other]])for(const theme of THEMES.filter(t=>!cards.length||t.key!=='arts-culture')){
  const before=JSON.stringify(cards),ctx=renderer(cards,theme.key,'no matching query'),html=ctx.bank();
  assert.equal(ctx.bankTheme,theme.key);assert.equal(ctx.bankFilters.query,'no matching query');assert.ok(html.includes(`No saved articles in ${theme.label}.`));assert.ok(html.includes(`value="${theme.key}" selected`));
  assert.match(html,/data-action="clear-bank-filters">Clear filters<\/button>/);assert.match(html,/data-action="explore">Explore articles<\/button>/);assert.match(html,/value="no matching query"/);assert.equal((html.match(/<option /g)||[]).length,7);assert.equal(JSON.stringify(cards),before);
 }
});
test('editing last query match and removing or retheming last theme match never clear valid selection or search',()=>{
 const match={...card,themes:['Technology'],notes:'unique needle'},other={...card,id:'survivor',themes:['arts-culture'],notes:'remaining'},cards=[match,other],ctx=renderer(cards,'science-technology','unique needle');
 assert.match(ctx.bank(),/1 of 2 saved cards/);match.notes='explicit edit';let html=ctx.bank();assert.match(html,/No saved matches/);assert.match(html,/Clear filters/);assert.match(html,/Explore articles/);assert.equal(ctx.bankTheme,'science-technology');assert.equal(ctx.bankFilters.query,'unique needle');
 match.themes=['arts-culture'];html=ctx.bank();assert.match(html,/No saved articles in Science and Technology\./);assert.equal(ctx.bankTheme,'science-technology');
 cards.splice(0,1);const before=JSON.stringify(cards);html=ctx.bank();assert.match(html,/0 of 1 saved cards/);assert.match(html,/No saved articles in Science and Technology\./);assert.equal(ctx.bankTheme,'science-technology');assert.equal(ctx.bankFilters.query,'unique needle');assert.equal(JSON.stringify(cards),before);
});
test('collapsed removal has separate accurately named hit target and confirmation names the card',()=>{
 const ctx=renderer([card]);const html=ctx.bank();assert.match(html,/data-delete="study-mode" aria-label="Remove saved card:/);assert.match(html,/data-saved="study-mode"/);assert.doesNotMatch(html,/data-confirm-delete/);
 const confirmation=vm.createContext({esc:String});vm.runInContext(extract('deleteConfirmation'),confirmation);const view=confirmation.deleteConfirmation(card);assert.ok(view.includes(card.title));assert.match(view,/saved notes will also be removed/);assert.match(view,/data-action="cancel-delete"/);
});
