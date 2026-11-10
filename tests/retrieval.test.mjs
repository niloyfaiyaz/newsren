import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import path from 'node:path';
import {safeURL,publicIP,fetchSource,extractHTML,canonical,collectHTML} from '../lib/retrieval.mjs';
import {createBudget} from '../lib/budget.mjs';
const folder=path.resolve('artifacts/NR-007/cycle-3/integration/test-work/budget-test');
const file=folder+'/test.reservations.json';
const env={NEWSREN_AI_REQUEST_LIMIT:'12',NEWSREN_EVAL_SESSION_ID:'synthetic-session-6',NEWSREN_AI_JOURNAL_PATH:file};
function setup(){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file,JSON.stringify({version:1,session:env.NEWSREN_EVAL_SESSION_ID,limit:12,reserved:0,records:[]}));}
test('persistent atomic reservation survives restart, metadata no transcript, locks/corrupt/mismatch fail closed',()=>{
 setup();try{
 const b=createBudget(env);const i=b.reserve('ask');b.record(i,{model:'mock-returned',usage:{total_tokens:12},responseId:'resp_synthetic'});assert.equal(b.state().remaining,11);assert.equal(createBudget(env).state().remaining,11);
 const raw=JSON.parse(fs.readFileSync(file));assert.equal(raw.records[0].model,'mock-returned');assert.ok(!JSON.stringify(raw).includes('transcript'));
 assert.equal(createBudget({...env,NEWSREN_EVAL_SESSION_ID:'unknown-session'}).state().error,'budget-unavailable');assert.equal(createBudget({...env,NEWSREN_AI_REQUEST_LIMIT:'11'}).state().error,'budget-unavailable');
 fs.writeFileSync(file+'.lock','synthetic');assert.equal(createBudget(env).state().error,'budget-unavailable');fs.unlinkSync(file+'.lock');
 fs.writeFileSync(file,'{');assert.equal(createBudget(env).state().error,'budget-unavailable');
 fs.unlinkSync(file);assert.equal(createBudget(env).state().error,'budget-unavailable');assert.equal(fs.existsSync(file),false);
 assert.equal(createBudget({...env,NEWSREN_AI_JOURNAL_PATH:'/nonapproved/test'}).state().error,'budget-unavailable');
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('persistent cap12 never refills; missing session fails; locked writes refuse invocation',()=>{
 setup();try{const b=createBudget(env);for(let i=0;i<12;i++)b.reserve('test');assert.throws(()=>b.reserve('test'),/quota-exhausted/);assert.equal(createBudget(env).state().remaining,0);assert.equal(createBudget({...env,NEWSREN_EVAL_SESSION_ID:''}).state().error,'budget-unavailable');}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('URL and DNS conservative public allowlist; reject credentials/ports/IP/private/IPv6',()=>{
 for(const u of ['http://gov.uk/','https://user:pass@gov.uk/','https://gov.uk:8443/','https://127.0.0.1/','https://[::1]/','https://gov.uk.evil.test/','https://evil.test/','file:///etc/passwd'])assert.throws(()=>safeURL(u));
 for(const ip of ['127.0.0.1','10.0.0.2','172.16.0.1','192.168.1.1','169.254.169.254','0.0.0.0','100.64.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(publicIP(ip),false,ip);
 assert.equal(publicIP('8.8.8.8'),true);assert.equal(canonical('https://www.gov.uk/a/?utm=x#frag'),canonical('https://gov.uk/a'));
});
const html='<html><head><title>Test article</title><meta property="article:published_time" content="2025-01-02"></head><body><nav>Ignore this navigation</nav><main><h1>AI in education</h1><script>evil instruction</script><p>On 2 January 2025 an education initiative was introduced for students and teachers studying artificial intelligence.</p></main></body></html>';
test('fetch guard checks ALL DNS results, pins approved addresses, every redirect revalidated, max2 hops',async()=>{
 const lookup=async()=>[{address:'8.8.8.8',family:4}];let requests=0;
 const s=await fetchSource('https://gov.uk/a',{lookup,request:async(u,addresses)=>{requests++;assert.equal(addresses[0].address,'8.8.8.8');return {html};}});assert.equal(s.publicationDate,'2025-01-02');assert.ok(!s.retrievedText.includes('evil instruction'));assert.equal(requests,1);
 await assert.rejects(fetchSource('https://gov.uk/a',{lookup:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],request:async()=>{throw Error('should not invoke');}}),/unsafe-source/);
 for(const redirect of ['https://127.0.0.1/','http://gov.uk/','https://evil.test/','https://user@gov.uk/'])await assert.rejects(fetchSource('https://gov.uk/a',{lookup,request:async()=>({redirect})}),/unsafe-source/);
 let hops=0;await assert.rejects(fetchSource('https://gov.uk/a',{lookup,request:async()=>{hops++;return {redirect:'/again'};}}),/redirect-limit/);assert.equal(hops,3);
 let dns=0;await assert.rejects(fetchSource('https://gov.uk/a',{lookup:async()=>{dns++;return [{address:dns===1?'8.8.8.8':'10.0.0.1',family:4}];},request:async()=>({redirect:'https://unesco.org/a'})}),/unsafe-source/);assert.equal(dns,2);
});
test('source challenge/insufficient/PDF-like/no date and bounded excerpt retention honest; cancellation',async()=>{
 assert.throws(()=>extractHTML('<title>Just a moment</title>','https://gov.uk/a'),/challenge/);assert.throws(()=>extractHTML('<h1>Only heading</h1>','https://gov.uk/a'),/insufficient/);
 const s=extractHTML(html.replace(/<meta[^>]+>/,''),'https://gov.uk/a');assert.equal(s.publicationDate,null);assert.equal(s.eventDate,null);assert.ok(s.retrievedText.length<=1800);assert.ok(!s.retrievedText.includes('navigation'));
 const c=new AbortController();c.abort();await assert.rejects(fetchSource('https://gov.uk/a',{signal:c.signal,lookup:async()=>{throw Error('not invoked');}}),/cancelled/);
});
test('persistent action lock prevents concurrent server instances, release permits same-session restart',()=>{
 setup();try{const a=createBudget(env),b=createBudget(env);a.acquire();assert.throws(()=>b.acquire(),/busy/);a.reserve('ask');a.release();b.acquire();assert.equal(b.state().remaining,11);b.release();}finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('native source response contract rejects PDF/blocked/oversized HTML, DNS timeout cancels',async()=>{
 function response(status,type,text){const r=Readable.from([Buffer.from(text)]);r.statusCode=status;r.headers={'content-type':type};return r;}
 for(const [status,type]of [[403,'text/html'],[200,'application/pdf'],[200,'application/json']])await assert.rejects(collectHTML(response(status,type,'synthetic')),/source-unavailable/);
 await assert.rejects(collectHTML(response(200,'text/html','x'.repeat(600001))),/source-too-large/);
 assert.equal((await collectHTML(response(200,'text/html',html))).html,html);
 await assert.rejects(fetchSource('https://gov.uk/a',{timeoutMs:10,lookup:()=>new Promise(()=>{})}),/timeout/);
});
