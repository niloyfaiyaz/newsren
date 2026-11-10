import fs from 'node:fs';
// Application-only known-root loader. Never log values, search other paths or load
// historical allowance variables. Process values take precedence, including empties.
export function loadApplicationEnv(processEnv=process.env,{read=()=>fs.readFileSync(new URL('../.env',import.meta.url),'utf8')}={}){
 let text='';try{text=read();}catch(e){if(e.code!=='ENOENT')throw Error('application-env-unavailable');}
 const values={};for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*(OPENAI_API_KEY|OPENAI_MODEL)\s*=\s*(.*?)\s*$/);if(!m)continue;let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);else v=v.replace(/\s+#.*$/,'');values[m[1]]=v;}
 return Object.fromEntries(['OPENAI_API_KEY','OPENAI_MODEL'].map(k=>[k,processEnv[k]??values[k]??'']));
}
