import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import {root} from './paths.mjs';
const files=['agent-service/.env','backend/.env'];
const existing=files.filter(name=>existsSync(resolve(root,name))).map(name=>parse(readFileSync(resolve(root,name))).AGENT_SERVICE_TOKEN).filter(Boolean);
const valid=existing.find(value=>value.length>=32&&!value.startsWith('replace-'));
const token=valid||randomBytes(32).toString('hex');
for(const name of files){const path=resolve(root,name);if(!existsSync(path)){const text=readFileSync(path+'.example','utf8').replace('replace-with-a-random-shared-token',token);writeFileSync(path,text,{mode:0o600});console.log(`Created ${name} with a private paired service token; model key remains a placeholder.`);}}
if(existing.some(value=>value!==token))console.log('Existing environment files were preserved; ensure their service tokens match and are not placeholders.');
