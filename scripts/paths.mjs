import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const python=resolve(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
