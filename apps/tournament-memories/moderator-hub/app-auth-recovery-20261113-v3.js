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
// Recovery links are verified by Supabase Auth; a URL flag alone never
// authorizes an account change without a valid authenticated session.
let passwordRecoveryMode =
  new URLSearchParams(window.location.search).get('recover') === '1' ||
  new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
let updatingPassword=false;
$('#year').textContent = String(new Date().getFullYear());

function view(which) {
  for(const id of ['loading-state','staff-panel','access-denied','login-panel','password-reset-panel'])
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
    if(passwordRecoveryMode){
      const {data:{user},error:recoveryError}=await client.auth.getUser();
      if(recoveryError||!user){
        view('login-panel');
        const message=$('#login-status');
        message.className='login-status error';
        message.textContent='This password reset link is expired or could not be verified. Request a new reset email below.';
        return;
      }
      view('password-reset-panel');
      return;
    }
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
  passwordRecoveryMode=false;
  const {error}=await client.auth.signOut();
  if(error)setError('Could not sign out: '+error.message);
  else{try{localStorage.removeItem(loginMarker)}catch{}view('login-panel');}
}
$('#signout-button').addEventListener('click',signOut);
$('#denied-signout').addEventListener('click',signOut);
// Password sign-in stays on this page and establishes the same Supabase
// session used by On the Range and the Team Logo moderation tools.
let signingIn=false;
$('#password-login-form').addEventListener('submit',async event=>{
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

// Forgot password requires verification of the authorized account's email.
// Do not send any email until the user actively selects this control.
$('#forgot-password').addEventListener('click',async()=>{
  if(!client||signingIn)return;
  const email=$('#staff-email').value.trim();
  const feedback=$('#forgot-password-status'),button=$('#forgot-password');
  feedback.className='login-status';
  if(!email||!$('#staff-email').checkValidity()){
    feedback.className='login-status error';
    feedback.textContent='Enter your staff email address above first.';
    return;
  }
  signingIn=true;
  button.disabled=true;
  feedback.textContent='Requesting a password reset email…';
  try{
    const {error}=await client.auth.resetPasswordForEmail(email,{
      redirectTo:window.location.origin+'/moderator-hub/?recover=1'
    });
    if(error)throw error;
    // Do not confirm whether the email is registered.
    feedback.textContent='If that email belongs to an account, a password reset link will arrive shortly. Open it to set your new password on this site.';
  }catch(error){
    feedback.className='login-status error';
    const isLimited=Number(error?.status)===429||
       /rate.?limit|too many|temporarily unavailable/i.test(String(error?.message||''));
    feedback.textContent=isLimited
      ?'Reset emails are temporarily rate-limited. Please try again later, or use an active On the Range session.'
      :'Password reset could not be requested. Please try again later.';
  }finally{
    signingIn=false;
    button.disabled=false;
  }
});

// The reset form can be submitted only after Supabase has verified the recovery
// link and established a valid user session. No passwords are logged or saved.
$('#password-reset-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!client||updatingPassword||!passwordRecoveryMode)return;
  const newPassword=$('#reset-password').value;
  const confirmation=$('#reset-confirm-password').value;
  const button=$('#save-new-password'),feedback=$('#reset-password-status');
  feedback.className='login-status';
  if(newPassword.length<12){
    feedback.className='login-status error';
    feedback.textContent='Choose a password of at least 12 characters.';
    return;
  }
  if(newPassword!==confirmation){
    feedback.className='login-status error';
    feedback.textContent='The two passwords do not match.';
    return;
  }
  updatingPassword=true;
  button.disabled=true;
  button.textContent='Saving password…';
  feedback.textContent='Verifying your recovery session…';
  try{
    const {data:{user},error:userError}=await client.auth.getUser();
    if(userError||!user)throw new Error('Recovery session expired. Please request a new link.');
    const {error}=await client.auth.updateUser({password:newPassword});
    if(error)throw error;
    $('#reset-password').value='';
    $('#reset-confirm-password').value='';
    passwordRecoveryMode=false;
    window.history.replaceState(null,'',window.location.pathname);
    feedback.textContent='Password updated. Opening your moderator tools…';
    // Recovery establishes a Supabase session, so no second sign-in is needed.
    await checkStaff();
  }catch(error){
    feedback.className='login-status error';
    feedback.textContent=String(error?.message||'').includes('session')
      ?'Recovery session expired. Request a new password reset link.'
      :'Unable to update your password. Check the password requirements and try again.';
  }finally{
    updatingPassword=false;
    button.disabled=false;
    button.textContent='Save new password';
  }
});

if(!client)setError('Staff sign-in is unavailable because the project configuration is missing.');
else {
  // Unlock form only when the correct password-auth module initialized.
  $('#login-button').disabled=false;
  $('#save-new-password').disabled=false;
  client.auth.onAuthStateChange(event=>{
    if(event==='PASSWORD_RECOVERY'){
      passwordRecoveryMode=true;
      // URL may already have been cleaned by the Supabase client.
      // Preserve only a non-secret route marker.
      window.history.replaceState(null,'',window.location.pathname+'?recover=1');
      setTimeout(checkStaff,0);
    }else if(event==='SIGNED_IN'||event==='SIGNED_OUT'){
      setTimeout(checkStaff,0);
    }
  });
  checkStaff();
  // Refresh the private queue badge while a moderator keeps the Hub open.
  window.setInterval(()=>{if(!document.hidden&&!$('#staff-panel').hidden)void loadPhotoFlagSummary();},60000);
}
