import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const sql=read('supabase/migrations/20261108180000_on_the_range_backend.sql');
const guest=read('supabase/functions/guest-memories/index.ts');
const social=read('supabase/functions/social-publisher/index.ts');
const config=read('supabase/config.toml');

// These are source-contract assertions, not live database policy validation.
test('photo submissions require both a gallery permission attestation and Turnstile',()=>{
  assert.match(guest,/x\.consent !== true/);
  assert.match(guest,/await verifyTurnstile\(str\(x\.turnstileToken\), 'upload', req\)/);
  assert.match(guest,/TURNSTILE_SECRET/);
  assert.match(guest,/RATE_SECRET\.length < 32/);
});
test('six images maximum, 5MB file limit and WebP-only bucket',()=>{
  assert.match(guest,/MAX_UPLOADS = 6/);
  assert.match(guest,/MAX_IMAGE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(sql,/allowed_mime_types[\s\S]*?image\/webp/);
  assert.match(sql,/file_size_limit,allowed_mime_types/);
});
test('incomplete draft cannot become publicly approved through moderator update',()=>{
  assert.match(sql,/constraint memory_post_verified_publication/);
  assert.match(guest,/upload_verified_at: new Date\(\)\.toISOString\(\)/);
  assert.match(guest,/storage\.from\(BUCKET\)\.info/);
});
test('anonymous users cannot insert posts and pending photos are never publicly exposed',()=>{
  assert.match(sql,/alter table public\.memory_posts enable row level security/);
  assert.match(sql,/alter table public\.memory_photos enable row level security/);
  assert.match(sql,/not privacy_hold/);
  assert.match(sql,/bucket_id='memories-private'/);
  assert.doesNotMatch(sql,/grant\s+insert\s+on\s+public\.memory_posts\s+to\s+anon/i);
});
test('moderators must be explicitly appointed, including team-specific appointments',()=>{
  assert.match(sql,/references auth\.users\(id\)/);
  assert.match(sql,/m\.team_id is null or m\.team_id = target_team/);
  assert.match(sql,/using\(memories_private\.can_moderate\(team_id\)\)/);
});
test('gallery permission does not authorize Facebook or Instagram',()=>{
  assert.match(sql,/social_consent boolean not null default false/);
  assert.match(sql,/social_reviewed boolean not null default false/);
  assert.match(sql,/NEW\.social_consent/);
  assert.match(sql,/NEW\.social_reviewed/);
  assert.match(sql,/NEW\.status = 'approved'/);
  assert.match(sql,/not NEW\.privacy_hold/);
});
test('both channels are disabled until deliberate activation',()=>{
  assert.match(sql,/values\('facebook',false\),\('instagram',false\)/i);
  assert.match(sql,/where platform=p_platform and enabled=true/);
  assert.match(social,/publisherSecret\.length<32/);
  assert.match(social,/ackSecret\.length<32/);
});
test('transactional claims and durable per-platform deduplication exist',()=>{
  assert.match(sql,/for update of o skip locked/);
  assert.match(sql,/unique\(photo_id,platform\)/);
  assert.match(sql,/publication_key text not null unique/);
  assert.match(sql,/status in \('ready','dispatching','accepted','published','failed','held','cancelled'\)/);
});
test('a webhook acceptance is not falsely marked as publication',()=>{
  assert.match(social,/status:'accepted'/);
  assert.match(social,/action==='ack'/);
  assert.match(social,/status:'published'/);
  assert.match(social,/external_post_id/);
  assert.doesNotMatch(social,/\.update\(\{status:'published'\}\)\.eq\('id',item\.id\)/);
});
test('private images require signed URLs; destinations are official pages only',()=>{
  assert.match(social,/createSignedUrl\(photoRow\.storage_path,24\*60\*60\)/);
  assert.match(social,/facebook\.com\/TexasSCTP/);
  assert.match(social,/instagram\.com\/texassctp/);
  assert.match(social,/u\.hostname==='hooks\.zapier\.com'/);
});
test('secrets are neither embedded in public configuration nor in SQL',()=>{
  assert.doesNotMatch(sql,/sb_secret_[A-Za-z0-9]+/);
  assert.doesNotMatch(config,/SOCIAL_ACK_SECRET=.*[^\s]/);
  assert.match(config,/verify_jwt = false/);
});
test('expired unpublished uploads can be cleaned without deleting approved galleries',()=>{
  assert.match(social,/\.eq\('status','draft'\)/);
  assert.match(social,/\.eq\('status','rejected'\)/);
  assert.doesNotMatch(social,/\.eq\('status','approved'\)\.lt\('created_at'/);
});
