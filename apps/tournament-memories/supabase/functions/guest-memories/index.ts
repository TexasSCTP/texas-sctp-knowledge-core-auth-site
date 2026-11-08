/* Texas SCTP | On the Range: PUBLIC guest gateway.
   Only this function can create guest drafts, presign uploads and record
   comments/reactions. TURNSTILE_SECRET_KEY and MEMORIES_RATE_SECRET required;
   missing settings fail closed. This code does not publish anything directly. */
import { createClient } from 'npm:@supabase/supabase-js@2.48.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') || '';
const RATE_SECRET = Deno.env.get('MEMORIES_RATE_SECRET') || '';
const ALLOWED_ORIGINS = (Deno.env.get('MEMORIES_ALLOWED_ORIGINS') || 'https://texas-sctp-tournament-memories-preview.onrender.com')
  .split(',').map(x => x.trim()).filter(Boolean);
const ALLOWED_HOSTS = (Deno.env.get('TURNSTILE_ALLOWED_HOSTNAMES') || 'texas-sctp-tournament-memories-preview.onrender.com')
  .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const BUCKET = 'memories-private';
const LOGO_BUCKET = 'memories-team-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const MAX_UPLOADS = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const admin = SUPABASE_URL && SERVICE_ROLE ? createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

const json = (data: Record<string, unknown>, code = 200, origin = '') => new Response(JSON.stringify(data), {
  status: code, headers: { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'access-control-allow-origin': origin, 'vary': 'Origin',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'authorization, apikey, x-client-info, content-type' }
});
const fail = (error: string, status = 400, origin = '') => json({ error }, status, origin);
const str = (x: unknown) => typeof x === 'string' ? x.trim() : '';
const sha256 = async (x: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(x))))
  .map(v => v.toString(16).padStart(2, '0')).join('');
async function hmac(x: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(RATE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(x))))
    .map(v => v.toString(16).padStart(2, '0')).join('');
}
async function quota(req: Request, action: 'begin' | 'comment' | 'react', perHour: number) {
  if (!admin || RATE_SECRET.length < 32) throw Error('Gallery submission security is not configured.');
  // Untrusted forwarded IP headers are best-effort only; additional global limit
  // prevents unlimited storage consumption via simple header rotation.
  const source = [str(req.headers.get('cf-connecting-ip')), str(req.headers.get('x-real-ip')),
    str(req.headers.get('x-forwarded-for')).split(',')[0]].find(Boolean) || 'unknown';
  const who = await hmac(`${source}|${str(req.headers.get('user-agent')).slice(0,180)}`);
  const global = await hmac('GLOBAL/TEXAS-SCTP/MEMORIES');
  const first = await admin.rpc('memory_consume_quota', { p_hash: who, p_action: action, p_limit: perHour, p_minutes: 60 });
  if (first.error) throw first.error;
  const second = await admin.rpc('memory_consume_quota', { p_hash: global, p_action: action,
    p_limit: action === 'begin' ? 400 : action === 'comment' ? 1000 : 10000, p_minutes: 1440 });
  if (second.error) throw second.error;
  if (!first.data || !second.data) throw Error('Too many requests. Try again later.');
  return who;
}
async function verifyTurnstile(token: string, action: 'upload' | 'comment', req: Request) {
  if (!TURNSTILE_SECRET || ALLOWED_HOSTS.length === 0) throw Error('Photo submission security has not been activated.');
  if (token.length < 10 || token.length > 2200) throw Error('Complete the security check.');
  const form = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
  const ip = req.headers.get('cf-connecting-ip');
  if (ip) form.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form,
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw Error('Security verification is temporarily unavailable.');
  const result = await response.json();
  if (result.success !== true || !ALLOWED_HOSTS.includes(str(result.hostname).toLowerCase()))
    throw Error('Security check unsuccessful. Please try again.');
  // Widgets may omit an action. When an action is present, it must match.
  if (result.action && result.action !== action) throw Error('Security check purpose did not match.');
}
function centralToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}
function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value && value <= centralToday();
}
async function begin(req: Request, x: Record<string, unknown>) {
  if (str(x.website)) throw Error('Submission rejected.');
  if (x.consent !== true) throw Error('Confirm you have permission to submit these photos.');
  const teamId = str(x.teamId), tournamentId = str(x.tournamentId) || null;
  const other = str(x.otherTournament), date = str(x.photoDate), credit = str(x.credit), caption = str(x.caption);
  const count = Number(x.fileCount);
  const logoRequested=x.logoRequested===true;
  if (!teamId || !isDate(date) || !Number.isInteger(count) || count < 1 || count > MAX_UPLOADS
      || credit.length > 80 || caption.length > 900 || other.length > 120
      || (tournamentId === null && other.length < 3)) throw Error('Review your team, event, date and photos.');
  await verifyTurnstile(str(x.turnstileToken), 'upload', req);
  await quota(req, 'begin', 3);
  const [t, event] = await Promise.all([
    admin!.from('memory_teams').select('id').eq('id', teamId).eq('active', true).maybeSingle(),
    tournamentId ? admin!.from('memory_tournaments').select('id,event_date').eq('id', tournamentId).eq('active', true).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (t.error || !t.data || event.error || (tournamentId && !event.data)) throw Error('Choose an available team and tournament.');
  if (event.data && event.data.event_date !== date) throw Error('Tournament date does not match the selected event.');
  const submissionId = crypto.randomUUID(), submissionKey = crypto.randomUUID() + crypto.randomUUID();
  const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { error: rowError } = await admin!.from('memory_posts').insert({
    id: submissionId, team_id: teamId, tournament_id: tournamentId,
    other_tournament: tournamentId ? null : other, photo_date: date,
    photo_credit: credit, caption, expected_photo_count: count, status: 'draft',
    gallery_consent: true, social_consent: x.socialConsent === true,
    submission_key_hash: await sha256(submissionKey), submission_expires_at: expires
  });
  if (rowError) throw rowError;
  const paths = Array.from({ length: count }, (_, position) => ({
    post_id: submissionId, position, storage_path: `${submissionId}/${position}-${crypto.randomUUID()}.webp`
  }));
  const { error: filesError } = await admin!.from('memory_photos').insert(paths);
  if (filesError) throw filesError;
  const slots = [];
  for (const item of paths) {
    const signed = await admin!.storage.from(BUCKET).createSignedUploadUrl(item.storage_path);
    if (signed.error || !signed.data?.token) throw Error('Could not reserve secure photo upload. Please try again.');
    slots.push({ path: item.storage_path, token: signed.data.token });
  }
  // The first completed team logo becomes public by default after server-side
  // validation. A different logo cannot overwrite existing team branding from
  // an anonymous photo submission; moderators choose any replacement.
  let logoSlot: { path: string, token: string } | null = null;
  if(logoRequested){
    const logoPath='submissions/'+submissionId+'/'+crypto.randomUUID()+'.webp';
    const proposal=await admin!.from('memory_team_logo_requests').insert({
      post_id:submissionId,team_id:teamId,storage_path:logoPath,status:'draft'
    });
    if(proposal.error) throw Error('Could not prepare the team logo proposal.');
    const reserved=await admin!.storage.from(LOGO_BUCKET).createSignedUploadUrl(logoPath);
    if(reserved.error || !reserved.data?.token) throw Error('Could not prepare the team logo upload.');
    logoSlot={path:logoPath,token:reserved.data.token};
  }
  return { submissionId, submissionKey, slots, logoSlot };
}
async function finish(x: Record<string, unknown>) {
  const id = str(x.submissionId), key = str(x.submissionKey);
  if (!UUID.test(id) || key.length < 60 || key.length > 160) throw Error('Invalid upload session.');
  const { data: post, error } = await admin!.from('memory_posts')
    .select('id,status,submission_key_hash,submission_expires_at,expected_photo_count')
    .eq('id',id).maybeSingle();
  if (error || !post || post.submission_key_hash !== await sha256(key)) throw Error('Upload session not found.');
  if (post.status === 'pending') return { accepted: true };
  if (post.status !== 'draft' || !post.submission_expires_at || new Date(post.submission_expires_at) < new Date())
    throw Error('Upload session has expired. Please submit again.');
  const { data: photoRows, error: photosError } = await admin!.from('memory_photos')
    .select('storage_path,position').eq('post_id',id).order('position');
  if (photosError || !photoRows || photoRows.length !== post.expected_photo_count) throw Error('Photo count does not match.');
  for (const photo of photoRows) {
    const res = await admin!.storage.from(BUCKET).info(photo.storage_path);
    if (res.error || !res.data || Number(res.data.size) < 100 || Number(res.data.size) > MAX_IMAGE_BYTES
        || !String(res.data.contentType || res.data.mimetype || 'image/webp').startsWith('image/webp'))
      throw Error('One or more photos have not finished uploading.');
  }
  const {data:logoRequest,error:logoLookupError}=await admin!.from('memory_team_logo_requests')
    .select('id,storage_path,status').eq('post_id',id).maybeSingle();
  if(logoLookupError) throw Error('Could not verify the optional team logo.');
  if(logoRequest){
    const uploaded=await admin!.storage.from(LOGO_BUCKET).info(logoRequest.storage_path);
    if(uploaded.error || !uploaded.data ||
       Number(uploaded.data.size)<100 || Number(uploaded.data.size)>MAX_LOGO_BYTES ||
       !String(uploaded.data.contentType||uploaded.data.mimetype||'').startsWith('image/webp'))
      throw Error('The optional team logo has not finished uploading.');
    if(logoRequest.status==='draft'){
      const verifiedAt=new Date().toISOString();
      const postTeam=await admin!.from('memory_posts')
        .select('team_id').eq('id',id).single();
      if(postTeam.error||!postTeam.data?.team_id)throw Error('Could not verify the logo team.');
      // First completed logo wins atomically; a guest cannot replace an
      // existing official logo for the same team.
      const insert=await admin!.from('memory_team_logos').upsert({
        team_id:postTeam.data.team_id,storage_path:logoRequest.storage_path,
        source:'gallery',updated_by:null,updated_at:verifiedAt
      },{onConflict:'team_id',ignoreDuplicates:true});
      if(insert.error)throw Error('Could not associate the optional team logo.');
      const current=await admin!.from('memory_team_logos')
        .select('storage_path').eq('team_id',postTeam.data.team_id).single();
      if(current.error||!current.data)throw Error('Could not verify the team logo association.');
      const nowInUse=current.data.storage_path===logoRequest.storage_path;
      // A new team logo is immediately available publicly. Only competing
      // replacements require a moderator to select which logo represents
      // the team, not a second public-use consent or approval.
      const finalized=await admin!.from('memory_team_logo_requests').update({
        status:nowInUse?'approved':'pending',upload_verified_at:verifiedAt,
        moderated_at:nowInUse?verifiedAt:null
      }).eq('id',logoRequest.id).eq('status','draft');
      if(finalized.error)throw Error('Could not finalize the team logo.');
    }
  }
  const done = await admin!.from('memory_posts').update({ status: 'pending', upload_verified_at: new Date().toISOString() }).eq('id',id).eq('status','draft');
  if (done.error) throw done.error;
  return { accepted: true };
}
async function comment(req: Request, x: Record<string, unknown>) {
  if (str(x.website)) throw Error('Comment rejected.');
  const postId = str(x.postId), name = str(x.displayName), body = str(x.body);
  if (!UUID.test(postId) || name.length < 2 || name.length > 60 || body.length < 1 || body.length > 400)
    throw Error('Enter a name and comment of 400 characters or fewer.');
  await verifyTurnstile(str(x.turnstileToken), 'comment', req);
  await quota(req, 'comment', 8);
  const post = await admin!.from('memory_posts').select('id').eq('id',postId).eq('status','approved').eq('privacy_hold',false).maybeSingle();
  if (post.error || !post.data) throw Error('This post is not available for comments.');
  const created = await admin!.from('memory_comments').insert({ post_id: postId, display_name: name, body, status: 'pending' });
  if (created.error) throw created.error;
  return { accepted: true };
}
async function react(req: Request, x: Record<string, unknown>) {
  const postId = str(x.postId), visitorId = str(x.visitorId);
  if (!UUID.test(postId) || !UUID.test(visitorId)) throw Error('Invalid reaction.');
  const who = await quota(req,'react',30);
  const visitorHash = await hmac(`visitor:${visitorId}:${who}`);
  const post = await admin!.from('memory_posts').select('id').eq('id',postId).eq('status','approved').eq('privacy_hold',false).maybeSingle();
  if (post.error || !post.data) throw Error('This post is not available for reactions.');
  const existing = await admin!.from('memory_reactions').select('id').eq('post_id',postId).eq('visitor_hash',visitorHash).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const removed = await admin!.from('memory_reactions').delete().eq('id',existing.data.id);
    if (removed.error) throw removed.error;
    return { liked: false };
  }
  const made = await admin!.from('memory_reactions').insert({ post_id: postId, visitor_hash: visitorHash });
  if (made.error) throw made.error;
  return { liked: true };
}
Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  if (!ALLOWED_ORIGINS.includes(origin)) return fail('Origin not allowed.',403,origin);
  if (req.method === 'OPTIONS') return json({},200,origin);
  if (req.method !== 'POST') return fail('Method not allowed.',405,origin);
  if (!admin || !SERVICE_ROLE || RATE_SECRET.length < 32 || !TURNSTILE_SECRET)
    return fail('Gallery submission service is not activated.',503,origin);
  try {
    const raw = await req.text();
    if (raw.length > 16000) return fail('Request too large.',413,origin);
    const input = JSON.parse(raw) as Record<string, unknown>;
    const action = str(input.action);
    const value = action === 'begin' ? await begin(req,input)
      : action === 'finish' ? await finish(input)
      : action === 'comment' ? await comment(req,input)
      : action === 'react' ? await react(req,input)
      : null;
    if (!value) return fail('Unknown action.',400,origin);
    return json(value,200,origin);
  } catch (error) {
    console.error('guest-memories:',error instanceof Error ? error.message : 'unknown');
    // Do not return database stack traces or table names to anonymous callers.
    const message = error instanceof Error ? error.message : 'Could not complete request.';
    const safe = /^(Complete|Confirm|Security|Review|Choose|Tournament|Upload|One or more|Photo count|The optional team logo|Invalid|Too many|Enter|This post|Comment rejected|Submission rejected|Gallery submission security)/.test(message)
      ? message : 'Could not complete the request. Please try again.';
    return fail(safe,400,origin);
  }
});
