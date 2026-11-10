import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {THEMES,resolveTheme} from '../public/lib/themes.mjs';
import {societyDependent} from '../public/lib/practice.mjs';
import {workspace,questionPacket,requestSociety,validateContext,bankRevision,invalidate,clearAssessment} from '../public/lib/question.mjs';
import {snapshot} from '../public/lib/storage.mjs';
const app=fs.readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
const corpus=JSON.parse(fs.readFileSync(new URL('../public/data/archive.json',import.meta.url)));
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
function extract(name){const start=app.indexOf('function '+name+'('),end=app.indexOf('\nfunction ',start+1);return app.slice(start,end);}
test('explicit reader-relative society wording only, not generic global society',()=>{
 for(const text of ['In your society, are artists valued?','Is our country doing enough?','What matters where you live?','Consider this society.'])assert.equal(societyDependent(text),true,text);
 for(const text of ['Does technology benefit society?','Can artists change the world?','Is Singapore a successful society?','How should countries respond?'])assert.equal(societyDependent(text),false,text);
});
test('global request context never silently imposes Singapore; exact wording unchanged',()=>{
 const c=snapshot(corpus,'uk-education-guidance'),q=workspace();q.selected=[c.id];
 for(const text of ['  Does technology benefit society?\nDiscuss.  ','  Should art be valued in your society?  ']){
  q.text=text;const before=JSON.stringify(q),packet=questionPacket(q,[c]);assert.equal(packet.question,text);assert.equal(JSON.stringify(q),before);
  assert.equal(packet.society,societyDependent(text)?'Singapore':undefined);
 }
 q.society='United Kingdom';assert.equal(questionPacket(q,[c]).society,'United Kingdom');assert.equal(q.text,'  Should art be valued in your society?  ');
 q.society='';assert.throws(()=>validateContext(q),/specific society/);q.text='Global issue?';validateContext(q);assert.match(requestSociety(q),/^Global/);
});
test('initial Question has exact input and one available primary action without Bank manager or supplied picker',()=>{
 const q=workspace();const context=vm.createContext({q,pickerTheme:'',pickerQuery:'',THEMES,resolveTheme,questionSubmitted:false,choosingEvidence:false,bankCards:()=>[],observeBank:cards=>bankRevision(cards),invalidate,clearAssessment,cancelRank:()=>{},rankController:null,rankingView:()=>'',aiConfig:{state:'unavailable'},esc:String,societyControl:()=>''});vm.runInContext(extract('question'),context);
 const view=context.question();assert.match(view,/What question are you working on/);assert.equal((view.match(/<button/g)||[]).length,1);assert.match(view,/data-action="submit-question"/);assert.doesNotMatch(view,/bank-card|Start with your Bank|practice-picker|question-society/);
 assert.doesNotMatch(app,/choose-practice|reset-society|practiceItems|fetch\('\/data\/practice/);
 assert.doesNotMatch(server,/\['\/data\/practice/);
});
test('submitted unavailable state is honest and saved choices remain optional',()=>{
 const q=workspace();const context=vm.createContext({q,pickerTheme:'',pickerQuery:'',THEMES,resolveTheme,questionSubmitted:true,choosingEvidence:false,workspaceController:null,aiConfig:{state:'unavailable'},bankCards:()=>[],observeBank:cards=>bankRevision(cards),invalidate,clearAssessment,cancelRank:()=>{},rankController:null,rankingView:()=>'',aiConfig:{state:'unavailable'},esc:String,societyControl:()=>''});vm.runInContext(extract('question'),context);
 const view=context.question();assert.match(view,/Choose saved articles manually/);assert.match(view,/No saved articles yet/);assert.match(view,/not ranked or assessed/);assert.doesNotMatch(view,/\/100 estimated/);
});
test('FAQ is a history-backed view, footer stays consistent and Bank help accordions are gone',()=>{
 assert.match(html,/id="faq"/);assert.match(app,/go\(\{mode:'faq'\}\)/);assert.match(app,/state.mode==='faq'\?faq\(\)/);
 const faq=extract('faq');for(const phrase of ['same browser','not a restorable backup','there is no import','chronology is not causation','currently unavailable'])assert.ok(faq.includes(phrase));
 const bank=app.slice(app.indexOf('  const filtered=findCards(cards,bankFilters)'),app.indexOf('function faq'));
 assert.doesNotMatch(bank,/bank-privacy|bank-filters.*<summary/);for(const control of ['bank-search','theme-filter','export-bank','bank-count'])assert.ok(bank.includes(control));
 assert.match(bank,/class="row-title" data-saved/);assert.match(bank,/cardMetadata\(c\)/);
});
