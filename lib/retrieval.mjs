import https from 'node:https';
import {createHash} from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import {createGunzip,createBrotliDecompress,createInflate} from 'node:zlib';
export const DOMAINS=['gov.uk','unesco.org','hai.stanford.edu','arxiv.org','moe.gov.sg','ed.gov','education.gov.au','oecd.org','education.ec.europa.eu'];
export function safeURL(raw){
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.port||net.isIP(u.hostname.replace(/[\[\]]/g,''))||!DOMAINS.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('unsafe-source');
 return u;
}
export function canonical(raw){const u=new URL(raw);u.hash='';u.search='';u.hostname=u.hostname.replace(/^www\./,'');u.pathname=u.pathname.replace(/\/$/,'').replace(/(\/abs\/\d+\.\d+)v\d+$/,'$1');return u.href.toLowerCase();}
export function publicIP(ip){
 if(net.isIP(ip)===6){
  // Only unambiguously global unicast; mapped, local, documentation and transition ranges fail closed.
  const first=parseInt(ip.split(':')[0],16);
  return first>=0x2000&&first<=0x3fff&&!/^2001:|^2002:|^3ffe:|^3fff:/i.test(ip);
 }
 if(net.isIP(ip)!==4)return false;
 const [a,b,c]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&([18,19].includes(b)||b===51&&c===100)||a===203&&b===0&&c===113);
}
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[x])).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';});
export const normalize=s=>s.normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim().toLowerCase();
export function extractHTML(html,url,now=new Date().toISOString()){
 if(/captcha|verify you are human|just a moment|access denied|enable javascript and cookies/i.test(html.slice(0,12000)))throw Error('source-challenge');
 const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
 const headline=clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,240);
 const pub=html.match(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datePublished|citation_publication_date)["'][^>]*content=["']([^"']+)/i)?.[1]||html.match(/"datePublished"\s*:\s*"([^"']+)"/i)?.[1];
 const publicationDate=pub&&/^\d{4}-\d{2}-\d{2}/.test(pub)&&!Number.isNaN(Date.parse(pub))&&new Date(pub).toISOString().slice(0,10)===pub.slice(0,10)?pub.slice(0,10):pub&&/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(pub)?pub:null;
 const publicationDatePrecision=publicationDate?(publicationDate.length===10?'day':publicationDate.length===7?'month':'year'):'unknown';
 // A bounded structural tokenizer, not a browser DOM. Match nesting so a teaser article
 // cannot truncate the enclosing main. Ignore navigation/script text and retain leaf blocks.
 const tokens=html.match(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)|<style\b[^>]*>[\s\S]*?(?:<\/style\s*>|$)|<[^>]+>|[^<]+/gi)||[],stack=[],blocks=[];let text='',context=null;
 const flush=()=>{const t=clean(text);if(t.length>=10&&context)blocks.push({text:t,...context,index:blocks.length});text='';context=null;};
 const blocked=new Set(['head','script','style','nav','header','footer','aside','noscript','template','h1','h2','h3','h4','h5','h6']);
 const block=new Set(['p','blockquote','div','section','main','article','li','h1','h2','h3']);
 for(const token of tokens){if(/^<(?:script|style)\b/i.test(token)){flush();continue;}if(token.startsWith('<')){const m=token.match(/^<\s*(\/?)\s*([a-z0-9]+)/i);if(!m)continue;const tag=m[2].toLowerCase(),closing=!!m[1];if(block.has(tag)||blocked.has(tag))flush();
   if(closing){const i=stack.map(x=>x.tag).lastIndexOf(tag);if(i>=0)stack.length=i;}
   else if(!['meta','link','img','br','hr','input','source','wbr'].includes(tag)&&!token.endsWith('/>'))stack.push({tag,skip:blocked.has(tag)||/class=["'][^"']*(?:change-log|metadata|cookie|related-content)/i.test(token)});
  }else if(!stack.some(x=>x.skip)){if(!context)context={main:stack.some(x=>x.tag==='main'),article:stack.some(x=>x.tag==='article')};text+=' '+token;}}
 flush();
 const keywords=[...new Set(normalize(headline).match(/[a-z]{4,}/g)||[])].filter(w=>!['with','from','that','this','news'].includes(w));
 const ranked=blocks.filter(b=>b.text.length>=50).map(b=>({...b,score:(b.main?4:0)+(b.article?2:0)+keywords.filter(w=>normalize(b.text).includes(w)).length*3+(/\b(ai|artificial intelligence|education|learning|schools?|students?|teachers?)\b/i.test(b.text)?4:0)-(/^(?:added|updated|last updated|published|subscribe|share|sign up)\b/i.test(b.text)?12:0)})).filter(b=>b.score>=4).sort((a,b)=>b.score-a.score||a.index-b.index);
 const selected=[];for(const b of ranked){if(!selected.some(x=>normalize(x.text)===normalize(b.text)))selected.push(b);if(selected.length===3)break;}
 const excerpt=selected.sort((a,b)=>a.index-b.index).map(b=>b.text.slice(0,650)).join('\n').slice(0,1800);
 if(!headline||excerpt.length<80)throw Error('insufficient-source-text');
 // Separate exact date fragments from ranked prose. Never concatenate fragments into
 // a fabricated quote. A dated event listing is a schedule, not proof it occurred.
 const eventListing=/\/events?\//i.test(new URL(url).pathname)&&/\b(?:summit|conference|week|forum|symposium|event)\b/i.test(headline);
 const dated=t=>/\b(?:19|20)\d{2}\b/.test(t)&&/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b|\b\d{4}-\d{2}(?:-\d{2})?\b/i.test(t);
 const eventDateContext=blocks.filter(b=>!eventListing&&b.main&&dated(b.text)&&keywords.filter(w=>normalize(b.text).includes(w)).length>=2&&!/^\s*(?:published|updated|last updated|copyright)/i.test(b.text)&&/\b(?:summit|conference|learning week|will gather|will bring|scheduled|took place|launched)\b/i.test(b.text)).slice(0,3).map(b=>({text:b.text.slice(0,300),exactVerified:true,provenance:'visible HTML leaf block in main; separate from publication metadata',heading:headline,role:eventListing?'event-listing-schedule':'event-date-passage'}));
 // Hero date/time can sit in a semantic header, deliberately excluded from prose.
 // Bind only a short date/time leaf immediately following the event's own h1,
 // before any further section heading; no navigation/related-event dates.
 if(eventListing){
  const hero=html.split(/<\/h1\s*>/i)[1]?.split(/<h[1-6]\b|<(?:nav|aside|footer)\b|<script\b/i)[0]?.slice(0,12000)||'';
  for(const m of hero.matchAll(/<(?:div|span|time)\b[^>]*>([^<>]{10,300})<\/(?:div|span|time)>/gi)){
   const t=clean(m[1]);if(dated(t)&&/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i.test(t)&&!eventDateContext.some(c=>c.text===t)&&eventDateContext.length<3)eventDateContext.push({text:t,exactVerified:true,provenance:'visible date/time leaf following own h1 before next section; separate from publication metadata',heading:headline,role:'event-listing-schedule'});
  }
 }
 return {url,finalURL:url,headline,eventDateContext,publicationDate,publicationDatePrecision,eventDate:null,retrievedAt:now,accessLevel:'public HTML · selected excerpts only',method:'bounded HTTPS GET; structural leaf blocks; relevance-ranked selected excerpts',retrievedText:excerpt,exactVerified:true};
}
// Retain only bounded transport facts, never arbitrary header values or response bodies.
export function responseFacts(status,type){
 const httpStatus=Number.isInteger(status)&&status>=100&&status<=599?status:null;
 const contentTypeClass=/^text\/html\b/i.test(type||'')?'html':/^application\/pdf\b/i.test(type||'')?'pdf':/^(?:application|text)\/(?:[a-z0-9.+-]+\+)?json\b/i.test(type||'')?'json':!type?'missing':'other';
 return {httpStatus,contentTypeClass};
}
export function collectHTML(res){return new Promise((resolve,reject)=>{
 if([301,302,303,307,308].includes(res.statusCode)){res.destroy();if(!res.headers.location){reject(Error('source-redirect-missing'));return;}resolve({redirect:res.headers.location});return;}
 const facts=responseFacts(res.statusCode,res.headers['content-type']);
 if(res.statusCode!==200||facts.contentTypeClass!=='html'){res.destroy();const e=Error('source-unavailable');Object.assign(e,facts);reject(e);return;}
 const encoding=(res.headers['content-encoding']||'identity').toLowerCase().trim();
 if(!['identity','gzip','br','deflate'].includes(encoding)){res.destroy();reject(Error('source-encoding'));return;}
 const decoder=encoding==='gzip'?createGunzip():encoding==='br'?createBrotliDecompress():encoding==='deflate'?createInflate():null;
 let encoded=0,decoded=0,chunks=[],done=false;
 const fail=e=>{if(done)return;done=true;reject(e);res.destroy();decoder?.destroy();};
 res.on('error',()=>fail(Error('source-network')));res.on('aborted',()=>fail(Error('source-network')));
 res.on('data',b=>{encoded+=b.length;if(encoded>600000)fail(Error('source-too-large'));});
 const output=decoder||res;
 output.on('data',b=>{decoded+=b.length;if(decoded>600000){fail(Error('source-too-large'));return;}chunks.push(b);});
 if(decoder)decoder.on('error',()=>fail(Error('source-decode')));
 output.on('end',()=>{if(done)return;done=true;resolve({html:Buffer.concat(chunks).toString('utf8'),...facts,encoding,encodedBytes:encoded,decodedBytes:decoded});});
 if(decoder)res.pipe(decoder);
});}
function requestPage(u,addresses,signal){return new Promise((resolve,reject)=>{
 const req=https.get(u,{signal,headers:{'User-Agent':'Newsren-bounded-evaluation/1.0',Accept:'text/html','Accept-Encoding':'gzip, br, deflate'},lookup:(_host,opts,cb)=>{const a=addresses[0];cb(null,opts.all?[a]:a.address,a.family);}},res=>{void collectHTML(res).then(resolve,reject);});req.on('error',reject);
});}
export async function fetchSource(raw,{signal,lookup=dns.lookup,request=requestPage,timeoutMs=10000}={}){
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(abort,timeoutMs);
 const diagnostics=[];let stage='url';
 try {let u=safeURL(raw);for(let hops=0;hops<=2;hops++){
  if(controller.signal.aborted)throw Error(signal?.aborted?'cancelled':'timeout');
  stage='dns';
  const addresses=await Promise.race([lookup(u.hostname,{all:true,verbatim:true}),new Promise((_,j)=>controller.signal.addEventListener('abort',()=>j(Error('timeout')),{once:true}))]);
  if(!addresses.length||addresses.some(a=>!publicIP(a.address)||net.isIP(a.address)!==a.family))throw Error('unsafe-source');
  const ipv4=addresses.filter(a=>a.family===4);if(!ipv4.length)throw Error('source-no-public-ipv4');
  diagnostics.push({stage:'dns',host:u.hostname,reason:'public-ipv4-pinned',publicA:ipv4.length,publicAAAA:addresses.length-ipv4.length});
  stage='transport';const result=await request(u,ipv4,controller.signal);
  if(Object.hasOwn(result,'redirect')){stage='redirect';if(!result.redirect)throw Error('source-redirect-missing');if(hops===2)throw Error('source-redirect-limit');diagnostics.push({stage,host:u.hostname,reason:'revalidate'});u=safeURL(new URL(result.redirect,u).href);continue;}
  stage='extraction';diagnostics.push({stage:'response',host:u.hostname,reason:'html-received',...responseFacts(result.httpStatus,result.contentTypeClass==='html'?'text/html':null),sha256:createHash('sha256').update(result.html).digest('hex'),encoding:result.encoding||'identity',encodedBytes:result.encodedBytes??null,decodedBytes:result.decodedBytes??null});const source=extractHTML(result.html,u.href);diagnostics.push({stage,host:u.hostname,reason:'ok',encoding:result.encoding||'identity',encodedBytes:result.encodedBytes??null,decodedBytes:result.decodedBytes??null});return {...source,url:raw,diagnostics};
 }throw Error('source-unavailable');}catch(error){const known=['unsafe-source','source-challenge','insufficient-source-text','source-unavailable','source-too-large','source-redirect-limit','source-redirect-missing','source-encoding','source-decode','source-no-public-ipv4','timeout','cancelled'];const reason=controller.signal.aborted?(signal?.aborted?'cancelled':'timeout'):known.includes(error.message)?error.message:'source-network';const e=Error(reason);e.stage=stage;e.diagnostics=[...diagnostics,{stage,reason,...(error.message==='source-unavailable'?responseFacts(error.httpStatus,{html:'text/html',pdf:'application/pdf',json:'application/json',other:'other'}[error.contentTypeClass]):{})}];throw e;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
