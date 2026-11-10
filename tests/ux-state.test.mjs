import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const app=fs.readFileSync(new URL('../public/app.mjs',import.meta.url),'utf8');
function extract(name){const start=app.indexOf('function '+name+'('),end=app.indexOf('\nfunction ',start+1);return app.slice(start,end);}
test('detail identity is stable card/key identity, never repeated summary text',()=>{
 const context=vm.createContext({});vm.runInContext(extract('detailKey'),context);
 const first={dataset:{detailKey:'first:proof'}},second={dataset:{detailKey:'second:proof'}};
 assert.notEqual(context.detailKey(first),context.detailKey(second));assert.equal(context.detailKey(first),'first:proof');
 assert.doesNotMatch(extract('renderKeepingPosition'),/summary.*textContent/);
 assert.match(app,/e\.open=openDetails\.has\(detailKey\(e\)\)/);
});
test('opening search captures origin before mutation and reveals actual heading; repeated open does not replace origin',()=>{
 const action=app.slice(app.indexOf("case 'external':"),app.indexOf("case 'rank':"));
 assert.match(action,/if\(!q.external\)/);assert.ok(action.indexOf('externalOrigin=paneContext()')<action.indexOf('q.external=true'));
 assert.match(action,/revealHeading\('external-title'\)/);assert.match(action,/returnContext\(externalOrigin\)/);
 const reveal=extract('revealHeading');assert.match(reveal,/heading.focus\(\{preventScroll:true\}\)/);assert.match(reveal,/pane.scrollTop/);assert.match(reveal,/getBoundingClientRect/);
});
test('disclosure, focus and pane scroll restoration are read-only UI operations',()=>{
 for(const name of ['paneContext','rememberDetails','returnContext','renderKeepingPosition']){
  const code=extract(name);assert.doesNotMatch(code,/saveSnapshot|editSnapshot|deleteSnapshot|setItem|removeItem|clear\(/);
 }
 assert.match(extract('returnContext'),/restoreControl\(position.focus\)/);
 assert.match(extract('returnContext'),/scrollTop=position.mainScroll/);
});
test('companion distinctions are literal/empty/error facts, not semantic fit claims',()=>{
 for(const phrase of ['Your Bank is empty.','Your Bank cannot be read.','No verified connections here yet.'])assert.ok(app.includes(phrase));
 assert.match(app,/saved-card AI help is unavailable; no current-article substitution/);
});
test('filtered-away disclosure identity survives without opening its repeated siblings',()=>{
 let nodes=[{dataset:{detailKey:'one:proof'},open:true},{dataset:{detailKey:'two:proof'},open:false}];
 const context=vm.createContext({disclosureMemory:new Map(),viewKey:()=> 'question',$:()=>({querySelectorAll:()=>nodes})});
 vm.runInContext(extract('detailKey')+'\n'+extract('rememberDetails'),context);
 context.rememberDetails();nodes=[{dataset:{detailKey:'two:proof'},open:false}];context.rememberDetails();
 assert.deepEqual([...context.disclosureMemory.get('question')],['one:proof']);
 nodes=[{dataset:{detailKey:'one:proof'},open:false}];context.rememberDetails();assert.equal(context.disclosureMemory.get('question').size,0);
});
test('history accepts semantic summary keys as well as legacy raw element IDs',()=>{
 assert.match(extract('restore'),/restoreControl\(\$\(snapshot.focus\)\?'id:'\+snapshot.focus:snapshot.focus\)/);
});
test('compact personal summary reflects assigned role and note existence without exposing note',()=>{
 const context=vm.createContext({q:{roles:{one:'Counterargument'},usage:{one:'private draft',two:'  '}}});vm.runInContext(extract('personalLabel'),context);
 assert.match(context.personalLabel('one'),/Role: Counterargument.*usage note added/);assert.doesNotMatch(context.personalLabel('one'),/private draft/);assert.match(context.personalLabel('two'),/no role assigned.*no usage note/);
});
test('remaining candidate proof uses stable IDs; removed edge disclosure is not rendered',()=>{
 assert.ok(app.includes('data-detail-key="candidate:${esc(origin)}:${esc(c.id)}:proof"'));
});
test('repeat external reveal occurs after first-origin guard',()=>{
 const action=app.slice(app.indexOf("case 'external':"),app.indexOf("case 'rank':"));assert.match(action,/renderKeepingPosition\(\);\}revealHeading\('external-title'\)/);
});
test('focus restoration rejects closed-detail descendants and prefers Bank heading',()=>{
 let focused=null;const hidden={disabled:false,getClientRects:()=>[],focus:()=>{throw Error('hidden focus');}},heading={getClientRects:()=>[{}],focus:()=>focused='heading'};
 const context=vm.createContext({$:id=>id==='hidden'?hidden:id==='bank-title'?heading:null,document:{querySelector:()=>null}});vm.runInContext(extract('restoreControl'),context);context.restoreControl('id:hidden');assert.equal(focused,'heading');
});

test('reachable live-region updates never announce a removed reassessment workflow',()=>{const invalidateCode=extract('invalidateAssessment'),renderCode=extract('render');assert.doesNotMatch(invalidateCode,/announce\(q.status\)/);assert.doesNotMatch(renderCode,/announce\(state.mode==='question'\?q.searchStatus/);assert.doesNotMatch(renderCode,/announce\(state.mode==='question'/);assert.match(extract('go'),/announce\(''\)/);assert.match(extract('restore'),/announce\(''\)/);});

test('explicit Question return follows nested original pane contexts instead of losing origin',()=>{const branch=app.slice(app.indexOf("case 'question-return':"),app.indexOf("case 'submit-question':"));let restored=null,change=null;const origin={state:{mode:'question'},mainScroll:724,scroll:23,focus:'saved-article'};const ctx=vm.createContext({state:{returnTo:{state:{mode:'bank',returnTo:origin}}},go:c=>change=c,restore:p=>restored=p});vm.runInContext("switch('question-return'){"+branch+'}',ctx);assert.equal(restored,origin);assert.equal(change,origin.state);assert.equal(restored.mainScroll,724);});

test('article Save and related Save share verified duplicate/race handling; faults cannot be mistaken for duplicates',()=>{let cards=[],mode='normal',calls=0;const ctx=vm.createContext({bankCards:()=>{if(mode==='read-fault')throw Error('unreadable');return cards;},activeStorage:()=>({}),corpus:{},snapshot:(_,id)=>({id}),saveSnapshot:(_,card)=>{calls++;if(mode==='race'){cards.push(card);throw Error('Snapshot already saved; existing notes and evidence were not overwritten.');}if(mode==='write-fault')throw Error('write failed');cards.push(card);}});vm.runInContext(extract('saveArticleSnapshot'),ctx);assert.equal(ctx.saveArticleSnapshot('one'),'Saved to Bank');assert.match(ctx.saveArticleSnapshot('one'),/Already saved/);assert.equal(calls,1);mode='race';assert.match(ctx.saveArticleSnapshot('two'),/Already saved/);mode='write-fault';assert.throws(()=>ctx.saveArticleSnapshot('three'),/write failed/);mode='read-fault';assert.throws(()=>ctx.saveArticleSnapshot('one'),/unreadable/);assert.ok(app.includes('const message=saveArticleSnapshot(id)'));assert.ok(app.includes('const message=saveArticleSnapshot(state.article)'));});

test('true go and restore navigation clear action messages even within Bank; direct edit renders preserve immediate success and failure',()=>{
 const seen=[],ctx=vm.createContext({state:{mode:'bank',savedView:'one'},bankMessage:'Personal changes confirmed',savedView:'one',serial:0,current:0,session:'test',paneContext:()=>({state:{mode:'bank',savedView:'one'}}),resolveTheme:x=>x,announce:()=>{},cancelContext:()=>{},stash:()=>{},history:{pushState:()=>{}},window:{addEventListener:()=>{}},render:()=>seen.push(ctx.bankMessage),document:{activeElement:null,body:{classList:{contains:()=>false}}},requestAnimationFrame:()=>{}});vm.runInContext(extract('go')+'\n'+extract('restore'),ctx);
 ctx.go({mode:'bank',savedView:null});assert.equal(ctx.bankMessage,'');assert.equal(seen.at(-1),'');
 ctx.bankMessage='Changes not confirmed';ctx.restore({state:{mode:'bank',savedView:'one'}});assert.equal(ctx.bankMessage,'');assert.equal(seen.at(-1),'');
 const branch=app.slice(app.indexOf("case 'edit-card':"),app.indexOf("case 'export-bank':"));let failure=false;Object.assign(ctx,{bankDrafts:new Map([['one',{notes:'new note',folder:'',tags:'tag',expected:'old'}]]),savedView:'one',editSnapshot:()=>{if(failure)throw Error('SYNTHETIC write failure');},activeStorage:()=>({}),invalidateAssessment:()=>{},renderKeepingPosition:()=>seen.push(ctx.bankMessage)});
 vm.runInContext("switch('edit-card'){"+branch+'}',ctx);assert.equal(seen.at(-1),'Personal changes confirmed in this browser.');failure=true;ctx.bankDrafts.set('one',{notes:'retained',folder:'',tags:'',expected:'old'});vm.runInContext("switch('edit-card'){"+branch+'}',ctx);assert.equal(seen.at(-1),'Changes not confirmed. SYNTHETIC write failure');assert.equal(ctx.bankDrafts.get('one').notes,'retained');
});
