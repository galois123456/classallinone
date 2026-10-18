import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
async function check(dir){for(const f of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+f.name;if(f.isDirectory())await check(p);else if(/\.(m?js)$/.test(p)){const result=spawnSync(process.execPath,['--check',p],{stdio:'inherit'});if(result.status)process.exit(result.status);}}}
for(const dir of ['src','server','api','scripts'])await check(dir);
