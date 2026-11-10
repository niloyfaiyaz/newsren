import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { createServer } from '../server.mjs';
const fixture=new URL('../artifacts/NR-007/cycle-3/integration/test-work/server-fixture/',import.meta.url);
let port;
function request(path,method='GET') { return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();}); }
test('ephemeral loopback static allowlist: methods, raw traversal, secrets, symlinks, HEAD and headers',async()=>{
 // Disposable synthetic local filesystem only. Never copy real environment data.
 await mkdir(new URL('data/',fixture),{recursive:true});
 await writeFile(new URL('data/archive.json',fixture),await readFile(new URL('../public/data/archive.json',import.meta.url)));
 await writeFile(new URL('index.html',fixture),'<!doctype html><title>synthetic</title>');
 await writeFile(new URL('synthetic-secret.txt',fixture),'synthetic canary');
 await writeFile(new URL('.env',fixture),'SYNTHETIC_CANARY_ONLY=true');
 await symlink(new URL('synthetic-secret.txt',fixture).pathname,new URL('styles.css',fixture));
 await symlink(new URL('data/',fixture).pathname,new URL('assets',fixture));
 const server=await createServer(fixture.pathname);
 try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  port=server.address().port;assert.equal(server.address().address,'127.0.0.1');
  const ok=await request('/');assert.equal(ok.status,200);assert.match(ok.headers['content-security-policy'],/default-src 'none'/);assert.equal(ok.headers['x-content-type-options'],'nosniff');
  assert.equal((await request('/','HEAD')).body,'');
  for(const p of ['/../.env','/%2e%2e/.env','//.env','/.env','/server.mjs','/package.json','/synthetic-secret.txt','/data/../.env','/assets/idle.svg','/styles.css','/api/ai','/index.html','/%2f','/data/archive.json/','/data/practice.json','/data/practice-original.txt'])assert.equal((await request(p)).status,404,p);
  for(const m of ['POST','PUT','DELETE','OPTIONS'])assert.equal((await request('/',m)).status,405,m);
  assert.equal((await request('/data/archive.json')).status,200);
 } finally { if(server.listening)await new Promise(r=>server.close(r));await rm(fixture,{recursive:true,force:true}); }
});
test('missing or malformed corpus fails closed before listen',async()=>{
 await mkdir(new URL('data/',fixture),{recursive:true});
 try {await assert.rejects(createServer(fixture.pathname));await writeFile(new URL('data/archive.json',fixture),'{}');await assert.rejects(createServer(fixture.pathname),/unsupported schema/);await writeFile(new URL('data/archive.json',fixture),'{');await assert.rejects(createServer(fixture.pathname),SyntaxError);}
 finally {await rm(fixture,{recursive:true,force:true});}
});
