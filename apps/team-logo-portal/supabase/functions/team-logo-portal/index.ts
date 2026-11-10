import { createClient } from 'npm:@supabase/supabase-js@2.48.1';
const URL = Deno.env.get('SUPABASE_URL') || '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RATE_SECRET = Deno.env.get('MEMORIES_RATE_SECRET') || URL;
const bucket = 'memories-team-logos';
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
 if((ipHits||0)>=15)return fail('Daily upload limit reached. Please try tomorrow.',429);
 if((teamHits||0)>=8)return fail('This team has received several recent uploads. Please try again later.',429);
 const {error:attemptErr}=await admin.from('memory_team_logo_upload_attempts').insert({fingerprint:fp,team_id:teamId});
 if(attemptErr)throw new Error('Could not start the upload.');
 const path='team/'+teamId+'/'+crypto.randomUUID()+'.webp';
 const {data,error}=await admin.storage.from(bucket).createSignedUploadUrl(path);
 if(error||!data?.token)throw new Error('Could not reserve upload space.');
 return json({path,token:data.token,teamId,maxBytes:2097152});
}
async function complete(body:Record<string,unknown>){
 const teamId=str(body.teamId),path=str(body.path);
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(teamId)||
    !/^team\/[A-Za-z0-9_-]{1,80}\/[0-9a-f-]{36}\.webp$/.test(path)||
    !path.startsWith('team/'+teamId+'/'))return fail('Invalid logo submission.');
 const {data:team}=await admin.from('memory_teams').select('id').eq('id',teamId).eq('active',true).eq('portal_visible',true).maybeSingle();
 if(!team)return fail('Team not found.',404);
 const {data:info,error:ie}=await admin.storage.from(bucket).info(path);
 if(ie||!info)return fail('Logo was not uploaded.',404);
 if(Number(info.size)<150||Number(info.size)>2097152||
   !String(info.contentType||info.mimetype||'').startsWith('image/webp'))return fail('Please upload a WebP logo under 2 MB.');
 // Only reserved uploads may be finalized; prevents arbitrary linking of other private objects.
 const {count:reservations,error:resErr}=await admin.from('memory_team_logo_upload_attempts')
   .select('id',{head:true,count:'exact'}).eq('team_id',teamId)
   .gte('created_at',new Date(Date.now()-2*60*60*1000).toISOString());
 if(resErr||!reservations)return fail('This upload session has expired.',410);
 const {error:historyErr}=await admin.from('memory_team_logo_versions')
   .upsert({team_id:teamId,storage_path:path,source:'team_portal'},{onConflict:'storage_path',ignoreDuplicates:true});
 if(historyErr)throw new Error('Could not preserve logo history.');
 // Upserting affects the official displayed logo, never deletes prior logo objects.
 const {error:saveErr}=await admin.from('memory_team_logos').upsert({
   team_id:teamId,storage_path:path,source:'external',updated_by:null,updated_at:new Date().toISOString()
 },{onConflict:'team_id'});
 if(saveErr)throw new Error('Could not set the displayed logo.');
 return json({ok:true});
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
 const [{data:reports,error},{data:teams,error:te}]=await Promise.all([
   admin.from('logo_portal_reports')
     .select('id,team_id,reason,details,status,created_at,reviewed_at,review_note')
     .order('created_at',{ascending:false}).limit(250),
   admin.from('memory_teams').select('id,name,active,portal_visible')
 ]);
 if(error||te)throw Error('Could not load the team reports queue.');
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
  if(body.action==='staff_list')return await staffList(req);
  if(body.action==='staff_visibility')return await staffVisibility(req,body);
  if(body.action==='staff_profile_save')return await staffSaveProfile(req,body);
  if(body.action==='staff_range_add')return await staffAddRange(req,body);
  if(body.action==='begin')return await begin(req,body);
  if(body.action==='complete')return await complete(body);
  return fail('Unknown action.');
 }catch(e){console.error('team-logo error',e);return fail(e instanceof SyntaxError?'Invalid request.':'The portal could not complete your request.',500);}
});