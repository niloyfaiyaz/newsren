import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {KEY,readBank,snapshot,saveSnapshot,deleteSnapshot} from '../public/lib/storage.mjs';
const corpus=JSON.parse(await readFile(new URL('../public/data/archive.json',import.meta.url)));
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('explicit self-contained snapshot retains evidence/source/date/themes/limits/connections/empty notes',()=>{
 const storage=memory(),card=snapshot(corpus,'uk-education-guidance');assert.equal(readBank(storage).cards.length,0);
 saveSnapshot(storage,card);const saved=readBank(storage).cards[0];assert.deepEqual(saved,card);assert.equal(saved.notes,'');assert.equal(saved.eventDate,null);assert.equal(saved.connections.length,1);assert.equal(saved.sources.length,2);
 assert.throws(()=>saveSnapshot(storage,{...card,notes:'must not overwrite'}),/already saved/);assert.equal(readBank(storage).cards[0].notes,'');
 deleteSnapshot(storage,card.id);assert.equal(readBank(storage).cards.length,0);
});
test('blocked read/write and corrupt/unknown schema never report success or overwrite protected data',()=>{
 const card=snapshot(corpus,'detector-bias');
 assert.throws(()=>saveSnapshot({getItem(){throw Error('blocked');}},card));
 assert.throws(()=>saveSnapshot({getItem:()=>null,setItem(){throw Error('quota');}},card));
 for(const raw of ['{','{}',JSON.stringify({version:2,cards:[]}),JSON.stringify({version:1,cards:[{id:'bad'}]})]){let writes=0;const storage={getItem:()=>raw,setItem(){writes++;}};assert.throws(()=>saveSnapshot(storage,card));assert.equal(writes,0);}
});
test('schema/card quota, concurrent change and unconfirmed write fail honestly',()=>{
 const card={...snapshot(corpus,'detector-bias'),sources:[{publisher:'Synthetic quota fixture',url:'https://example.org/quota-test',publicationDate:null,datePrecision:'unknown',accessLevel:'metadata-only'}],connections:[]},storage=memory();
 for(let i=0;i<100;i++)saveSnapshot(storage,{...card,id:'synthetic-'+i});assert.throws(()=>saveSnapshot(storage,card));assert.equal(readBank(storage).cards.length,100);
 assert.throws(()=>saveSnapshot(memory(),{...card,evidence:Array(100).fill('x'.repeat(12000))}),/1 MiB/);
 let reads=0;assert.throws(()=>saveSnapshot({getItem(){reads++;return reads<3?null:JSON.stringify({version:1,cards:[]});},setItem(){throw Error('should not write');}},card),/another tab/);
 assert.throws(()=>saveSnapshot({getItem:()=>null,setItem(){}},card),/confirmed/);
 assert.equal(KEY,'newsren.snapshots.v1');
});
