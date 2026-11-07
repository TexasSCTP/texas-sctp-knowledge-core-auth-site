import { mkdir, cp, copyFile, rm, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=resolve(root,'dist');
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
for(const name of ['index.html','styles.css','app.js','config.js','favicon.svg','preview-catalog.json']){
  await copyFile(resolve(root,name),resolve(dist,name));
}
try {
  await access(resolve(root,'public'));
  await cp(resolve(root,'public'),resolve(dist,'public'),{recursive:true});
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('Created a minimal public gallery build in dist/. Backend source, SQL and reference rosters were not published.');