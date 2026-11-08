import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const app=read('app.js');
const guest=read('supabase/functions/guest-memories/index.ts');
const logoSql=read('supabase/migrations/20261108200000_team_logos.sql');

test('first team logo can display publicly without a separate approval checkbox',()=>{
  assert.doesNotMatch(app,/name="logoPermission"/);
  assert.doesNotMatch(guest,/x\.logoPermission/);
  assert.match(guest,/nowInUse\?'approved':'pending'/);
  assert.match(guest,/status:nowInUse\?'approved':'pending',upload_verified_at:verifiedAt/);
  assert.match(app,/teamLogoResult==='public'/);
});
test('anonymous guests cannot overwrite a known team logo',()=>{
  assert.match(guest,/ignoreDuplicates:true/);
  assert.match(guest,/current\.data\.storage_path===logoRequest\.storage_path/);
  assert.match(guest,/teamLogoResult=nowInUse\?'public':'replacement'/);
  assert.match(app,/Logo replacement suggestions/);
  assert.match(app,/>Use this logo<\/button>/);
});
test('existing private Team Accounts is not exposed by gallery frontend',()=>{
  assert.match(logoSql,/memories-team-logos/);
  assert.match(logoSql,/create policy memory_team_logos_public_read/);
  assert.match(logoSql,/memories_private\.can_moderate/);
  assert.doesNotMatch(app,/sb_secret_/);
  assert.match(app,/Existing Team Accounts logo \(authorized copy\)/);
});
test('team logo policy does not approve photos or activate social publication',()=>{
  assert.match(guest,/status: 'pending', upload_verified_at: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(guest,/from\('memory_posts'\)\.update\(\{status:'approved'/);
});
