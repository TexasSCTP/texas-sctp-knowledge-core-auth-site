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
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!client)return;
  const email=$('#staff-email').value.trim();
  const button=$('#login-button'),feedback=$('#login-status');
  if(!email)return;
  button.disabled=true;
  feedback.className='login-status';
  button.textContent='Sending sign-in email…';
  feedback.textContent='';
  try{
    // The existing On the Range root is already configured as an auth redirect.
    // A short-lived local marker returns staff to this hub after that callback.
    const {error}=await client.auth.signInWithOtp({
      email, options:{shouldCreateUser:false,emailRedirectTo:window.location.origin+'/'}
    });
    if(error)throw error;
    try{localStorage.setItem(loginMarker,String(Date.now()));}catch{}
    feedback.textContent='Sign-in email requested. Use its secure link, then you will return to the hub after On the Range verifies your session.';
  }catch(error){
    feedback.className='login-status error';
    feedback.textContent='Could not request sign-in: '+(error.message||'Please try again.');
  }finally{
    button.disabled=false;
    button.textContent='Send secure sign-in link';
  }
});
if(!client)setError('Staff sign-in is unavailable because the project configuration is missing.');
else {
  client.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_IN'||event==='SIGNED_OUT')setTimeout(checkStaff,0);
  });
  checkStaff();
}
