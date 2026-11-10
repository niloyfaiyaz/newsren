import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
export const DOMAINS=['gov.uk','unesco.org','hai.stanford.edu','arxiv.org','moe.gov.sg','ed.gov','education.gov.au','oecd.org','education.ec.europa.eu'];
export function safeURL(raw){
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.port||net.isIP(u.hostname.replace(/[\[\]]/g,''))||!DOMAINS.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('unsafe-source');
 return u;
}
export function canonical(raw){const u=new URL(raw);u.hash='';u.search='';u.hostname=u.hostname.replace(/^www\./,'');u.pathname=u.pathname.replace(/\/$/,'').replace(/(\/abs\/\d+\.\d+)v\d+$/,'$1');return u.href.toLowerCase();}
export function publicIP(ip){
 // Conservative: IPv6 sources are unavailable rather than risk mapped/local forms.
 if(net.isIP(ip)!==4)return false;
 const [a,b]=ip.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===203&&b===0);
}
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[x])).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';});
export const normalize=s=>s.normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim().toLowerCase();
export function extractHTML(html,url,now=new Date().toISOString()){
 if(/captcha|verify you are human|just a moment|access denied|enable javascript and cookies/i.test(html.slice(0,12000)))throw Error('source-challenge');
 const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
 const headline=clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,240);
 const pub=html.match(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datePublished|citation_publication_date)["'][^>]*content=["']([^"']+)/i)?.[1]||html.match(/"datePublished"\s*:\s*"([^"']+)"/i)?.[1];
 const publicationDate=pub&&/^\d{4}-\d{2}-\d{2}/.test(pub)&&!Number.isNaN(Date.parse(pub))?pub.slice(0,10):null;
 let body=html.replace(/<(script|style|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
 body=body.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1]||body;
 // Select relevant paragraphs, not entire copyrighted article. Short bounded excerpts only.
 const paragraphs=[...body.matchAll(/<(?:p|blockquote)\b[^>]*>([\s\S]*?)<\/(?:p|blockquote)>/gi)].map(m=>clean(m[1])).filter(s=>s.length>=50&&/\b(ai|artificial intelligence|education|learn|school|student|teacher)\b/i.test(s));
 const excerpt=paragraphs.slice(0,3).map(s=>s.slice(0,650)).join('\n').slice(0,1800);
 if(!headline||excerpt.length<80)throw Error('insufficient-source-text');
 return {url,finalURL:url,headline,publicationDate,eventDate:null,retrievedAt:now,accessLevel:'public HTML · selected excerpts only',method:'bounded HTTPS GET; HTML tags removed; relevant paragraph selection',retrievedText:excerpt,exactVerified:true};
}
export function collectHTML(res){return new Promise((resolve,reject)=>{
 if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
 if(res.statusCode!==200||!/^text\/html\b/i.test(res.headers['content-type']||'')){res.resume();reject(Error('source-unavailable'));return;}
 let size=0,chunks=[];res.on('data',b=>{size+=b.length;if(size>600000){res.destroy(Error('source-too-large'));return;}chunks.push(b);});res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
});}
function requestPage(u,addresses,signal){return new Promise((resolve,reject)=>{
 const req=https.get(u,{signal,headers:{'User-Agent':'Newsren-bounded-evaluation/1.0',Accept:'text/html'},lookup:(_host,opts,cb)=>{const a=addresses[0];cb(null,opts.all?[a]:a.address,a.family);}},res=>{void collectHTML(res).then(resolve,reject);});req.on('error',reject);
});}
export async function fetchSource(raw,{signal,lookup=dns.lookup,request=requestPage,timeoutMs=10000}={}){
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(abort,timeoutMs);
 try {let u=safeURL(raw);for(let hops=0;hops<=2;hops++){
  if(controller.signal.aborted)throw Error('cancelled');
  const addresses=await Promise.race([lookup(u.hostname,{all:true,verbatim:true}),new Promise((_,j)=>controller.signal.addEventListener('abort',()=>j(Error('timeout')),{once:true}))]);
  if(!addresses.length||addresses.some(a=>!publicIP(a.address)))throw Error('unsafe-source');
  const result=await request(u,addresses,controller.signal);
  if(result.redirect){if(hops===2)throw Error('source-redirect-limit');u=safeURL(new URL(result.redirect,u).href);continue;}
  return extractHTML(result.html,u.href);
 }throw Error('source-unavailable');}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
