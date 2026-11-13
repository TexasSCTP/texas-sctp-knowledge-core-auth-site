/* Texas SCTP Moderator Hub.
 * Uses the same Supabase project AND the default auth-session storage key
 * as On the Range, on the same origin. No separate login account is created. */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';

const $ = selector => document.querySelector(selector);
const cfg = window.TEXAS_SCTP_CONFIG || {};
const loginMarker = 'txsctp-hub-login-pending';
const client = cfg.supabaseUrl && cfg.supabasePublishableKey
  ? createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
    })
  : null;
let checking = false;
$('#year').textContent = String(new Date().getFullYear());

function view(which) {
  for(const id of ['loading-state','staff-panel','access-denied','login-panel'])
    $('#'+id).hidden = which !== id;
}
function setError(message){
  $('#loading-state').textContent = message;
  view('loading-state');
}
async function loadFlagSummary(){
  const marker=$('#team-flags-alert');
  marker.hidden=true;
  if(!client)return;
  try{
    const {data:{session},error:sessionError}=await client.auth.getSession();
    if(sessionError||!session?.access_token)return;
    const response=await fetch(cfg.supabaseUrl+'/functions/v1/team-logo-portal',{
      method:'POST',cache:'no-store',
      headers:{
        'Content-Type':'application/json',
        'apikey':cfg.supabasePublishableKey,
        'authorization':'Bearer '+session.access_token
      },
      body:JSON.stringify({action:'staff_report_summary'})
    });
    if(!response.ok)throw Error('Report count unavailable');
    const payload=await response.json();
    if(!Number.isInteger(payload.pending)||payload.pending<0)throw Error('Invalid count');
    marker.textContent=payload.pending===0
      ? 'No team reports waiting for review.'
      : payload.pending+' team '+(payload.pending===1?'report awaits':'reports await')+' moderator review.';
    marker.className='team-flags-alert'+(payload.pending>0?' has-pending':'');
    marker.hidden=false;
  }catch(error){console.warn('Unable to fetch pending report count:',error.message);}
}
async function loadPhotoFlagSummary(){
  const marker=$('#photo-flags-alert');
  marker.hidden=true;
  if(!client)return;
  try{
    const {count,error}=await client.from('memory_photo_reports')
      .select('id',{count:'exact',head:true})
      .in('status',['pending','in_review']);
    if(error)throw error;
    const waiting=Number(count)||0;
    marker.textContent=waiting>0
      ?waiting+' photograph '+(waiting===1?'has been flagged':'reports have been flagged')+' for moderator review.'
      :'No flagged photographs currently need review.';
    marker.className='photo-flags-alert'+(waiting?' has-pending':'');
    marker.hidden=false;
    $('#photo-flags-tool').textContent=waiting
      ?'Review flagged photographs ('+waiting+')'
      :'Open photo report inbox';
  }catch(error){
    console.warn('Photo report count unavailable:',error.message);
    marker.hidden=true;
  }
}
async function checkStaff(){
  if(checking || !client)return;
  checking=true;
  try {
    view('loading-state');
    const {data:{user},error:authError} = await client.auth.getUser();
    if(authError && !user) {view('login-panel');return;}
    if(!user) {view('login-panel');return;}
    // Mirrors the staff-invitation redemption already used by On the Range.
    const {error:claimError}=await client.rpc('memory_claim_staff_invitation');
    if(claimError)console.warn('Staff invitation claim was not available:',claimError.message);
    const {data:roles,error:roleError}=await client.from('memory_moderators')
      .select('role,team_id,display_name').eq('user_id',user.id).limit(50);
    if(roleError)throw new Error('Could not confirm staff access. Please refresh or contact an administrator.');
    if(!roles?.length){view('access-denied');return;}
    const priority = {owner:0,administrator:1,moderator:2};
    const sorted=[...roles].sort((a,b)=>(priority[a.role]??4)-(priority[b.role]??4));
    const global=roles.some(x=>x.team_id===null&&['owner','administrator','moderator'].includes(x.role));
    const name=sorted.find(x=>x.display_name)?.display_name||user.email||'Texas SCTP moderator';
    const label=sorted[0]?.role==='owner'?'Owner':sorted[0]?.role==='administrator'?'Administrator':'Moderator';
    $('#staff-summary').textContent=name+' · '+label+' · '+user.email;
    $('#team-logos-tool').hidden=!global;
    $('#team-logos-restricted').hidden=global;
    view('staff-panel');
    void loadPhotoFlagSummary();
    if(global)loadFlagSummary();
    else $('#team-flags-alert').hidden=true;
  }catch(error){
    setError('Moderator access could not be checked. '+(error?.message||'Please try again.'));
  }finally{checking=false;}
}
async function signOut(){
  if(!client)return;
  const {error}=await client.auth.signOut();
  if(error)setError('Could not sign out: '+error.message);
  else{try{localStorage.removeItem(loginMarker)}catch{}view('login-panel');}
}
$('#signout-button').addEventListener('click',signOut);
$('#denied-signout').addEventListener('click',signOut);
// Password sign-in stays on this page and establishes the same Supabase
// session used by On the Range and the Team Logo moderation tools.
let signingIn=false;
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!client||signingIn)return;
  const email=$('#staff-email').value.trim();
  const password=$('#staff-password').value;
  const button=$('#login-button'),feedback=$('#login-status');
  feedback.className='login-status';
  if(!email||!password){
    feedback.textContent='Enter your authorized email address and account password.';
    feedback.classList.add('error');
    return;
  }
  signingIn=true;
  button.disabled=true;
  button.textContent='Signing in…';
  feedback.textContent='Verifying your existing account…';
  try{
    const {data,error}=await client.auth.signInWithPassword({email,password});
    if(error||!data?.session?.access_token)throw error||new Error('Session not established.');
    $('#staff-password').value='';
    try{localStorage.removeItem(loginMarker)}catch{}
    feedback.textContent='Signed in. Checking staff permissions…';
    await checkStaff();
  }catch(error){
    feedback.className='login-status error';
    feedback.textContent='Unable to sign in. Check your email and password. If this account uses email links, open the alternative below.';
  }finally{
    signingIn=false;
    button.disabled=false;
    button.textContent='Sign in to Moderator Hub';
  }
});
// The session may have been established on another tab of this origin.
$('#retry-session').addEventListener('click',async()=>{
  if(!client||signingIn)return;
  const feedback=$('#login-status');
  feedback.className='login-status';
  feedback.textContent='Checking your current On the Range session…';
  await checkStaff();
  if(!$('#login-panel').hidden){
    feedback.className='login-status error';
    feedback.textContent='No active moderator session was found on this website. Sign in above.';
  }
});
// Maintain the original email-link method only as a secondary recovery
// option for staff members who have never established a password.
$('#email-link-button').addEventListener('click',async()=>{
  if(!client||signingIn)return;
  const email=$('#staff-email').value.trim();
  const button=$('#email-link-button'),feedback=$('#email-link-status');
  if(!email){
    feedback.className='login-status error';
    feedback.textContent='Enter your staff email above before requesting an email link.';
    return;
  }
  signingIn=true;
  button.disabled=true;
  button.textContent='Sending…';
  feedback.className='login-status';
  feedback.textContent='';
  try{
    const {error}=await client.auth.signInWithOtp({
      email,options:{shouldCreateUser:false,emailRedirectTo:window.location.origin+'/'}
    });
    if(error)throw error;
    try{localStorage.setItem(loginMarker,String(Date.now()))}catch{}
    feedback.textContent='A secure sign-in link has been emailed. Open it in this browser to finish signing in.';
  }catch(error){
    feedback.className='login-status error';
    feedback.textContent='Could not send a sign-in link. '+(error?.message||'Please try again.');
  }finally{
    signingIn=false;
    button.disabled=false;
    button.textContent='Send secure email link';
  }
});
if(!client)setError('Staff sign-in is unavailable because the project configuration is missing.');
else {
  client.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(checkStaff,0);
  });
  checkStaff();
  // Refresh the private queue badge while a moderator keeps the Hub open.
  window.setInterval(()=>{if(!document.hidden&&!$('#staff-panel').hidden)void loadPhotoFlagSummary();},60000);
}
