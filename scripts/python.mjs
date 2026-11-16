import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {root,python} from './paths.mjs';
const result=spawnSync(python,process.argv.slice(2),{cwd:resolve(root,'agent-service'),stdio:'inherit'});if(result.error)throw result.error;process.exit(result.status??1);
