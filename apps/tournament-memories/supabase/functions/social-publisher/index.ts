/* Texas SCTP | On the Range: server-only Facebook/Instagram publisher.
   Disabled by default in database. Requires separately approved social opt-in,
   local photo+caption review, channel activation and two backend-only secrets.
   A Zapier webhook 2xx is NOT publication: Zap must call the ack endpoint. */
import { createClient } from 'npm:@supabase/supabase-js@2.48.1';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const publisherSecret = Deno.env.get('SOCIAL_PUBLISHER_SECRET') || '';
const ackSecret = Deno.env.get('SOCIAL_ACK_SECRET') || '';
const fbHook = Deno.env.get('SOCIAL_FACEBOOK_ZAPIER_HOOK') || '';
const igHook = Deno.env.get('SOCIAL_INSTAGRAM_ZAPIER_HOOK') || '';
const galleryOrigin = 'https://ontherange.texassctp.com';
const client = url && serviceKey ? createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
const allowedPlatforms = new Set(['facebook','instagram']);
function respond(payload: unknown, status=200) {
  return new Response(JSON.stringify(payload), { status, headers:{'content-type':'application/json','cache-control':'no-store'} });
}
function txt(x:unknown, max=160) {
  return String(x ?? '').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function socialCopy(x:unknown,max=900) {
  return String(x??'').replace(/\r\n?/g,'\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,' ')
    .replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,max);
}
function validHook(raw:string) {
  try { const u=new URL(raw); return u.protocol==='https:' && !u.username && !u.password &&
    u.hostname==='hooks.zapier.com' && u.pathname.startsWith('/hooks/catch/'); }
  catch { return false; }
}
function validGallery(raw:string) {
  try { const u=new URL(raw);return u.protocol==='https:' && !u.username && !u.password; }
  catch { return false; }
}
function caption(post:any,team:any,tournament:any,reviewedCaption:unknown) {
  const name=txt(team?.name,100)||'Texas SCTP';
  const event=txt(tournament?.title||post.other_tournament,120)||'a Texas SCTP tournament';
  const postText=typeof reviewedCaption==='string' ? socialCopy(reviewedCaption) : (post.caption_social_approved ? socialCopy(post.caption,180) : '');
  const link=`${galleryOrigin}/#memory-${post.id}`;
  if (!validGallery(link)) throw Error('Untrusted gallery origin');
  return ['TEXAS SCTP | ON THE RANGE', `${name} in action at ${event}.`, postText,
    `Catch more of the action: ${link}`, '#TexasSCTP #OnTheRange'].filter(Boolean).join('\n\n');
}
async function dispatch(platform:string) {
  if (!client || !allowedPlatforms.has(platform)) throw Error('Unknown social platform');
  const configured=await client.rpc('memory_get_social_webhook',{p_platform:platform});
  if(configured.error) throw Error('Social webhook configuration lookup failed');
  const hook=typeof configured.data==='string' && validHook(configured.data)
    ? configured.data : (platform==='facebook'?fbHook:igHook);
  if (!validHook(hook)) return { status:'disabled', reason:'Zapier connection is not configured' };
  const triggerToken=await runtimeSecret('trigger');
  if(!triggerToken) return {status:'disabled',reason:'Zapier inbound verification is not configured'};
  // Atomic claim and fairness/weekly caps are enforced in PostgreSQL. Do not
  // retry uncertain (dispatching/accepted) deliveries: may duplicate Meta posts.
  const claim=await client.rpc('memory_claim_social_outbox',{p_platform:platform});
  if(claim.error) throw claim.error;
  const item=claim.data?.[0];
  if(!item) return { status:'idle', platform };
  try {
    const [p,photo,teams] = await Promise.all([
      client.from('memory_posts').select('id,team_id,tournament_id,other_tournament,status,caption,social_consent,social_reviewed,caption_social_approved,privacy_hold,gallery_consent').eq('id',item.post_id).single(),
      client.from('memory_photos').select('id,post_id,storage_path,public_visible').eq('id',item.photo_id).single(),
      client.from('memory_teams').select('id,name').limit(2000)
    ]);
    const post=p.data, photoRow=photo.data;
    if(p.error||photo.error||teams.error||!post||!photoRow || photoRow.post_id!==post.id ||
      post.status!=='approved'||!post.gallery_consent||!post.social_consent||!post.social_reviewed||post.privacy_hold||photoRow.public_visible!==true)
      throw Error('Post no longer eligible for social sharing');
    const team=teams.data?.find((x:any)=>x.id===post.team_id);
    const evt=post.tournament_id ? await client.from('memory_tournaments').select('id,title').eq('id',post.tournament_id).maybeSingle() : {data:null,error:null};
    if(evt.error) throw evt.error;
    const signed=await client.storage.from('memories-private').createSignedUrl(photoRow.storage_path,24*60*60);
    if(signed.error||!signed.data?.signedUrl) throw Error('Unable to create secure photo access');
    const imageUrl=signed.data.signedUrl;
    if(!imageUrl.startsWith('https://')) throw Error('Signed photo URL must use HTTPS');
    const text=caption(post,team,evt.data,item.approved_caption);
    const payload={
      platform,webhook_auth:triggerToken,publication_key:item.publication_key,
      source_post_id:post.id, source_photo_id:photoRow.id,
      page_url:platform==='facebook'?'https://www.facebook.com/TexasSCTP':'https://www.instagram.com/texassctp/',
      image_url:imageUrl,photo_url:imageUrl,description:text,caption:text,
      gallery_url:`${galleryOrigin}/#memory-${post.id}`,
      team_name:txt(team?.name,100),tournament_name:txt(evt.data?.title||post.other_tournament,120)
    };
    const res=await fetch(hook,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    if(!res.ok) throw Error(`Zapier hook rejected request: ${res.status}`);
    // A queued Zap is NOT confirmation of Meta publication.
    const updated=await client.from('memory_social_outbox')
      .update({status:'accepted',accepted_at:new Date().toISOString()})
      .eq('id',item.id).eq('status','dispatching');
    if(updated.error) throw updated.error;
    return {status:'accepted_by_zapier',platform,publication_key:item.publication_key};
  } catch(e) {
    const msg=String(e instanceof Error?e.message:e).slice(0,240);
    await client.from('memory_social_outbox').update({status:'failed',last_error:msg})
      .eq('id',item.id).eq('status','dispatching');
    console.error('Social publishing exception:',item.id,platform,msg);
    return {status:'failed',platform,publication_key:item.publication_key,reason:'Review failed queue item'};
  }
}
async function acknowledge(input:Record<string,unknown>) {
  if(!client) throw Error('Backend unavailable');
  const key=txt(input.publication_key,220), platform=txt(input.platform,16);
  const external=txt(input.external_post_id,220);
  if(!allowedPlatforms.has(platform)||key.length<70||!external) throw Error('Invalid publication acknowledgment');
  const row=await client.from('memory_social_outbox').select('id,post_id,status,platform,removal_required')
    .eq('publication_key',key).eq('platform',platform).maybeSingle();
  if(row.error||!row.data) throw Error('Unknown publication key');
  if(row.data.status==='published') return {acknowledged:true,idempotent:true};
  if(!['dispatching','accepted'].includes(row.data.status)) throw Error('Publication not awaiting acknowledgment');
  const saved=await client.from('memory_social_outbox').update({
    status:'published',published_at:new Date().toISOString(),external_post_id:external,last_error:null
  }).eq('id',row.data.id).in('status',['dispatching','accepted']);
  if(saved.error) throw saved.error;
  // Record the external post ID even if consent was subsequently withdrawn:
  // a separate removal action is then required on the Meta platform.
  const post=await client.from('memory_posts').select('status,social_consent,privacy_hold').eq('id',row.data.post_id).maybeSingle();
  return {acknowledged:true,removal_required:Boolean(row.data.removal_required || (post.data &&
    (post.data.status!=='approved'||!post.data.social_consent||post.data.privacy_hold)))};
}

async function cleanup() {
  if(!client) throw Error('Backend unavailable');
  // Never delete approved posts. Remove only abandoned drafts and old declined
  // submissions. Published external IDs are retained for removal auditing.
  const expired=new Date(Date.now()-48*60*60*1000).toISOString();
  const declined=new Date(Date.now()-30*24*60*60*1000).toISOString();
  const [drafts,rejected]=await Promise.all([
    client.from('memory_posts').select('id').eq('status','draft').lt('created_at',expired).limit(40),
    client.from('memory_posts').select('id').eq('status','rejected').lt('created_at',declined).limit(40)
  ]);
  if(drafts.error||rejected.error)throw Error('Retention query failed');
  let deleted=0,errors=0;
  for(const record of [...(drafts.data||[]),...(rejected.data||[])]){
    const photos=await client.from('memory_photos').select('storage_path').eq('post_id',record.id);
    if(photos.error){errors++;continue;}
    const paths=(photos.data||[]).map((x:any)=>x.storage_path);
    if(paths.length){
      const removed=await client.storage.from('memories-private').remove(paths);
      if(removed.error){errors++;continue;}
    }
    const removedPost=await client.from('memory_posts').delete().eq('id',record.id).in('status',['draft','rejected']);
    if(removedPost.error)errors++;else deleted++;
  }
  return {deleted,errors};
}
async function runtimeSecret(kind:'ack'|'publisher'|'trigger') {
  if(!client) throw Error('Backend unavailable');
  const lookup = await client.rpc('memory_get_social_runtime_secret',{p_kind:kind});
  if(lookup.error) throw Error('Secure credential lookup failed');
  const fallback = kind==='ack'?ackSecret:(kind==='publisher'?publisherSecret:'');
  const value = typeof lookup.data==='string' && lookup.data.length>=32 ? lookup.data : fallback;
  return value.length>=32 ? value : '';
}

Deno.serve(async req => {
  if(req.method!=='POST')return respond({error:'POST required'},405);
  if(!client)
    return respond({error:'Social publishing is not configured'},503);
  try{
    const raw=await req.text();if(raw.length>10000)return respond({error:'Too large'},413);
    const body=JSON.parse(raw) as Record<string,unknown>;
    const action=txt(body.action,24);
    if(action==='dispatch'){
      const activePublisherSecret=await runtimeSecret('publisher');
      if(!activePublisherSecret)return respond({error:'Publishing dispatch credentials are not configured'},503);
      if(req.headers.get('x-publisher-secret')!==activePublisherSecret)return respond({error:'Unauthorized'},401);
      return respond(await dispatch(txt(body.platform,16)));
    }
    if(action==='cleanup'){
      if(req.headers.get('x-publisher-secret')!==publisherSecret)return respond({error:'Unauthorized'},401);
      return respond(await cleanup());
    }
    if(action==='ack'){
      const activeAckSecret=await runtimeSecret('ack');
      if(!activeAckSecret)return respond({error:'Publication acknowledgment credentials are not configured'},503);
      if(req.headers.get('x-ack-secret')!==activeAckSecret)return respond({error:'Unauthorized'},401);
      return respond(await acknowledge(body));
    }
    return respond({error:'Unsupported action'},400);
  }catch(e){console.error('social-publisher',e instanceof Error?e.message:'unknown');return respond({error:'Publication operation failed'},400);}
});
