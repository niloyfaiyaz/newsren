import http from 'node:http';
import {loadApplicationEnv} from './lib/application-env.mjs';
import {createControlledDispatch,isControlledDispatch} from './lib/controlled-dispatch.mjs';
import {createSubmissionAllowance,reviewedBuildHash,SUBMISSION_FILE} from './lib/submission-allowance.mjs';
import {lstatSync} from 'node:fs';
import {createSimpleDiscovery} from './lib/simple-discovery.mjs';
import { createAI } from './lib/ai.mjs';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateCorpus } from './public/lib/corpus.mjs';
const root = fileURLToPath(new URL('./public/', import.meta.url));
const files = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/styles.css',['styles.css','text/css; charset=utf-8']],
  ['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],
  ['/lib/corpus.mjs',['lib/corpus.mjs','text/javascript; charset=utf-8']],
  ['/lib/themes.mjs',['lib/themes.mjs','text/javascript; charset=utf-8']],
  ['/lib/practice.mjs',['lib/practice.mjs','text/javascript; charset=utf-8']],
  ['/lib/question.mjs',['lib/question.mjs','text/javascript; charset=utf-8']],
  ['/lib/dates.mjs',['lib/dates.mjs','text/javascript; charset=utf-8']],
  ['/lib/storage.mjs',['lib/storage.mjs','text/javascript; charset=utf-8']],
  ['/data/archive.json',['data/archive.json','application/json; charset=utf-8']],
  ...['idle','greeting','pointing','speaking','success','unavailable','thinking','purple-greeting','purple-idle'].map(s => [`/assets/${s}.svg`,[`assets/${s}.svg`,'image/svg+xml']])
]);
export async function createServer(publicRoot = root, options = {}) {
  const canonical = await realpath(publicRoot);
  // Invalid content fails closed before listening, not a plausible-looking empty feed.
  const corpus=validateCorpus(JSON.parse(await readFile(path.join(publicRoot,'data/archive.json'),'utf8')));
  const ai=createAI({corpus,...options});
  return http.createServer(async (req,res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    const reject = (code,message) => { res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'}); res.end(message); };
    const workspaceRoutes={'/api/question/rank':'rank','/api/question/chat':'chat','/api/question/search':'search','/api/feed/refresh':'refresh'};
    if(req.url==='/api/config' || req.url==='/api/ask' || req.url==='/api/related'||workspaceRoutes[req.url]) {
      const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
      if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||''))return json(403,{error:'host-rejected'});
      if(req.url==='/api/config' && req.method==='GET')return json(200,{...ai.health(),...(options.controlledDispatch?{dispatch:options.controlledDispatch.state()}:{})});
      if(req.url==='/api/config'||req.method!=='POST')return reject(405,'Method not allowed');
      const expected=`http://${req.headers.host}`;
      if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'') || req.headers.origin!==expected || ['cross-site','same-site'].includes(req.headers['sec-fetch-site']))return json(403,{error:'origin-rejected'});
      if(options.controlledDispatch&&!options.controlledDispatch.authenticate(req.headers.cookie))return json(403,{error:'dispatch-owner-required'});
      if(options.submissionAllowance&&!isControlledDispatch(options.controlledDispatch)&&ai.health().reason==='dispatch-paused')return json(503,{error:'dispatch-paused'});
      if(req.headers['content-type']!=='application/json')return json(415,{error:'json-required'});
      const maxBody=workspaceRoutes[req.url]?96000:22000;
      if(Number(req.headers['content-length'])>maxBody)return json(413,{error:'body-too-large'});
      req.setTimeout(90000,()=>req.destroy());
      const controller=new AbortController();req.once('aborted',()=>controller.abort());res.once('close',()=>{if(!res.writableEnded)controller.abort();});
      try {
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxBody){json(413,{error:'body-too-large'});return;}chunks.push(chunk);}const body=Buffer.concat(chunks).toString('utf8');
        let data;try{data=JSON.parse(body);}catch{return json(400,{error:'invalid-json'});}
        if(!data||typeof data!=='object'||Array.isArray(data))return json(400,{error:'invalid-input'});
        if(workspaceRoutes[req.url]){if(Object.keys(data).some(k=>!(workspaceRoutes[req.url]==='rank'?['packet']:['packet','input','history']).includes(k)))return json(400,{error:'invalid-input'});return json(200,await ai.workspace({...data,kind:workspaceRoutes[req.url],signal:controller.signal,onRequestID:id=>res.setHeader('X-Newsren-Request-ID',id)}));}
        const allowed=req.url==='/api/related'?['articleId']:['articleId','input','history','edgeId','candidateId'];
        if(Object.keys(data).some(k=>!allowed.includes(k))||!('articleId'in data))return json(400,{error:'invalid-input'});
        const reply=await ai[req.url==='/api/related'?'discover':'ask']({...data,signal:controller.signal});return json(200,reply);
      } catch(e) {
        const known=['dispatch-paused','dispatch-owner-required','missing-key','missing-model','quota-disabled','quota-exhausted','busy','invalid-input','unknown-article','cancelled','timeout','invalid-provider-output','provider-incomplete','search-not-verified','budget-unavailable','candidate-expired','unsupported-model','insufficient-discovery-budget','context-limit','allowance-unapproved','context-bound-unverified','live-run-stopped','legacy-route-disabled','hosted-search-disabled','hosted-tool-billable-pass-bound-unverified','invalid-source-search','source-unavailable','source-timeout','source-too-large','unsafe-source'];
        const error=known.includes(e.message)?e.message:'provider-unavailable';
        if(!res.destroyed)return json(['invalid-input','unknown-article'].includes(error)?400:503,{error,reason:e.reason||null,diagnostics:e.diagnostics||null,budget:ai.health().budget});
      }
      return;
    }
    if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); return reject(405,'Method not allowed'); }
    const raw = req.url.split('?')[0];
    const item = files.get(raw);
    if (!item) return reject(404,'Not found');
    const [name,type] = item;
    try {
      let part = publicRoot;
      for (const segment of name.split('/')) { part = path.join(part,segment); if ((await lstat(part)).isSymbolicLink()) return reject(404,'Not found'); }
      const resolved = await realpath(part);
      if (!resolved.startsWith(canonical + path.sep) || !(await lstat(resolved)).isFile()) return reject(404,'Not found');
      const bytes = await readFile(resolved);
      res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length}); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { reject(404,'Not found'); }
  });
}
// Only genuine absence permits the packaged read-only bootstrap. Inspect every
// existing path component: dangling links, ENOTDIR, EACCES and other I/O errors
// are not absence. Never inspect journal contents or provision credit here.
function submissionLedgerAbsent(){
  let part=path.parse(SUBMISSION_FILE).root;
  for(const segment of SUBMISSION_FILE.slice(part.length).split(path.sep)){
    part=path.join(part,segment);
    try{if(lstatSync(part).isSymbolicLink())throw Error('budget-unavailable');}
    catch(e){if(e.code!=='ENOENT')throw e;
      if(part===SUBMISSION_FILE)for(const suffix of ['.lock','.pending']){
        try{lstatSync(SUBMISSION_FILE+suffix);throw Error('budget-unavailable');}catch(sidecar){if(sidecar.code!=='ENOENT')throw sidecar;}
      }
      return true;
    }
  }
  return false;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env=loadApplicationEnv();
  const readOnly=submissionLedgerAbsent();
  let controlledDispatch=null;
  if(!readOnly){
    controlledDispatch=createControlledDispatch({buildHash:reviewedBuildHash(),auditSecrets:[env.OPENAI_API_KEY]});
    controlledDispatch.acquire();
  }
  // Permanent unavailable object also prevents an absent->present race from
  // enabling dispatch in a process booted without the owner gate. No test tree
  // or private control files are needed by a clean read-only distribution.
  const unavailable=()=>{throw Error('budget-unavailable');};
  const submissionAllowance=readOnly?Object.freeze({state:()=>({state:'unavailable',reason:'budget-unavailable',remaining:0}),reserve:unavailable,record:unavailable}):createSubmissionAllowance({dispatchControl:controlledDispatch});
  let server;
  try{server=await createServer(undefined,{env,submissionAllowance,...(controlledDispatch?{simpleDiscovery:createSimpleDiscovery(),controlledDispatch}:{})});}catch(e){controlledDispatch?.close();throw e;}
  server.once('close',()=>controlledDispatch?.close());
  server.on('error', e => { controlledDispatch?.close(); console.error(e.code === 'EADDRINUSE' ? 'Port 3001 occupied. Stopping; do not kill existing listeners.' : e.message); process.exitCode = 1; });
  server.listen(3001,'127.0.0.1',() => console.log('Historical visual preview: http://127.0.0.1:3001 (archive; AI fail-closed unless owner configured)'));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => server.close());
}
