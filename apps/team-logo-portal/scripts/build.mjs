import { mkdir, cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
execFileSync(process.execPath, ['--check', resolve(root, 'app.js')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', resolve(root, 'config.js')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', resolve(root, 'admin/app.js')], { stdio: 'inherit' });
await rm(dist, {recursive: true, force: true});
await mkdir(dist, {recursive: true});
for (const asset of ['index.html', 'styles.css', 'app.js', 'config.js']) {
 await cp(resolve(root, asset), resolve(dist, asset));
}
await cp(resolve(root, 'admin'), resolve(dist, 'admin'), { recursive: true });
console.log('Built independent Texas SCTP Team Logo Portal in apps/team-logo-portal/dist');
