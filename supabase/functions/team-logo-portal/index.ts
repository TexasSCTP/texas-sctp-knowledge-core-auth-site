import { createClient } from 'npm:@supabase/supabase-js@2.48.1';
const URL = Deno.env.get('SUPABASE_URL') || '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RATE_SECRET = Deno.env.get('MEMORIES_RATE_SECRET') || URL;
const bucket = 'memories-team-logos';
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const logoTypes:Record<string,string> = {'image/webp':'webp','image/png':'png','image/jpeg':'jpg'};
const admin = createClient(URL,KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'content-type, apikey, authorization','Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers});
const fail=(msg:string,status=400)=>json({error:msg},status);
function str(x:unknown){return typeof x==='string'?x.trim():'';}
async function fingerprint(req:Request){
 const ip=(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
 const bytes=new TextEncoder().encode(RATE_SECRET+'|team-logo|'+ip);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function catalog(){
 const {data:teams,error}=await admin.from('memory_teams').select('id,name,shot_team_id,league_name,team_category').eq('active',true).eq('portal_visible',true).order('name');
 if(error)throw new Error('Team directory unavailable.');
 const {data:logos,error:le}=await admin.from('memory_team_logos').select('team_id,storage_path,updated_at');
 const {data:profiles,error:profileError}=await admin.from('logo_portal_profiles')
   .select('team_id,team_kind,school_name,school_city,home_range_id,contact_role,contact_name,organization_email,contact_public_approved,profile_status');
 const {data:ranges,error:rangeError}=await admin.from('logo_portal_ranges').select('id,name,city,state').eq('active',true);
 if(profileError||rangeError)throw new Error('Team profile directory unavailable.');
 const byTeam=new Map((profiles||[]).map(p=>[p.team_id,p]));
 const byRange=new Map((ranges||[]).map(r=>[r.id,r]));
 if(le)throw new Error('Team logos unavailable.');
 const visibleTeamIds=new Set((teams||[]).map(t=>t.id));
 const paths=(logos||[]).filter(l=>visibleTeamIds.has(l.team_id)).map(x=>x.storage_path);
 const urls=new Map<string,string>();
 if(paths.length){
   const {data,error:signError}=await admin.storage.from(bucket).createSignedUrls(paths,3600);
   if(signError)throw new Error('Logo images unavailable.');
   for(let i=0;i<(data||[]).length;i++){
     if(data?.[i]?.signedUrl)urls.set(paths[i],data[i].signedUrl);
   }
 }
 return json({teams:(teams||[]).map(t=>{
   const p=byTeam.get(t.id);
   const approved=p?.profile_status==='approved';
   const kind=approved?p.team_kind:null;
   const range=kind==='club'?byRange.get(p.home_range_id):null;
   const city=kind==='school'?p.school_city:kind==='club'?(range?.city||null):null;
   const state=kind==='club'?(range?.state||null):null;
   const contact=approved&&p.contact_public_approved===true
    ? {name:p.contact_name,role:p.contact_role==='head_coach'?'Head Coach':'Organizational Contact',email:p.organization_email}
    : null;
   return {
     id:t.id,name:t.name,shotTeamId:t.shot_team_id||'',
     league:t.team_category==='collegiate'?'Collegiate Teams':(t.league_name||'Assignment Pending'),
     category:t.team_category==='collegiate'?'collegiate':'youth',
     teamKind:kind,
     schoolName:kind==='school'?p.school_name:null,
     homeRange:range?.name||null,
     city, state, contact,
     profileVerified:approved,
     logoUrl:urls.get((logos||[]).find(l=>l.team_id===t.id)?.storage_path||'')||null
   };
 })});
}
async function begin(req:Request,body:Record<string,unknown>){
 const teamId=str(body.teamId);
 const mimeType=(str(body.mimeType).toLowerCase()||'image/webp');
 const extension=logoTypes[mimeType];
 if(!extension)return fail('Choose a PNG, JPG, or WebP image.',415);
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(teamId))return fail('Select a valid team.');
 const {data:team,error:teamErr}=await admin.from('memory_teams').select('id').eq('id',teamId).eq('active',true).eq('portal_visible',true).maybeSingle();
 if(teamErr||!team)return fail('Team not found.',404);
 const fp=await fingerprint(req);
 const day=new Date(Date.now()-24*60*60*1000).toISOString();
 const hour=new Date(Date.now()-60*60*1000).toISOString();
 const [{count:ipHits,error:ipErr},{count:teamHits,error:teamErr2}]=await Promise.all([
   admin.from('memory_team_logo_upload_attempts').select('id',{head:true,count:'exact'}).eq('fingerprint',fp).gte('created_at',day),
   admin.from('memory_team_logo_upload_attempts').select('id',{head:true,count:'exact'}).eq('team_id',teamId).gte('created_at',hour)
 ]);
 if(ipErr||teamErr2)throw new Error('Upload service is temporarily unavailable.');
 if((ipHits||0)>=40)return fail('Daily upload limit reached. Please try tomorrow.',429);
 if((teamHits||0)>=20)return fail('This team has received several recent uploads. Please try again later.',429);
 const {error:attemptErr}=await admin.from('memory_team_logo_upload_attempts').insert({fingerprint:fp,team_id:teamId});
 if(attemptErr)throw new Error('Could not start the upload.');
 const path='team/'+teamId+'/'+crypto.randomUUID()+'.'+extension;
 const {data,error}=await admin.storage.from(bucket).createSignedUploadUrl(path);
 if(error||!data?.token)throw new Error('Could not reserve upload space.');
 return json({path,token:data.token,teamId,maxBytes:MAX_LOGO_BYTES,mimeType});
}
async function complete(body:Record<string,unknown>){
 const teamId=str(body.teamId),path=str(body.path);
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(teamId)||
    !/^team\/[A-Za-z0-9_-]{1,80}\/[0-9a-f-]{36}\.(webp|png|jpg|jpeg)$/.test(path)||
    !path.startsWith('team/'+teamId+'/'))return fail('Invalid logo submission.');
 const {data:team}=await admin.from('memory_teams').select('id').eq('id',teamId).eq('active',true).eq('portal_visible',true).maybeSingle();
 if(!team)return fail('Team not found.',404);
 const {data:info,error:ie}=await admin.storage.from(bucket).info(path);
 if(ie||!info)return fail('Logo was not uploaded.',404);
 const storedMime=String(info.contentType||info.mimetype||'').toLowerCase().split(';')[0].trim();
 const ext=logoTypes[storedMime],pathExtension=path.split('.').pop()?.toLowerCase();
 // Old cached clients used a .webp path even when Safari produced PNG data.
 // Accept those compatible legacy uploads but create correct extensions for new ones.
 if(Number(info.size)<150||Number(info.size)>MAX_LOGO_BYTES||!ext ||
   (pathExtension!==ext&&pathExtension!=='webp'))return fail('Logo must be PNG, JPG, or WebP and under 5 MB.',415);
 // Preserve the existing signed upload check and rate limiter.
 const {count:reservations,error:resErr}=await admin.from('memory_team_logo_upload_attempts')
   .select('id',{head:true,count:'exact'}).eq('team_id',teamId)
   .gte('created_at',new Date(Date.now()-2*60*60*1000).toISOString());
 if(resErr||!reservations)return fail('This upload session has expired.',410);
 // A new upload is a pending submission, NOT an immediately published logo.
 let {data:submission,error:lookupError}=await admin.from('logo_portal_submissions')
    .select('id,team_id,storage_path,status').eq('storage_path',path).maybeSingle();
 if(lookupError)throw new Error('Could not check the submitted logo.');
 if(submission&&submission.team_id!==teamId)return fail('Invalid team logo.',400);
 if(!submission){
   const {data:created,error:createError}=await admin.from('logo_portal_submissions')
     .insert({team_id:teamId,storage_path:path,status:'pending'})
     .select('id,team_id,storage_path,status').single();
   if(createError){
     // Allow a safe repeat of a finalized upload without duplicating emails.
     const {data:existing}=await admin.from('logo_portal_submissions')
        .select('id,team_id,storage_path,status').eq('storage_path',path).maybeSingle();
     if(!existing||existing.team_id!==teamId)throw new Error('Could not queue the logo for review.');
     submission=existing;
   }else submission=created;
 }
 if(submission.status==='pending'){
   try{await notifyLogoModerators(submission);}
   catch(error){console.error('Logo queued but notification dispatch failed',error);}
 }
 return json({ok:true,status:submission.status,submissionId:submission.id,
   message:submission.status==='pending'?'Logo submitted for moderator review.':'Logo submission already reviewed.'});
}

/* Staff actions always verify Supabase Auth and global moderator membership server-side.
 * This function deliberately does not expose any direct team updates to public clients. */
async function verifyStaff(req:Request){
 const auth=req.headers.get('authorization')||'';
 const token=/^Bearer\s+(\S+)$/i.exec(auth)?.[1];
 if(!token)return null;
 const {data,error}=await admin.auth.getUser(token);
 const user=data?.user;
 if(error||!user||!user.email_confirmed_at)return null;
 const {data:staff,error:se}=await admin.from('memory_moderators')
   .select('role,team_id,display_name')
   .eq('user_id',user.id)
   .is('team_id',null)
   .in('role',['owner','administrator','moderator'])
   .limit(1).maybeSingle();
 if(se)throw Error('Could not verify staff permissions.');
 if(!staff)return null;
 return {user,role:staff.role,displayName:staff.display_name||user.email||'Moderator'};
}

/* Approval queue and email alerts. All staff actions use verifyStaff. */
const MODERATOR_URL=Deno.env.get('TEAM_LOGO_MODERATOR_URL')||
 'https://texas-sctp-tournament-memories-preview.onrender.com/moderator-hub/team-logos/#logo-review-queue';
function escapeEmail(value:unknown){
 return str(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function emailReady(){
 return !!(Deno.env.get('RESEND_API_KEY')&&Deno.env.get('TEAM_LOGO_EMAIL_FROM'));
}
async function notifyLogoModerators(submission:{id:string,team_id:string,storage_path:string}){
 const {data:members,error:staffError}=await admin.from('memory_moderators')
   .select('user_id').is('team_id',null).in('role',['owner','administrator','moderator']);
 if(staffError)throw new Error('Could not locate notification recipients.');
 const {data:team,error:teamError}=await admin.from('memory_teams')
   .select('name,shot_team_id,league_name').eq('id',submission.team_id).maybeSingle();
 if(teamError||!team)throw new Error('Submitted team unavailable.');
 const {data:published}=await admin.from('memory_team_logos')
   .select('team_id').eq('team_id',submission.team_id).maybeSingle();
 const {data:link}=await admin.storage.from(bucket).createSignedUrl(submission.storage_path,86400);
 const logoUrl=link?.signedUrl||'';
 const kind=published?'Logo replacement':'New team logo';
 let sent=0,failed=0,notConfigured=0;
 for(const member of members||[]){
   const {data:account,error:accountError}=await admin.auth.admin.getUserById(member.user_id);
   if(accountError||!account?.user?.email){console.warn('Missing confirmed email for a logo moderator');continue;}
   const recipient=account.user.email;
   const {error:registerError}=await admin.from('logo_portal_notification_deliveries')
    .upsert({submission_id:submission.id,recipient_user_id:member.user_id,
       recipient_email:recipient},{onConflict:'submission_id,recipient_user_id',ignoreDuplicates:true});
   if(registerError){console.error('Notification registration failed',registerError);failed++;continue;}
   const {data:delivery,error:findError}=await admin.from('logo_portal_notification_deliveries')
     .select('id,status,attempts,last_attempt_at').eq('submission_id',submission.id)
     .eq('recipient_user_id',member.user_id).single();
   if(findError||!delivery){failed++;continue;}
   if(delivery.status==='sent')continue;
   if(delivery.status==='sending' && delivery.last_attempt_at &&
      Date.now()-new Date(delivery.last_attempt_at).getTime()<5*60*1000)continue;
   if(!emailReady()){
     await admin.from('logo_portal_notification_deliveries').update({
       status:'not_configured',error:'RESEND_API_KEY or TEAM_LOGO_EMAIL_FROM is missing'
     }).eq('id',delivery.id);
     notConfigured++;
     continue;
   }
   const {error:lockError}=await admin.from('logo_portal_notification_deliveries')
     .update({status:'sending',attempts:delivery.attempts+1,last_attempt_at:new Date().toISOString(),error:null})
     .eq('id',delivery.id);
   if(lockError){failed++;continue;}
   const safeTeam=escapeEmail(team.name),safeLeague=escapeEmail(team.league_name||'Assignment Pending');
   const safeId=escapeEmail(team.shot_team_id||'Not assigned');
   const safeKind=escapeEmail(kind),safeUrl=escapeEmail(MODERATOR_URL);
   const safeImage=escapeEmail(logoUrl);
   const html='<!doctype html><html><body style="background:#f4f6f8;margin:0;padding:25px;font-family:Arial,sans-serif;color:#16344e">'+
     '<div style="max-width:570px;margin:auto;background:#ffffff;border-top:6px solid #d9a441;padding:28px;border-radius:8px">'+
     '<p style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#ac7a27">TEXAS SCTP / TEAM LOGO PORTAL</p>'+
     '<h1 style="font-size:23px;margin:20px 0 10px">Team logo awaiting review</h1>'+
     '<p>A '+safeKind.toLowerCase()+' has been submitted and has not been published.</p>'+
     '<h2 style="font-size:18px;margin-bottom:8px">'+safeTeam+'</h2>'+
     '<p style="line-height:1.8">League: '+safeLeague+'<br>SHOT team ID: '+safeId+'</p>'+
     (logoUrl?'<img src="'+safeImage+'" alt="Submitted team logo" style="max-width:210px;max-height:210px;display:block;margin:22px auto;object-fit:contain">':'')+
     '<p style="margin:28px 0"><a href="'+safeUrl+'" style="background:#0f2c4c;color:#fff;text-decoration:none;padding:13px 20px;border-radius:5px;font-weight:bold">Review team logo</a></p>'+
     '<p style="font-size:12px;color:#667788">Sign in with your Texas SCTP moderator account. The preview above may expire; the review portal always provides a fresh image link.</p>'+
     '</div></body></html>';
   try{
     const response=await fetch('https://api.resend.com/emails',{
       method:'POST',
       headers:{'Authorization':'Bearer '+Deno.env.get('RESEND_API_KEY'),
         'Content-Type':'application/json',
         'Idempotency-Key':'texas-sctp-logo-'+submission.id+'-'+member.user_id+'-'+String(delivery.attempts+1)},
       body:JSON.stringify({
         from:Deno.env.get('TEAM_LOGO_EMAIL_FROM'),
         to:[recipient],
         subject:'Team logo awaiting review: '+team.name,
         html,
         text:'Texas SCTP team logo awaiting review\nTeam: '+team.name+
           '\nLeague: '+(team.league_name||'Assignment Pending')+
           '\nSHOT ID: '+(team.shot_team_id||'Not assigned')+
           '\nReview: '+MODERATOR_URL
       })
     });
     if(!response.ok){
       const details=await response.text();
       throw Error('Resend '+response.status+': '+details.slice(0,350));
     }
     const {error:saveError}=await admin.from('logo_portal_notification_deliveries')
       .update({status:'sent',sent_at:new Date().toISOString(),error:null}).eq('id',delivery.id);
     if(saveError)throw saveError;
     sent++;
   }catch(error){
     console.error('Logo moderator notification failed',error);
     await admin.from('logo_portal_notification_deliveries')
       .update({status:'failed',error:String(error).slice(0,500)}).eq('id',delivery.id);
     failed++;
   }
 }
 return {sent,failed,notConfigured};
}
async function staffLogoQueue(req:Request){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const {data:submissions,error}=await admin.from('logo_portal_submissions')
   .select('id,team_id,storage_path,status,created_at,reviewed_at,review_note')
   .order('created_at',{ascending:false}).limit(150);
 if(error)throw Error('Could not load the logo review queue.');
 const teamIds=[...new Set((submissions||[]).map(x=>x.team_id))];
 const {data:teams,error:te}=teamIds.length
   ?await admin.from('memory_teams').select('id,name,shot_team_id,league_name').in('id',teamIds)
   :{data:[],error:null};
 if(te)throw Error('Could not identify submitted teams.');
 const {data:published,error:pe}=teamIds.length
   ?await admin.from('memory_team_logos').select('team_id,storage_path').in('team_id',teamIds)
   :{data:[],error:null};
 if(pe)throw Error('Could not identify published logos.');
 const {data:deliveries,error:de}=submissions?.length
   ?await admin.from('logo_portal_notification_deliveries')
      .select('submission_id,status').in('submission_id',submissions.map(x=>x.id))
   :{data:[],error:null};
 if(de)throw Error('Could not load notification delivery states.');
 const paths=[...new Set([...(submissions||[]).map(x=>x.storage_path),
     ...(published||[]).map(x=>x.storage_path)].filter(Boolean))];
 const imageUrls=new Map<string,string>();
 if(paths.length){
   const {data:signed,error:se}=await admin.storage.from(bucket).createSignedUrls(paths,3600);
   if(se)throw Error('Could not generate secure logo previews.');
   for(let i=0;i<paths.length;i++)if(signed?.[i]?.signedUrl)imageUrls.set(paths[i],signed[i].signedUrl);
 }
 const teamById=new Map((teams||[]).map(t=>[t.id,t]));
 const publishedById=new Map((published||[]).map(t=>[t.team_id,t.storage_path]));
 const messages=new Map<string,string[]>();
 for(const d of deliveries||[])messages.set(d.submission_id,[...(messages.get(d.submission_id)||[]),d.status]);
 return json({emailConfigured:emailReady(),
    pending:(submissions||[]).filter(x=>x.status==='pending').length,
    submissions:(submissions||[]).map(s=>{
     const team=teamById.get(s.team_id);
     const states=messages.get(s.id)||[];
     return {id:s.id,status:s.status,teamId:s.team_id,
       teamName:team?.name||s.team_id,league:team?.league_name||'Assignment Pending',
       shotTeamId:team?.shot_team_id||'',submittedAt:s.created_at,
       reviewedAt:s.reviewed_at,reviewNote:s.review_note||null,
       logoUrl:imageUrls.get(s.storage_path)||null,
       previousLogoUrl:imageUrls.get(publishedById.get(s.team_id)||'')||null,
       deliveryStatus:states.includes('failed')?'failed':states.includes('not_configured')?'not_configured':
        states.includes('sent')?'sent':states.length?'pending':'unavailable'};
    })});
}
async function staffReviewLogo(req:Request,body:Record<string,unknown>){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const submissionId=str(body.submissionId);
 const approve=body.approve;
 const note=str(body.reviewNote);
 if(!/^[0-9a-f-]{36}$/i.test(submissionId)||typeof approve!=='boolean'||note.length>500)
   return fail('Invalid logo review request.');
 const {data,error}=await admin.rpc('logo_portal_review_submission',{
   p_submission_id:submissionId,p_approve:approve,p_actor:staff.user.id,p_note:note||null
 });
 if(error){console.error('Review logo failed',error);return fail('Could not complete the review. It may already be resolved.',409);}
 return json(data);
}
async function staffRetryLogoEmail(req:Request,body:Record<string,unknown>){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const submissionId=str(body.submissionId);
 if(!/^[0-9a-f-]{36}$/i.test(submissionId))return fail('Invalid submission.');
 const {data:s,error}=await admin.from('logo_portal_submissions')
   .select('id,team_id,storage_path,status').eq('id',submissionId).maybeSingle();
 if(error||!s||s.status!=='pending')return fail('Submission not awaiting review.',404);
 return json({ok:true,delivery:await notifyLogoModerators(s)});
}

async function staffList(req:Request){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const {data:teams,error}=await admin.from('memory_teams')
   .select('id,name,shot_team_id,league_name,team_category,active,portal_visible')
   .order('name');
 if(error)throw Error('Staff team directory unavailable.');
 const {data:logos,error:le}=await admin.from('memory_team_logos').select('team_id,storage_path');
 if(le)throw Error('Team logo status unavailable.');
 const logoPathByTeam=new Map((logos||[]).map(l=>[l.team_id,l.storage_path]));
 const logoUrls=new Map<string,string>();
 const imagePaths=[...new Set((logos||[]).map(l=>l.storage_path).filter(Boolean))];
 if(imagePaths.length){
   const {data:signed,error:signError}=await admin.storage.from(bucket).createSignedUrls(imagePaths,3600);
   if(signError)throw Error('Team logo previews could not be loaded.');
   for(let i=0;i<(signed||[]).length;i++){
     if(signed?.[i]?.signedUrl)logoUrls.set(imagePaths[i],signed[i].signedUrl);
   }
 }
 const {data:profiles,error:pe}=await admin.from('logo_portal_profiles')
   .select('team_id,team_kind,school_name,school_city,home_range_id,contact_role,contact_name,organization_email,contact_public_approved,profile_status,source_note,updated_at,verified_at');
 const {data:ranges,error:re}=await admin.from('logo_portal_ranges')
   .select('id,name,city,state,active,source_system').order('name');
 if(pe||re)throw Error('Staff profile data unavailable.');
 const profilesById=new Map((profiles||[]).map(p=>[p.team_id,p]));
 if(le)throw Error('Team logo status unavailable.');
 const uploaded=new Set((logos||[]).map(l=>l.team_id));
 return json({
  staff:{role:staff.role,displayName:staff.displayName},
  teams:(teams||[]).map(t=>({
   id:t.id,name:t.name,shotTeamId:t.shot_team_id||'',
   league:t.team_category==='collegiate'?'Collegiate Teams':(t.league_name||'Assignment Pending'),
   active:t.active===true,portalVisible:t.portal_visible===true,
   hasLogo:uploaded.has(t.id),
   logoUrl:logoUrls.get(logoPathByTeam.get(t.id)||'')||null,
   profile:profilesById.get(t.id)||null
  })),
  ranges:ranges||[]
 });
}
async function staffVisibility(req:Request,body:Record<string,unknown>){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const teamId=str(body.teamId);
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(teamId)||typeof body.visible!=='boolean')
   return fail('Select a valid team and visibility setting.');
 const {data,error}=await admin.rpc('memory_logo_portal_set_visibility',{
   p_team_id:teamId,p_visible:body.visible,p_actor_user_id:staff.user.id
 });
 if(error){console.error('Team visibility save error',error);return fail('Could not save team visibility.',500);}
 if(!data||data.teamId!==teamId||data.portalVisible!==body.visible)
   return fail('The visibility save was not confirmed.',500);
 return json({ok:true,...data});
}


/* Verified staff can manage directory profiles; fields remain private until approved.
   Classification and city derivation are validated independently by PostgreSQL. */
async function staffSaveProfile(req:Request,body:Record<string,unknown>){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const teamId=str(body.teamId);
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(teamId))return fail('Select a valid team.');
 const kind=str(body.teamKind)||null;
 const status=str(body.profileStatus)||'draft';
 const role=str(body.contactRole)||null;
 const schoolName=str(body.schoolName)||null;
 const schoolCity=str(body.schoolCity)||null;
 const contactName=str(body.contactName)||null;
 const orgEmail=str(body.organizationEmail).toLowerCase()||null;
 const note=str(body.sourceNote)||null;
 const rangeId=str(body.homeRangeId)||null;
 const publicContact=body.contactPublicApproved===true;
 if(kind!==null&&kind!=='school'&&kind!=='club')return fail('Choose School or Club.');
 if(status!=='draft'&&status!=='approved')return fail('Invalid review status.');
 if(role!==null&&role!=='head_coach'&&role!=='organization')return fail('Invalid contact role.');
 if(schoolName&&schoolName.length>150||schoolCity&&schoolCity.length>100||contactName&&contactName.length>120||
    orgEmail&&orgEmail.length>254||note&&note.length>400)return fail('One or more values are too long.');
 if(orgEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(orgEmail))return fail('Enter a valid organizational email.');
 if(kind==='school'&&rangeId!==null)return fail('School teams use the school city, not a range city.');
 if(kind==='club'&&(schoolName||schoolCity))return fail('Club city must come from the selected practice range.');
 if(kind===null&&(schoolName||schoolCity||rangeId))return fail('Select the team type before setting its location.');
 if(rangeId&&!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(rangeId))return fail('Select an approved home range.');
 if(status==='approved'&&!(kind==='school'&&schoolName&&schoolCity||kind==='club'&&rangeId))
    return fail('Complete school name and city, or club home range, before approving.');
 if(publicContact&&!(status==='approved'&&contactName&&orgEmail&&role))
   return fail('Approved public contact requires a name, role, and organizational email.');
 const {data,error}=await admin.rpc('logo_portal_save_profile',{
   p_team_id:teamId,p_kind:kind,p_school_name:schoolName,p_school_city:schoolCity,
   p_range_id:rangeId,p_contact_role:role,p_contact_name:contactName,
   p_org_email:orgEmail,p_contact_public:publicContact,p_status:status,
   p_source_note:note,p_actor:staff.user.id
 });
 if(error){console.error('profile save failed',error);return fail('Profile could not be saved. Check the required fields.',400);}
 if(!data?.saved||data.teamId!==teamId)return fail('Profile save not confirmed.',500);
 return json({ok:true,teamId,profileStatus:status,teamKind:kind});
}
async function staffAddRange(req:Request,body:Record<string,unknown>){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const name=str(body.name),city=str(body.city),state=str(body.state).toUpperCase()||'TX';
 if(name.length<2||name.length>160||city.length<2||city.length>100||!/^[A-Z]{2}$/.test(state))
   return fail('Enter a range name, city, and two-letter state.');
 const {data:duplicates,error:duplicateError}=await admin.from('logo_portal_ranges')
   .select('id,name,city,state').ilike('name',name).ilike('city',city).eq('state',state).limit(1);
 if(duplicateError)throw Error('Could not verify the range.');
 if(duplicates?.length)return fail('That range is already listed. Select the existing range.',409);
 const {data,error}=await admin.from('logo_portal_ranges')
   .insert({name,city,state,source_system:'staff',active:true})
   .select('id,name,city,state,active,source_system').single();
 if(error||!data)throw Error('Unable to add range.');
 return json({ok:true,range:data});
}


/* Public flags only create a private moderation task. They cannot hide a team. */
async function submitDirectoryReport(req:Request,body:Record<string,unknown>){
 const teamId=str(body.teamId);
 const reason=str(body.reason);
 const details=str(body.details);
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(teamId)||
    !['inactive','incorrect_details','other'].includes(reason)||
    details.length>500)return fail('Choose a valid reason and keep details under 500 characters.');
 const hashedVisitor=await fingerprint(req);
 const {data,error}=await admin.rpc('logo_portal_submit_report',{
   p_team_id:teamId,p_reason:reason,p_details:details,p_fingerprint:hashedVisitor
 });
 if(error){console.error('Logo directory report submission failed',error);return fail('Could not submit this report.',500);}
 if(data?.accepted===true)return json({ok:true,message:'Your report has been sent to Texas SCTP moderators.'});
 if(data?.code==='unavailable')return fail('This team is no longer available in the directory.',404);
 if(data?.code==='rate_limited')return fail('Too many recent reports. Please try again tomorrow.',429);
 if(data?.code==='recent_report')return fail('You have already reported this team recently. A moderator can still review your previous report.',429);
 return fail('Unable to accept this report.',400);
}
/* Verified statewide moderators only. Never return reporter fingerprint to clients. */
async function staffDirectoryReports(req:Request){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const fields='id,team_id,reason,details,status,created_at,reviewed_at,review_note';
 const [
   {data:openReports,error:openError},
   {data:recentlyClosed,error:closedError},
   {data:teams,error:te}
 ]=await Promise.all([
   admin.from('logo_portal_reports').select(fields)
     .eq('status','pending').order('created_at',{ascending:false}).limit(1000),
   admin.from('logo_portal_reports').select(fields)
     .neq('status','pending').order('created_at',{ascending:false}).limit(50),
   admin.from('memory_teams').select('id,name,active,portal_visible')
 ]);
 if(openError||closedError||te)throw Error('Could not load the team reports queue.');
 const reports=[...(openReports||[]),...(recentlyClosed||[])].sort(
   (a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()
 );
 const byTeam=new Map((teams||[]).map(t=>[t.id,t]));
 return json({reports:(reports||[]).map(r=>{
   const team=byTeam.get(r.team_id);
   return {
     id:r.id,teamId:r.team_id,teamName:team?.name||'Unlisted team',
     sourceActive:team?.active===true,portalVisible:team?.portal_visible===true,
     reason:r.reason,details:r.details||'',status:r.status,
     createdAt:r.created_at,reviewedAt:r.reviewed_at,reviewNote:r.review_note||null
   };
 })});
}
async function staffReportSummary(req:Request){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const {count,error}=await admin.from('logo_portal_reports')
   .select('id',{count:'exact',head:true}).eq('status','pending');
 if(error)throw Error('Team reports count unavailable.');
 return json({pending:count||0});
}
async function reviewDirectoryReport(req:Request,body:Record<string,unknown>){
 const staff=await verifyStaff(req);
 if(!staff)return fail('Authorized staff sign-in required.',401);
 const id=str(body.reportId);
 const decision=str(body.decision);
 const reviewNote=str(body.reviewNote);
 if(!/^[a-fA-F0-9-]{36}$/.test(id)||
    !['dismissed','confirmed_inactive'].includes(decision)||
    reviewNote.length>500||
    (decision==='confirmed_inactive'&&reviewNote.length<8))
   return fail('Choose a valid review decision. An inactivity determination requires a brief staff note.');
 const {data,error}=await admin.rpc('logo_portal_review_report',{
   p_report_id:id,p_decision:decision,p_review_note:reviewNote,
   p_actor:staff.user.id
 });
 if(error){console.error('Logo directory report review failed',error);
   return fail('Unable to save this decision. It may have been reviewed already.',409);
 }
 if(data?.ok!==true||!data.teamId)return fail('The report resolution was not confirmed.',500);
 return json(data);
}

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  if(req.method==='GET')return await catalog();
  if(req.method!=='POST')return fail('Unsupported method.',405);
  if(Number(req.headers.get('content-length')||0)>4096)return fail('Request too large.',413);
  const body=await req.json();
  if(!body||typeof body!=='object')return fail('Invalid request.');
  if(body.action==='report_team')return await submitDirectoryReport(req,body);
  if(body.action==='staff_reports')return await staffDirectoryReports(req);
  if(body.action==='staff_report_summary')return await staffReportSummary(req);
  if(body.action==='staff_report_review')return await reviewDirectoryReport(req,body);
  if(body.action==='staff_logo_queue')return await staffLogoQueue(req);
  if(body.action==='staff_logo_review')return await staffReviewLogo(req,body);
  if(body.action==='staff_logo_notify_retry')return await staffRetryLogoEmail(req,body);
  if(body.action==='staff_list')return await staffList(req);
  if(body.action==='staff_visibility')return await staffVisibility(req,body);
  if(body.action==='staff_profile_save')return await staffSaveProfile(req,body);
  if(body.action==='staff_range_add')return await staffAddRange(req,body);
  if(body.action==='begin')return await begin(req,body);
  if(body.action==='complete')return await complete(body);
  return fail('Unknown action.');
 }catch(e){console.error('team-logo error',e);return fail(e instanceof SyntaxError?'Invalid request.':'The portal could not complete your request.',500);}
});