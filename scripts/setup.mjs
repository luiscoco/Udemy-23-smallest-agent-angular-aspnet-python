import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {root,python} from './paths.mjs';
import {npmCommand} from './npm-tool.mjs';
process.chdir(root);
function run(cmd,args){const r=spawnSync(cmd,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
if(!existsSync(python))run(process.platform==='win32'?'py':'python3',process.platform==='win32'?['-3','-m','venv','.venv']:['-m','venv','.venv']);
run(python,['-c','import sys; assert sys.version_info >= (3, 11), "Python 3.11 or newer is required"']);
run(python,['-m','pip','install','-r','agent-service/requirements-dev.txt']);
run(...npmCommand(['--prefix','frontend','ci']));
run(process.execPath,['scripts/configure-env.mjs']);
run('dotnet',['restore','backend/SmallestAgent.Gateway.csproj']);
run('dotnet',['restore','backend.tests/Gateway.IntegrationTests.csproj']);
run(process.execPath,['scripts/generate-lesson.mjs']);
