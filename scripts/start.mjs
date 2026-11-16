import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {root,python} from './paths.mjs';
import {npmCommand} from './npm-tool.mjs';
const production=process.argv[2]==='production',children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children){if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});else child.kill('SIGTERM');}setTimeout(()=>process.exit(code),700);}
function launch(cmd,args,options={}){const child=spawn(cmd,args,{cwd:root,stdio:'inherit',...options});children.push(child);child.on('error',e=>{console.error(e.message);stop(1)});child.on('exit',c=>{if(!stopping)stop(c??1)});}
async function ready(url,tries=240){for(let i=0;i<tries&&!stopping;i++){try{if((await fetch(url)).ok)return true;}catch{}await new Promise(r=>setTimeout(r,500));}return false;}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
launch(python,['run.py'],{cwd:resolve(root,'agent-service')});
if(!await ready('http://127.0.0.1:9801/internal/ready')){console.error('Python did not start. Run npm run setup first.');stop(1);}
if(!stopping){const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('ANTHROPIC_')||k.startsWith('CLAUDE_'))delete env[k];
 launch('dotnet',production?[resolve(root,'backend/artifacts/publish/SmallestAgent.Gateway.dll')]:['run','--no-launch-profile','--project','SmallestAgent.Gateway.csproj'],{cwd:resolve(root,'backend'),env});
 if(!await ready('http://127.0.0.1:9800/api/health',600)){console.error('Gateway did not become ready. Check matching service tokens and ports.');stop(1);}
 if(!stopping){if(production)console.log('Open http://127.0.0.1:9800');else launch(...npmCommand(['--prefix','frontend','start']));}
}
