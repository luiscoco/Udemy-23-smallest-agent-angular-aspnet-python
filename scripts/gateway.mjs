import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {root} from './paths.mjs';
const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('ANTHROPIC_')||key.startsWith('CLAUDE_'))delete env[key];
const result=spawnSync('dotnet',['run','--no-launch-profile','--project','SmallestAgent.Gateway.csproj'],{cwd:resolve(root,'backend'),env,stdio:'inherit'});if(result.error)throw result.error;process.exit(result.status??1);
