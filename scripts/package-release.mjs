import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run=promisify(execFile),version=JSON.parse(await readFile('package.json','utf8')).version;
await mkdir('release',{recursive:true});const archive=`release/Neuro-${version}.zip`;
// Lista permitida: não inclui .env, diários, certificados locais, dependências ou dados de jogadores.
const sources=['README.md','TESTAR.md','package.json','package-lock.json','Dockerfile','compose.yaml','compose.production.yaml','.env.example','.env.production.example','.gitignore','.dockerignore','index.html','tsconfig.json','tsconfig.server.json','vite.config.ts','src','server','shared','public','docs','deploy','scripts','tests','dist'];
const python="import sys,pathlib,zipfile; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); files=[p for name in sys.argv[2:] for p in ([pathlib.Path(name)] if pathlib.Path(name).is_file() else sorted(pathlib.Path(name).rglob('*'))) if p.is_file() and '__pycache__' not in p.parts]; [z.write(p,p.as_posix()) for p in files]; z.close()";
await run(process.platform==='win32'?'python':'python3',['-c',python,archive,...sources]);
const sha=createHash('sha256').update(await readFile(archive)).digest('hex');await writeFile('release/SHA256SUMS',`${sha}  Neuro-${version}.zip\n`);console.log(`Release: ${archive}\nSHA-256: ${sha}`);
