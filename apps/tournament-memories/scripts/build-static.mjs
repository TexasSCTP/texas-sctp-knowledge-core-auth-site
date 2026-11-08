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
// Cache-safe release aliases prevent stale CDN/browser versions after deployments.
for(const [source,release] of [
  ['app.js','app-range-season-20261108.js'],
  ['styles.css','styles-range-season-20261108.css'],
  ['hero-admin.js','hero-admin-range-20261108.js'],
  ['hero-admin.css','hero-admin-range-20261108.css']
])await copyFile(resolve(root,source),resolve(dist,release));
await cp(resolve(root,'public'),resolve(dist,'public'),{recursive:true});
console.log('Created a minimal public gallery build in dist/. Backend source, SQL and reference rosters were not published.');
