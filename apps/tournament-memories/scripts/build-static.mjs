import { mkdir, cp, copyFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=resolve(root,'dist');
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
for(const name of ['index.html','styles.css','app.js','config.js','favicon.svg','preview-catalog.json','hero-config.json','hero-admin.html','hero-studio.html','hero-admin.css','hero-admin.js']){
  await copyFile(resolve(root,name),resolve(dist,name));
}
await cp(resolve(root,'public'),resolve(dist,'public'),{recursive:true});
console.log('Created a minimal public gallery build in dist/. Backend source, SQL and reference rosters were not published.');
