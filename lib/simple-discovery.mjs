import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {safeURL,publicIP,collectHTML,extractHTML} from './retrieval.mjs';
import {validatePacket} from './question.mjs';
const ORIGIN='https://www.gov.uk';
export const PUBLIC_SEARCH_POLICY=Object.freeze({origin:ORIGIN,path:'/api/search.json',count:2,queryCharacters:240,jsonBytes:64000,htmlBytes:600000,redirectsPerDocument:2,documentsPerConfirmation:5,maximumHTTPRequests:15,actionTimeoutMs:45000,documentTimeoutMs:10000,providerRequests:0,providerChargeMicroUSD:0,hostedAIWebSearch:false});
export function publicSearchQuery(question){return question.replace(/\bAI\b/g,'artificial intelligence').replace(/[^\p{L}\p{N}\s'-]/gu,' ').replace(/\b(?:should|would|could|does|do|is|are|the|a|an|to|of|for|and|or)\b/gi,' ').replace(/\s+/g,' ').trim().slice(0,240);}
function publicSearchURL(question){const u=new URL(PUBLIC_SEARCH_POLICY.path,ORIGIN);u.searchParams.set('q',publicSearchQuery(question));u.searchParams.set('count','2');return u;}
export function parsePublicSearch(data){
 if(!data||!Array.isArray(data.results)||data.results.length>2)throw Error('invalid-source-search');
 const seen=new Set();return data.results.map(r=>{
  // One unsupported row must not discard an independently safe publication.
  try{
  if(!r||r.format==='transaction'||typeof r.title!=='string'||!r.title.trim()||r.title.length>500||typeof r.link!=='string'||r.link.length>1500||!r.link.startsWith('/')||r.link.startsWith('//')||r.link.includes('\\')||r.description!=null&&typeof r.description!=='string')throw Error('invalid-source-search');
  const u=safeURL(new URL(r.link,ORIGIN).href);if(u.origin!==ORIGIN||u.search||u.hash||/\.(?:pdf|zip|docx?|xlsx?|csv)(?:$|\/)/i.test(u.pathname)||!/^\/government\/(?:publications|news|speeches|consultations)\//.test(u.pathname)&&!/^\/guidance\//.test(u.pathname))throw Error('invalid-source-search');
  if(seen.has(u.href))return null;seen.add(u.href);return {url:u.href,title:r.title,description:(r.description||'').slice(0,1000)};
  }catch{return null;}
 }).filter(Boolean);
}
function collectJSON(res){return new Promise((resolve,reject)=>{
 if([301,302,303,307,308].includes(res.statusCode)){const redirect=res.headers.location;res.destroy();return redirect?resolve({redirect}):reject(Error('source-redirect-missing'));}
 if(res.statusCode!==200||!/^application\/json\b/i.test(res.headers['content-type']||'')||!['identity',''].includes(res.headers['content-encoding']||'')){res.destroy();reject(Error('source-unavailable'));return;}
 let n=0,chunks=[];res.on('data',b=>{n+=b.length;if(n>64000){res.destroy();reject(Error('source-too-large'));}else chunks.push(b);});res.on('error',()=>reject(Error('source-network')));res.on('aborted',()=>reject(Error('source-network')));res.on('end',()=>resolve({json:Buffer.concat(chunks).toString('utf8')}));
});}
function requestPublic(u,addresses,signal,kind){return new Promise((resolve,reject)=>{
 const req=https.get(u,{signal,headers:{'User-Agent':'Newsren-bounded-public-source/1.0',Accept:kind==='json'?'application/json':'text/html','Accept-Encoding':'identity'},lookup:(_host,opts,cb)=>{const a=addresses[0];cb(null,opts.all?[a]:a.address,a.family);}},res=>{void(kind==='json'?collectJSON(res):collectHTML(res)).then(resolve,reject);});req.on('error',reject);
});}
// Safe transport DI is for local mock tests only. No URL/transport policy comes from API input.
export function createSimpleDiscovery({lookup=dns.lookup,request=requestPublic}={}){
 let busy=false,totalHTTPRequests=0,confirmations=0;
 async function document(raw,kind,signal,count){
  const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)controller.abort();const timer=setTimeout(abort,10000);
  const cancelled=new Promise((_,j)=>controller.signal.addEventListener('abort',()=>j(Error('source-timeout')),{once:true}));
  try{let u=safeURL(raw);for(let hops=0;hops<=2;hops++){
   if(u.origin!==ORIGIN)throw Error('unsafe-source');if(controller.signal.aborted)throw Error('cancelled');
   if(kind==='json'&&(u.pathname!=='/api/search.json'||u.searchParams.get('count')!=='2'||[...u.searchParams.keys()].sort().join(',')!=='count,q'||!u.searchParams.get('q')||u.searchParams.get('q').length>240))throw Error('unsafe-source');
   const addresses=await Promise.race([lookup(u.hostname,{all:true,verbatim:true}),cancelled]);if(!addresses.length||addresses.some(a=>!publicIP(a.address)||net.isIP(a.address)!==a.family))throw Error('unsafe-source');const ipv4=addresses.filter(a=>a.family===4);if(!ipv4.length)throw Error('source-no-public-ipv4');
   if(count.requests>=15)throw Error('source-request-limit');count.requests++;totalHTTPRequests++;
   const d=await Promise.race([request(u,ipv4,controller.signal,kind),cancelled]);
   if(d.redirect!==undefined){if(hops===2)throw Error('source-redirect-limit');u=safeURL(new URL(d.redirect,u).href);continue;}
   if(kind==='json'){if(typeof d.json!=='string'||Buffer.byteLength(d.json)>64000)throw Error('source-too-large');return {data:JSON.parse(d.json),url:u.href};}
   if(typeof d.html!=='string'||Buffer.byteLength(d.html)>600000)throw Error('source-too-large');return {html:d.html,url:u.href};
  }throw Error('source-unavailable');}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
 }
 return {health:()=>({state:'configured',reason:null,method:'GOV.UK public source search, not hosted AI web search',policy:PUBLIC_SEARCH_POLICY,confirmations,sourceHTTPRequests:totalHTTPRequests}),async run({packet,signal}){
  const p=validatePacket(packet,{allowEmpty:true});if(p.cards.length||!publicSearchQuery(p.question))throw Error('invalid-input');if(busy)throw Error('busy');if(signal?.aborted)throw Error('cancelled');busy=true;confirmations++;
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,45000),count={requests:0};
  try{
   const search=await document(publicSearchURL(p.question).href,'json',controller.signal,count),matches=parsePublicSearch(search.data),candidates=[],failures=[];
   for(const m of matches){
    if(controller.signal.aborted)throw Error('cancelled');try{
     let page=await document(m.url,'html',controller.signal,count),source=null;
     try{source=extractHTML(page.html,page.url);}catch(e){if(!['insufficient-source-text'].includes(e.message))throw e;}
     // Publication landing pages often contain only a description and an HTML attachment.
     // Follow at most ONE explicit deeper HTML publication link, never a PDF or crawl.
     if(new URL(page.url).pathname.startsWith('/government/publications/')&&(!source||source.retrievedText.length<350)){
      const child=publicationChild(page.html,page.url);if(child){page=await document(child,'html',controller.signal,count);source=extractHTML(page.html,page.url);}
     }
     if(!source||source.retrievedText.length<160)throw Error('insufficient-source-text');
     const passage=shortPassage(source.retrievedText);if(passage.length<160||passage===m.description)throw Error('insufficient-source-text');
     candidates.push({id:'public-'+randomUUID(),title:source.headline,source:{finalURL:page.url,publisher:'GOV.UK',publicationDate:source.publicationDate,publicationDatePrecision:source.publicationDatePrecision,retrievedAt:source.retrievedAt,exactVerified:true,retrievedText:passage,accessLevel:'bounded public HTML selected passage; not search snippet or full article',discoveryURL:m.url},limitations:'Selected source passage only, not a full-article account. GOV.UK search descriptions and timestamps are metadata, not evidence or proof of publication. No event date or question relevance is inferred. Rights not independently confirmed; inspect the original.'});
    }catch(e){if(controller.signal.aborted)throw Error('cancelled');const known=['unsafe-source','source-unavailable','source-too-large','source-challenge','insufficient-source-text','source-redirect-limit','source-no-public-ipv4','source-timeout'];failures.push(known.includes(e.message)?e.message:'source-network');}
   }
   return {status:candidates.length?'candidates':'empty',candidates,lastSuccessfulAt:new Date().toISOString(),message:`GOV.UK public search: ${matches.length} matches; ${candidates.length} retrieved selected passages. Search snippets alone cannot be saved as evidence.${failures.length?' Some sources were unavailable or lacked substantive retained text.':''} Inspect before explicitly saving.`,network:{sourceHTTPRequests:count.requests,providerRequests:0,providerChargeMicroUSD:0},failures};
  }catch(e){e.diagnostics={stage:'public-source-search',sourceHTTPRequests:count.requests,providerRequests:0};throw e;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();busy=false;}
 }};
}
export function publicationChild(html,raw){const parent=safeURL(raw);for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
 try{const u=safeURL(new URL(m[1].replace(/&amp;/g,'&'),parent).href);if(u.origin!==ORIGIN||u.search||u.hash||!u.pathname.startsWith(parent.pathname.replace(/\/$/,'')+'/')||/\.(?:pdf|zip|docx?|xlsx?|csv)$/i.test(u.pathname)||m[2].replace(/<[^>]*>/g,'').trim().length<4)continue;return u.href;}catch{}
 }return null;}
export function shortPassage(text){const words=[...text.matchAll(/\S+/g)],end=words.length>150?words[150].index:text.length;return text.slice(0,Math.min(end,1200)).trim();}
