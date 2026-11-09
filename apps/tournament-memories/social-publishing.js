window.TEXAS_SCTP_SOCIAL_ADMIN=(function texasSctpSocialAdmin(){
  'use strict';
  let context=null;
  const local={posts:[],photos:[],outbox:[],channels:[],authorizations:new Map(),images:new Map(),drafts:new Map(),busy:false,loaded:false,error:'',loading:false};
  const $=(s)=>document.querySelector(s);
  const h=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const platformName=(p)=>p==='facebook'?'Facebook':'Instagram';
  const cap=(x,n=900)=>String(x||'').slice(0,n).trim();
  const photosFor=(id)=>local.photos.filter(x=>x.post_id===id).sort((a,b)=>a.position-b.position);
  const draftFor=(p)=>{
    if(!local.drafts.has(p.id)){
      local.drafts.set(p.id,{photoId:photosFor(p.id)[0]?.id||'',facebook:true,instagram:false,caption:cap(p.caption),verified:false});
    }
    return local.drafts.get(p.id);
  };
  const teamName=(p)=>context?.team(p.team_id)?.name||'Texas SCTP team';
  const eventName=(p)=>context?.tournament(p.tournament_id)?.title||p.other_tournament||'Texas SCTP tournament';
  function captionPreview(p,d){
    return ['TEXAS SCTP | ON THE RANGE',
      teamName(p)+' in action at '+eventName(p)+'.',
      cap(d.caption),
      'Catch more of the action: https://texas-sctp-tournament-memories-preview.onrender.com/#memory-'+p.id,
      '#TexasSCTP #OnTheRange'
    ].filter(Boolean).join('\n\n');
  }
  function attach(settings){context=settings;}
  async function load(){
    if(!context?.state?.client||!context.state.moderator)return;
    local.loading=true;local.error='';context.redraw();
    const db=context.state.client;
    try{
      const [posts,history,channels,consents]=await Promise.all([
        db.from('memory_posts').select('id,team_id,tournament_id,other_tournament,photo_date,caption,photo_credit,status,gallery_consent,social_consent,social_reviewed,caption_social_approved,privacy_hold,created_at,social_reviewed_at').eq('status','approved').order('created_at',{ascending:false}).limit(150),
        db.from('memory_social_outbox').select('id,post_id,photo_id,platform,publication_key,status,created_at,scheduled_at,accepted_at,published_at,external_post_id,last_error,removal_required,approved_caption,approved_at').order('created_at',{ascending:false}).limit(150),
        db.from('memory_social_channels').select('platform,enabled,max_per_seven_days').order('platform'),
        db.rpc('memory_staff_list_photo_authorizations')
      ]);
      if(posts.error||history.error||channels.error||consents.error)throw Error(posts.error?.message||history.error?.message||channels.error?.message||consents.error?.message||'Could not load social review.');
      const list=posts.data||[],ids=list.map(p=>p.id);
      let photos=[];
      if(ids.length){
        const result=await db.from('memory_photos').select('id,post_id,storage_path,position').in('post_id',ids).order('position');
        if(result.error)throw Error(result.error.message);
        photos=result.data||[];
      }
      await Promise.all(photos.map(async photo=>{
        if(local.images.has(photo.storage_path))return;
        const {data,error}=await db.storage.from(context.bucket).createSignedUrl(photo.storage_path,60*60);
        if(!error&&data?.signedUrl)local.images.set(photo.storage_path,data.signedUrl);
      }));
      local.posts=list;local.photos=photos;local.outbox=history.data||[];local.channels=channels.data||[];
      local.authorizations=new Map((Array.isArray(consents.data)?consents.data:[]).map(c=>[c.post_id,c]));
      local.loaded=true;
    }catch(e){local.error=e?.message||'Could not load social publishing.';}
    finally{local.loading=false;context.redraw();}
  }
  function channelStatus(platform){
    const row=local.channels.find(x=>x.platform===platform);
    return row?.enabled?'Enabled':'Paused';
  }
  function photoOption(p,photo,index,d){
    const url=local.images.get(photo.storage_path);
    const current=photo.id===d.photoId;
    return `<label class="social-photo-option ${current?'chosen':''}"><input type="radio" name="social-photo-${h(p.id)}" data-social-photo="${h(p.id)}" value="${h(photo.id)}" ${current?'checked':''} aria-label="Choose photo ${index+1} for ${h(teamName(p))}"><span class="social-photo-window">${url?`<img src="${h(url)}" alt="${h(teamName(p))}, photo ${index+1}" loading="lazy">`:'<span class="social-placeholder">Image preview unavailable</span>'}</span><span class="social-photo-legend">${current?'✓ ':''}Photo ${index+1}</span></label>`;
  }
  function authFor(p){return local.authorizations.get(p.id)||null;}
  function roleLabel(role){return ({parent_guardian:'Parent or legal guardian',coach_team:'Coach or team representative',photographer:'Photographer or rights owner',other:'Other authorized adult'})[role]||'Authorized adult';}
  function consentLabel(p){
    if(p.privacy_hold)return '<span class="social-pill danger">Privacy hold</span>';
    if(!p.social_consent)return '<span class="social-pill warn">No social consent</span>';
    if(!authFor(p))return '<span class="social-pill warn">Named release required</span>';
    if(!authFor(p).social_granted)return '<span class="social-pill warn">Gallery permission only</span>';
    return '<span class="social-pill yes">Social consent recorded</span>';
  }
  function postCard(p){
    const d=draftFor(p),imgs=photosFor(p.id),auth=authFor(p),eligible=!!(p.social_consent&&auth?.social_granted&&auth?.confirmed_adult&&!p.privacy_hold&&p.gallery_consent);
    const already=local.outbox.filter(x=>x.post_id===p.id);
    const tags=already.map(x=>`<span class="social-pill neutral">${h(platformName(x.platform))} · ${h(x.status)}</span>`).join('');
    const allPlatforms=(d.facebook?1:0)+(d.instagram?1:0);
    const duplicate=already.some(x=>x.photo_id===d.photoId&&((x.platform==='facebook'&&d.facebook)||(x.platform==='instagram'&&d.instagram)));
    return `<article class="social-review-card">
      <div class="social-card-heading"><div><div class="social-overline">TEAM MEMORY · ${h(context.dateFmt(p.photo_date))}</div><h4>${h(teamName(p))}</h4><p>${h(eventName(p))}</p></div><div class="social-pill-stack">${consentLabel(p)}${tags}</div></div>
      ${eligible?`<div class="social-authorization-proof"><strong>Permission recorded:</strong> ${h(auth.authorizer_name)} · ${h(roleLabel(auth.authorizer_role))} · <a href="mailto:${h(auth.authorizer_email)}">${h(auth.authorizer_email)}</a> · ${h(context.dateFmt(auth.accepted_at))}<small>Submission authorization ${h(auth.disclosure_version)}. Check any separate releases required for recognizable minors before queueing.</small></div><div class="social-review-body">
        <div class="social-photo-select"><strong class="social-section-label"><span>01</span> Choose the photo</strong><p>Select the exact image to publish.</p><div class="social-photo-options">${imgs.map((photo,i)=>photoOption(p,photo,i,d)).join('')||'<p class="social-info">No verified photographs attached.</p>'}</div></div>
        <div class="social-edit-column"><strong class="social-section-label"><span>02</span> Select channels</strong>
          <div class="social-channel-choices"><label><input type="checkbox" data-social-platform="facebook" data-social-post="${h(p.id)}" ${d.facebook?'checked':''}><span class="social-channel-symbol">f</span><span>Facebook<small>${h(channelStatus('facebook'))}</small></span></label>
          <label><input type="checkbox" data-social-platform="instagram" data-social-post="${h(p.id)}" ${d.instagram?'checked':''}><span class="social-channel-symbol">◎</span><span>Instagram<small>${h(channelStatus('instagram'))}</small></span></label></div>
          <label class="social-section-label social-label-block" for="social-caption-${h(p.id)}"><span>03</span> Review or edit caption</label>
          <textarea id="social-caption-${h(p.id)}" class="social-caption-editor" maxlength="900" rows="4" data-social-caption="${h(p.id)}" placeholder="Write the approved social caption...">${h(d.caption)}</textarea>
          <div class="social-character-counter"><span>Approved caption is saved separately from the gallery caption.</span><span data-social-count="${h(p.id)}">${d.caption.length}/900</span></div>
          <details class="social-preview-details"><summary>Preview full post caption</summary><pre data-social-preview="${h(p.id)}">${h(captionPreview(p,d))}</pre></details>
          <label class="social-review-confirm"><input type="checkbox" data-social-verified="${h(p.id)}" ${d.verified?'checked':''}><span>I reviewed the selected photo and final caption, verified social-sharing permission, and checked any required permissions for minors.</span></label>
          <div class="social-card-actions"><button class="btn btn-primary" data-action="queue-social" data-id="${h(p.id)}" ${(local.busy||!d.verified||!d.photoId||!allPlatforms||!imgs.length)?'disabled':''}>${local.busy?'Saving...':'Approve & Queue'} →</button><small>${duplicate?'Existing queue entries will not be duplicated. ':' '}Queueing does not immediately publish while channels are paused.</small></div>
        </div>
      </div>`:`<div class="social-locked-message"><strong>Gallery approved, social publishing unavailable.</strong><p>${p.privacy_hold?'This submission is under a privacy hold.': !p.social_consent?'This submission has gallery permission only. Social-media permission was not granted.':!auth?'This earlier upload has no named adult authorization under the current release. Request a new consented submission before social posting.':'This submission has not granted social-media publication authorization.'}</p></div>`}
    </article>`;
  }
  function history(){
    const list=local.outbox;
    return `<section class="social-history"><div class="social-history-title"><div><div class="social-overline">AUDIT TRAIL</div><h4>Publishing history</h4><p>Review queued, published, failed, or canceled photos. Posts already sent to Meta require removal on the platform.</p></div><span class="social-total">${list.length} RECORDS</span></div>
      ${list.length?`<div class="social-history-table-wrap"><table class="social-history-table"><thead><tr><th>Team / image</th><th>Channel</th><th>Status</th><th>Approved</th><th>Actions</th></tr></thead><tbody>
      ${list.map(item=>{const p=local.posts.find(x=>x.id===item.post_id),ph=local.photos.find(x=>x.id===item.photo_id);const photoIndex=p?photosFor(p.id).findIndex(x=>x.id===item.photo_id)+1:0;const canCancel=['ready','held','failed'].includes(item.status);
      const fbLink=item.platform==='facebook'&&/^[a-zA-Z0-9_]+$/.test(item.external_post_id||'')?`<a href="https://www.facebook.com/${h(item.external_post_id)}" target="_blank" rel="noopener noreferrer">View post ↗</a>`:'';
      return `<tr><td><strong>${h(p?teamName(p):'Tournament memory')}</strong><small>${h(photoIndex?'Photo '+photoIndex: 'Photo')} · ${h(p?eventName(p):'Selected tournament')}</small></td><td>${h(platformName(item.platform))}</td><td><span class="social-pill ${item.status==='published'?'yes':item.status==='failed'?'danger':'neutral'}">${h(item.status)}</span>${item.removal_required?'<small class="social-alert">Removal review needed</small>':''}${item.last_error?`<small>${h(item.last_error)}</small>`:''}</td><td>${h(context.dateFmt(item.approved_at||item.created_at))}</td><td>${canCancel?`<button class="social-cancel" data-action="cancel-social" data-id="${h(item.id)}">Cancel queue</button>`:fbLink||'<span class="social-history-dash">—</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`:'<div class="social-empty-history">No social-media publications have been queued yet. Approved submissions will appear here after staff review.</div>'}</section>`;
  }
  function render(){
    if(!context)return '';
    const eligible=local.posts.filter(p=>p.social_consent&&!p.privacy_hold&&p.gallery_consent);
    const count=local.outbox.filter(x=>['ready','held','accepted','dispatching'].includes(x.status)).length;
    const done=local.outbox.filter(x=>x.status==='published').length;
    return `<div class="social-admin-shell">
      <section class="social-intro"><div class="social-intro-copy"><div class="social-overline">TEXAS SCTP · ON THE RANGE</div><h3>Make the moment <em>matter.</em></h3><p>Choose the exact photo, review the caption, and decide where it appears. Nothing reaches Facebook or Instagram without explicit permission and a staff review.</p></div>
        <div class="social-mini-stats"><div><strong>${eligible.length}</strong><small>With consent</small></div><div><strong>${count}</strong><small>In queue</small></div><div><strong>${done}</strong><small>Published</small></div></div></section>
      <div class="social-channel-banner"><span class="social-bulb">●</span><span><b>Publishing controls</b> · Facebook: ${h(channelStatus('facebook'))} · Instagram: ${h(channelStatus('instagram'))}</span><span class="social-banner-note">Queueing is available while publishing is paused.</span></div>
      ${local.error?`<div class="social-error" role="alert">${h(local.error)} <button data-action="refresh-social">Retry</button></div>`:''}
      ${local.loading?'<p class="social-loading">Loading reviewed photos and publishing history…</p>':!local.loaded?' <p class="social-loading">Select Refresh to load publishing candidates.</p>':`<div class="social-workflow-head"><div><div class="social-overline">CONTENT APPROVAL</div><h3>Review team memories</h3><p>Approved gallery submissions, newest first.</p></div><span class="social-total">${local.posts.length} SUBMISSIONS</span></div>
      <div class="social-review-list">${local.posts.map(postCard).join('')||'<div class="social-locked-message">No approved gallery photos are available yet.</div>'}</div>
      ${history()}`}
    </div>`;
  }
  function onChange(e){
    const element=e.target,postId=element.dataset.socialPhoto||element.dataset.socialPost||element.dataset.socialVerified;
    if(!postId)return false;
    const p=local.posts.find(x=>x.id===postId);if(!p)return false;
    const d=draftFor(p);
    if(element.dataset.socialPhoto)d.photoId=element.value;
    if(element.dataset.socialPlatform)d[element.dataset.socialPlatform]=element.checked;
    if(element.dataset.socialVerified)d.verified=element.checked;
    context.redraw();
    return true;
  }
  function onInput(e){
    const postId=e.target.dataset.socialCaption;
    if(!postId)return false;
    const p=local.posts.find(x=>x.id===postId);if(!p)return false;
    const d=draftFor(p);d.caption=e.target.value;
    const preview=$('[data-social-preview="'+postId+'"]'),counter=$('[data-social-count="'+postId+'"]');
    if(preview)preview.textContent=captionPreview(p,d);
    if(counter)counter.textContent=d.caption.length+'/900';
    return true;
  }
  async function onAction(action,id){
    if(action==='refresh-social'){await load();return;}
    if(local.busy||!context?.state?.moderator)return;
    if(action==='queue-social'){
      const p=local.posts.find(x=>x.id===id);if(!p)return;
      const d=draftFor(p);
      if(!d.verified||!p.social_consent||!authFor(p)?.social_granted||p.privacy_hold||!d.photoId){context.toast('Complete the photo review and permission confirmation.',true);return;}
      const targets=['facebook','instagram'].filter(x=>d[x]);
      if(!targets.length){context.toast('Choose a publishing channel.',true);return;}
      local.busy=true;context.redraw();
      try{
        const {data,error}=await context.state.client.rpc('memory_staff_queue_social',{p_post_id:p.id,p_photo_id:d.photoId,p_platforms:targets,p_caption:d.caption.trim()});
        if(error)throw Error(error.message);
        context.toast(data?.queued?`${data.queued} publishing item(s) queued. Channels remain paused.`:'This photo and channel are already in the queue.');
        d.verified=false;await load();
      }catch(e){context.toast('Could not queue this photo: '+e.message,true);}
      finally{local.busy=false;context.redraw();}
      return;
    }
    if(action==='cancel-social'){
      const queueId=Number(id);if(!Number.isSafeInteger(queueId)||queueId<1)return;
      local.busy=true;context.redraw();
      try{
        const {error}=await context.state.client.rpc('memory_staff_cancel_social',{p_outbox_id:queueId});
        if(error)throw Error(error.message);
        context.toast('Publishing item canceled before dispatch.');await load();
      }catch(e){context.toast('Cannot cancel: '+e.message,true);}
      finally{local.busy=false;context.redraw();}
    }
  }
  return{attach,load,render,onChange,onInput,onAction};
})();
