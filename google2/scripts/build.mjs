import { transformEditor } from './editor-transform.mjs';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try { loadEnvFile(resolve(root,'.env')); } catch(e) { if(e.code!=='ENOENT') throw e; }
let editor=await readFile(resolve(root,'src/editor.html'),'utf8');
editor=transformEditor(editor);
await mkdir(resolve(root,'dist/assets'),{recursive:true});
await build({entryPoints:[resolve(root,'src/main.js')],bundle:true,minify:true,format:'esm',target:['es2022'],outfile:resolve(root,'dist/assets/main.js'),define:{__EDITOR_HTML__:JSON.stringify(editor)},logLevel:'info'});
await copyFile(resolve(root,'src/index.html'),resolve(root,'dist/index.html'));
await copyFile(resolve(root,'src/style.css'),resolve(root,'dist/assets/style.css'));
for(const file of ['privacy.html','icon.svg','apple-touch-icon.png','icon-192.png','icon-512.png','manifest.webmanifest']) await copyFile(resolve(root,'src',file),resolve(root,'dist',file));
console.log('Build complete: dist');
