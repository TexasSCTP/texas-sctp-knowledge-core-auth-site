/* Shared Moderator Hub: private visitor reports and staff-only decisions.
 * No public flag may alter team visibility without verified moderator approval.
 */
export function createFlagQueue({getTeams,request,onReviewSaved,onLoaded}) {
  const $ = id => document.getElementById(id);
  const state = {reports:[],loading:false,busy:new Set()};
  const reasonText = {
    inactive:'Reported as possibly inactive',
    incorrect_details:'Team information may need correction',
    other:'Other directory concern'
  };
  const statusText = {
    pending:'Needs review',
    dismissed:'Reviewed · no change',
    confirmed_inactive:'Confirmed inactive · hidden'
  };
  function textElement(tag, cls, value) {
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    el.textContent=String(value??'');
    return el;
  }
  function dateLabel(value) {
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function setStatus(message,error=false) {
    const el=$('reports-status');
    el.textContent=message||'';
    el.className='reports-status'+(error?' error':'');
  }
  function goToTeam(team) {
    if(!team)return;
    $('team-query').value=team.name;
    $('team-filter').value='all';
    $('team-query').dispatchEvent(new Event('input',{bubbles:true}));
    $('teams-heading')?.scrollIntoView({behavior:'smooth',block:'start'});
    $('team-query').focus({preventScroll:true});
  }
  function createCard(report) {
    const wrap=document.createElement('article');
    wrap.className='report-card'+(report.status!=='pending'?' report-resolved':'');
    const team=getTeams().find(t=>t.id===report.teamId);
    const header=document.createElement('div');
    header.className='report-card-header';
    const identity=document.createElement('div');
    identity.className='report-card-identity';
    const thumb=document.createElement('div');
    thumb.className='report-logo-thumb';
    if(team?.logoUrl) {
      const img=document.createElement('img');
      img.src=team.logoUrl;
      img.alt=report.teamName+' team logo on file';
      img.loading='lazy';
      img.onerror=()=>{thumb.replaceChildren(textElement('span','','No logo preview'));};
      thumb.append(img);
    } else thumb.append(textElement('span','',team?.hasLogo?'Logo preview unavailable':'No logo'));
    const nameBlock=document.createElement('div');
    nameBlock.className='report-name';
    nameBlock.append(textElement('h3','',report.teamName));
    nameBlock.append(textElement('small','',dateLabel(report.createdAt)));
    identity.append(thumb,nameBlock);
    const stateText=textElement('span','report-review-state'+(report.status==='pending'?' pending':''),statusText[report.status]||report.status);
    header.append(identity,stateText);
    wrap.append(header);
    const reason=textElement('p','report-reason',reasonText[report.reason]||'Directory review');
    wrap.append(reason);
    if(report.details) wrap.append(textElement('p','report-details',report.details));
    const metadata=document.createElement('div');
    metadata.className='report-meta';
    if(team)metadata.append(textElement('span','',team.portalVisible&&team.active?'Currently visible on public directory':'Currently hidden from public directory'));
    wrap.append(metadata);
    if(report.status!=='pending') {
      if(report.reviewNote)wrap.append(textElement('p','report-review-note','Staff note: '+report.reviewNote));
      if(report.reviewedAt)wrap.append(textElement('small','report-reviewed-at','Reviewed '+dateLabel(report.reviewedAt)));
      return wrap;
    }
    const input=document.createElement('textarea');
    input.className='report-moderator-note';
    input.rows=2;
    input.maxLength=500;
    input.placeholder='Moderator verification note (required to confirm inactivity)';
    input.setAttribute('aria-label','Verification notes for '+report.teamName);
    const controls=document.createElement('div');
    controls.className='report-controls';
    const viewButton=textElement('button','report-action secondary','View team listing');
    viewButton.type='button';
    viewButton.addEventListener('click',()=>goToTeam(team));
    const dismiss=textElement('button','report-action secondary','Dismiss · no change');
    dismiss.type='button';
    dismiss.addEventListener('click',()=>review(report,'dismissed',input,dismiss,hide));
    const hide=textElement('button','report-action danger','Confirm inactive & hide');
    hide.type='button';
    hide.addEventListener('click',()=>review(report,'confirmed_inactive',input,dismiss,hide));
    const feedback=textElement('p','report-feedback','');
    feedback.setAttribute('role','status');
    feedback.setAttribute('aria-live','polite');
    controls.append(viewButton,dismiss,hide);
    wrap.append(input,controls,feedback);
    return wrap;
  }
  async function review(report,decision,noteInput,dismissButton,hideButton) {
    if(state.busy.has(report.id))return;
    const reviewNote=noteInput.value.trim();
    const feedback=noteInput.parentElement.querySelector('.report-feedback');
    if(decision==='confirmed_inactive'){
      if(reviewNote.length<8) {
        feedback.textContent='Please record what you verified before confirming inactivity (at least 8 characters).';
        feedback.className='report-feedback error';
        noteInput.focus();
        return;
      }
      if(!window.confirm('Confirm that "'+report.teamName+'" is inactive? Its team listing AND LOGO will immediately disappear from the public Team Logo Portal. Existing records will be preserved.'))return;
    }
    state.busy.add(report.id);
    dismissButton.disabled=true;hideButton.disabled=true;noteInput.disabled=true;
    feedback.className='report-feedback';
    feedback.textContent='Recording your decision…';
    try {
      const saved=await request('staff_report_review',{
        reportId:report.id,decision,reviewNote
      });
      if(saved.ok!==true||saved.teamId!==report.teamId||saved.decision!==decision)
        throw Error('The moderator decision was not confirmed.');
      await onReviewSaved({teamName:report.teamName,decision});
    }catch(error){
      feedback.className='report-feedback error';
      feedback.textContent=error.message||'Could not save. Please refresh and retry.';
    }finally{
      state.busy.delete(report.id);
      dismissButton.disabled=false;hideButton.disabled=false;noteInput.disabled=false;
    }
  }
  function render() {
    const pending=state.reports.filter(r=>r.status==='pending');
    $('stat-flags').textContent=String(pending.length);
    $('report-count').textContent=pending.length+' pending';
    const filter=$('reports-filter').value;
    const selected=filter==='pending'?pending:filter==='resolved'?state.reports.filter(r=>r.status!=='pending'):state.reports;
    const el=$('reports-list');
    const frag=document.createDocumentFragment();
    selected.forEach(r=>frag.append(createCard(r)));
    el.replaceChildren(frag);
    $('reports-empty').hidden=selected.length>0;
    $('reports-empty').textContent=filter==='pending'?'No team reports currently awaiting review.':'No reports match this filter.';
  }
  async function load() {
    if(state.loading)return;
    state.loading=true;
    setStatus('Loading team reports…');
    try {
      const payload=await request('staff_reports');
      if(!Array.isArray(payload.reports))throw Error('Server did not return the reports queue.');
      state.reports=payload.reports.map(r=>({
        id:String(r.id),teamId:String(r.teamId),teamName:String(r.teamName||'Unnamed team'),
        reason:String(r.reason||'other'),details:String(r.details||''),
        status:String(r.status||'pending'),createdAt:r.createdAt,
        reviewedAt:r.reviewedAt,reviewNote:r.reviewNote||'',
        portalVisible:r.portalVisible===true,sourceActive:r.sourceActive===true
      }));
      render();
      onLoaded?.();
      setStatus('');
    }catch(error){
      $('stat-flags').textContent='—';
      $('report-count').textContent='Unable to load reports';
      setStatus('Could not load team flags. '+(error.message||'Please refresh.'),true);
    }finally{state.loading=false;}
  }
  $('reports-filter').addEventListener('change',render);
  $('refresh-reports').addEventListener('click',load);
  return {
    load,render,
    pendingForTeam:(teamId)=>state.reports.filter(r=>r.status==='pending'&&r.teamId===teamId).length
  };
}
