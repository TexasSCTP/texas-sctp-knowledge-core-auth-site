import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
import { createProfileEditor } from './profiles.js';

const settings = window.TEXAS_SCTP_CONFIG || {};
const apiRoot = settings.supabaseUrl;
const apiKey = settings.supabasePublishableKey;
const endpoint = apiRoot ? apiRoot + '/functions/v1/team-logo-portal' : '';
const $ = selector => document.querySelector(selector);
const state = { client: null, teams: [], ranges: [], staff: null, loading: false, busyIds: new Set(), initialized: false };
$('#current-year').textContent = String(new Date().getFullYear());

function status(message, tone = '', element = $('#page-status')) {
  if (!element) return;
  element.textContent = message;
  element.className = (element === $('#page-status') ? 'page-status' : 'login-status') + (tone ? ' ' + tone : '');
}
function visibleToVisitors(team) { return team.active && team.portalVisible; }
function showLogin() {
  state.staff = null;
  $('#login-panel').hidden = false;
  $('#moderation-panel').hidden = true;
}
function showModeration() {
  $('#login-panel').hidden = true;
  $('#moderation-panel').hidden = false;
  $('#staff-name').textContent = (state.staff?.displayName || 'Texas SCTP staff') +
    ' · ' + (state.staff?.role || 'moderator');
}
async function request(action, values = {}) {
  if (!state.client || !endpoint) throw Error('Team Logo Portal is not configured.');
  const { data: { session }, error: sessionError } = await state.client.auth.getSession();
  if (sessionError || !session?.access_token) throw Error('Please sign in again.');
  const response = await fetch(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      'apikey': apiKey,
      'authorization': 'Bearer ' + session.access_token
    },
    body: JSON.stringify({ action, ...values })
  });
  let payload = null;
  try { payload = await response.json(); }
  catch { throw Error('The server sent an unreadable response.'); }
  if (!response.ok || !payload || payload.error) {
    const e = Error(payload?.error || 'Request was not accepted. Please try again.');
    e.status = response.status;
    throw e;
  }
  return payload;
}
function tag(text, kind) {
  const el = document.createElement('span');
  el.className = 'state-pill' + (kind ? ' ' + kind : '');
  el.textContent = text;
  return el;
}
function createRow(team) {
  const row = document.createElement('article');
  row.className = 'team-row' + (visibleToVisitors(team) ? '' : ' is-hidden');
  row.dataset.teamId = team.id;

  const info = document.createElement('div');
  info.className = 'team-info';
  const name = document.createElement('strong');
  name.textContent = team.name;
  const metadata = document.createElement('div');
  metadata.className = 'team-meta';
  const league = document.createElement('span');
  league.textContent = team.league || 'Unassigned';
  metadata.append(league);
  if (team.shotTeamId) {
    const shot = document.createElement('span');
    shot.textContent = 'SHOT ID: ' + team.shotTeamId;
    metadata.append(shot);
  }
  const badges = document.createElement('div');
  badges.className = 'team-state';
  badges.append(visibleToVisitors(team) ? tag('Shown in public directory') : tag('Hidden from public directory', 'muted'));
  if (!team.active) badges.append(tag('Inactive in team roster', 'warning'));
  badges.append(tag(team.hasLogo ? 'Logo on file' : 'Logo needed', team.hasLogo ? 'muted' : 'warning'));
  const p = team.profile;
  const verified = p?.profile_status === 'approved';
  badges.append(verified
    ? tag(p.team_kind === 'school' ? 'School team verified' : 'Club team verified')
    : tag('Listing needs verification','warning'));
  const edit = document.createElement('button');
  edit.type='button';
  edit.className='edit-listing-button';
  edit.textContent=verified ? 'Edit verified listing' : 'Review team listing';
  edit.addEventListener('click',()=>profileEditor.open(team.id));
  info.append(name, metadata, badges, edit);

  const control = document.createElement('div');
  control.className = 'visibility-control';
  const right = document.createElement('div');
  right.className = 'visibility';
  const text = document.createElement('span');
  text.className = 'visibility-label';
  text.textContent = !team.active && team.portalVisible ? 'Allowed if active' : (team.portalVisible ? 'Shown' : 'Hidden');
  const switchLabel = document.createElement('label');
  switchLabel.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = team.portalVisible;
  input.disabled = state.busyIds.has(team.id);
  input.setAttribute('aria-label', 'Show ' + team.name + ' in Team Logo Portal when active');
  input.dataset.teamId = team.id;
  const track = document.createElement('span');
  track.className = 'switch-track';
  track.setAttribute('aria-hidden','true');
  switchLabel.append(input, track);
  right.append(text, switchLabel);

  const feedback = document.createElement('div');
  feedback.className = 'save-feedback';
  feedback.setAttribute('role','status');
  feedback.setAttribute('aria-live','polite');
  feedback.textContent = state.busyIds.has(team.id) ? 'Saving…' : ' ';
  control.append(right,feedback);
  row.append(info,control);
  input.addEventListener('change', () => saveVisibility(team, input.checked, input, feedback));
  return row;
}
function matches(team) {
  const filter = $('#team-filter').value;
  if (filter === 'visible' && !visibleToVisitors(team)) return false;
  if (filter === 'hidden' && visibleToVisitors(team)) return false;
  if (filter === 'inactive' && team.active) return false;
  if (filter === 'no-logo' && team.hasLogo) return false;
  if (filter === 'needs-review' && team.profile?.profile_status === 'approved') return false;
  if (filter === 'school' && team.profile?.team_kind !== 'school') return false;
  if (filter === 'club' && team.profile?.team_kind !== 'club') return false;
  const q = $('#team-query').value.trim().toLowerCase();
  return !q || team.name.toLowerCase().includes(q) || team.shotTeamId.toLowerCase().includes(q);
}
function render() {
  const all = state.teams;
  $('#stat-total').textContent = String(all.length);
  $('#stat-visible').textContent = String(all.filter(visibleToVisitors).length);
  $('#stat-hidden').textContent = String(all.filter(t => !visibleToVisitors(t)).length);
  $('#stat-inactive').textContent = String(all.filter(t => !t.active).length);
  $('#stat-needs-review').textContent = String(all.filter(t => t.profile?.profile_status !== 'approved').length);
  const filtered = all.filter(matches);
  $('#result-count').textContent = filtered.length + ' of ' + all.length + ' teams';
  const fragment = document.createDocumentFragment();
  filtered.forEach(t => fragment.append(createRow(t)));
  $('#team-rows').replaceChildren(fragment);
  $('#empty-results').hidden = filtered.length > 0;
}
async function loadTeams() {
  if (state.loading) return;
  state.loading = true;
  $('#refresh-button').disabled = true;
  status('Checking current directory settings…');
  try {
    const response = await request('staff_list');
    if (!Array.isArray(response.teams) || !response.staff) throw Error('Staff directory response was incomplete.');
    state.staff = response.staff;
    state.teams = response.teams.map(t => ({
      id: String(t.id),name:String(t.name),league:String(t.league||'Assignment Pending'),
      shotTeamId:String(t.shotTeamId||''),active:t.active===true,
      portalVisible:t.portalVisible===true,hasLogo:t.hasLogo===true,
      profile:t.profile||null
    }));
    state.ranges=Array.isArray(response.ranges)?response.ranges.map(v=>({
      id:String(v.id),name:String(v.name),city:String(v.city),state:String(v.state),
      active:v.active===true,source_system:String(v.source_system||'')
    })):[];
    showModeration();
    render();
    status('Current settings loaded.', 'success');
  } catch (error) {
    status(error.message, 'error');
    if (error.status === 401 || !state.staff) showLogin();
  } finally {
    state.loading = false;
    $('#refresh-button').disabled = false;
  }
}
async function saveVisibility(team, next, input, feedback) {
  if (state.busyIds.has(team.id)) { input.checked = team.portalVisible; return; }
  const previous = team.portalVisible;
  state.busyIds.add(team.id);
  input.disabled = true;
  feedback.className = 'save-feedback';
  feedback.textContent = 'Saving…';
  try {
    const result = await request('staff_visibility', { teamId: team.id, visible: next });
    if (result.ok !== true || result.teamId !== team.id || result.portalVisible !== next)
      throw Error('The server did not confirm this change.');
    team.portalVisible = next;
    status(team.name + (visibleToVisitors(team) ? ' is now visible on the public portal.' : ' is hidden from the public portal.'), 'success');
    state.busyIds.delete(team.id);
    render();
    const replacement = [...document.querySelectorAll('#team-rows input[data-team-id]')]
      .find(x => x.dataset.teamId === team.id);
    if (replacement) {
      const note = replacement.closest('.visibility-control')?.querySelector('.save-feedback');
      if (note) { note.textContent = 'Saved'; note.className = 'save-feedback success'; }
      replacement.focus({preventScroll:true});
    }
  } catch (error) {
    input.checked = previous;
    feedback.textContent = 'Not saved: ' + error.message;
    feedback.className = 'save-feedback error';
    status('Could not update ' + team.name + ': ' + error.message, 'error');
  } finally {
    state.busyIds.delete(team.id);
    input.disabled = false;
  }
}
const profileEditor=createProfileEditor({
  getTeams:()=>state.teams,
  getRanges:()=>state.ranges,
  request,
  onSaved:async ({teamName,profileStatus})=>{
    await loadTeams();
    status('✓ '+teamName+(profileStatus==='approved'?' verified and published to the directory.':' saved as a staff-only draft.'),'success');
  }
});
$('#team-query').addEventListener('input', render);
$('#team-filter').addEventListener('change', render);
$('#refresh-button').addEventListener('click', loadTeams);
$('#logout-button').addEventListener('click', async () => {
  if (!state.client) return;
  const {error} = await state.client.auth.signOut();
  if (error) status('Sign-out failed: ' + error.message, 'error');
  else {
    state.teams = [];
    showLogin();
    status('Signed out.', 'success');
  }
});
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.client) return;
  const email = $('#login-email').value.trim();
  if (!email) return;
  const button = $('#login-submit');
  button.disabled = true;
  button.textContent = 'Sending sign-in link…';
  status('Requesting secure sign-in link…', '', $('#login-status'));
  try {
    const redirect = new URL('./', window.location.href).href.split('?')[0].split('#')[0];
    const {error} = await state.client.auth.signInWithOtp({
      email,
      options: {shouldCreateUser:false,emailRedirectTo:redirect}
    });
    if (error) throw error;
    status('Check your email for the secure sign-in link. Open it to return to this staff page.', 'success', $('#login-status'));
  } catch(error) {
    status('Could not send link: ' + error.message, 'error', $('#login-status'));
  } finally {
    button.disabled = false;
    button.textContent = 'Email me a secure sign-in link';
  }
});
async function init() {
  if (!apiRoot || !apiKey) { status('Portal configuration is missing. Contact Texas SCTP.', 'error'); return; }
  try {
    state.client = createClient(apiRoot,apiKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,
        storageKey:'txsctp-team-logo-portal-staff'}
    });
    state.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') setTimeout(loadTeams,0);
      if (event === 'SIGNED_OUT') {state.staff=null;state.teams=[];showLogin();}
    });
    const {data:{session},error} = await state.client.auth.getSession();
    if (error) throw error;
    if(session) await loadTeams();
    else {showLogin(); status('Sign in using an authorized staff email to manage this directory.');}
  } catch (error) {
    showLogin();status('Unable to initialize staff login: ' + error.message,'error');
  }
}
init();