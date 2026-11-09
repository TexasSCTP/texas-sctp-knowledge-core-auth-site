/* Texas SCTP Tournament Memories / Slideshow Studio
   Only photo positioning data is editable. The publish operation requires a
   repo-restricted GitHub token held in memory for one request. No credentials
   are stored or embedded in this static site. */
(() => {
  'use strict';
  const DRAFT_KEY='txsctp-slide-editor-v1';
  const LIVE_DRAFT_KEY='txsctp-live-slide-crops-v1';
  const REPO='TexasSCTP/texas-sctp-knowledge-core-auth-site';
  const BRANCH='staging/tournament-memories-preview';
  const PATH='apps/tournament-memories/hero-config.json';
  const GH_URL=`https://api.github.com/repos/${REPO}/contents/${PATH}`;
  const SOURCE=/^\.\/public\/images\/scene-0[1-7]\.webp$/;
  const DEFAULTS={};
  const $=id=>document.getElementById(id);
  let config=null,published=null,selectedId='scene-07',mode='desktop',playing=false,timer=null,drag=null;
  let client=null,staffUser=null;const livePublished=new Map();
  const naturalSizes=new Map();
  const viewSpecs={desktop:{width:1680,height:430,name:'Desktop hero · exact widescreen ratio'},mobile:{width:390,height:548,name:'Phone hero · full mobile view'},card:{width:520,height:390,name:'Photo card · 4:3 crop'}};
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function minmax(v,lo,hi){return Math.min(hi,Math.max(lo,Number(v)||0));}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function getSlide(){return config?.slides?.find(s=>s.id===selectedId)||config?.slides?.[0];}
  function getView(){return getSlide()?.[mode];}
  function setStatus(message,tone='normal'){$('save-status').textContent=message;$('save-status').style.color=tone==='error'?'#ac4034':tone==='good'?'#527866':'#7b8792';}
  function normalizePosition(raw,fallback){return {x:minmax(raw?.x??fallback.x,0,100),y:minmax(raw?.y??fallback.y,0,100),zoom:minmax(raw?.zoom??fallback.zoom,1,1.45)};}
  function normalize(raw,defaults){
    const allowed=new Map(defaults.slides.map(s=>[s.id,s]));const seen=new Set();const slides=[];
    for(const value of Array.isArray(raw?.slides)?raw.slides:[]){const orig=allowed.get(value?.id);
      if(!orig||seen.has(orig.id)||value.src!==orig.src||!SOURCE.test(value.src))continue;
      seen.add(orig.id);
      slides.push({id:orig.id,src:orig.src,label:orig.label,enabled:value.enabled!==false,
        desktop:normalizePosition(value.desktop,orig.desktop),mobile:normalizePosition(value.mobile,orig.mobile),card:normalizePosition(value.card,orig.card)});
    }
    for(const v of defaults.slides)if(!seen.has(v.id))slides.push(clone(v));
    return {version:1,intervalSeconds:10,slides};
  }
  function sampleSettings(){return {version:1,intervalSeconds:config.intervalSeconds||10,slides:config.slides.filter(s=>!s.live).map(s=>({
    id:s.id,src:s.src,label:s.label,enabled:s.enabled,desktop:s.desktop,mobile:s.mobile,card:s.card
  }))};}
  function getLiveDrafts(){try{return JSON.parse(localStorage.getItem(LIVE_DRAFT_KEY)||'{}')||{};}catch{return {};}}
  function saveDraft(){if(!config)return;try{
      localStorage.setItem(DRAFT_KEY,JSON.stringify(sampleSettings()));
      const slide=getSlide();
      if(slide?.live){
        const drafts=getLiveDrafts();
        drafts[slide.id]={enabled:slide.enabled,desktop:slide.desktop,mobile:slide.mobile,card:slide.card};
        localStorage.setItem(LIVE_DRAFT_KEY,JSON.stringify(drafts));
        setStatus('Saved on this device · click Save photo placement');
      }else setStatus('Saved on this device · sample changes not published');
    }catch{setStatus('Changes unsaved. Storage blocked.','error');}}
  function markChanged(){saveDraft();updateCanvas();updateSliders();}
  function preload(){for(const s of config.slides){const img=new Image();img.onload=()=>naturalSizes.set(s.src,{width:img.naturalWidth,height:img.naturalHeight});img.src=s.src;}}
  async function init(){
    try{const r=await fetch('./hero-config.json',{cache:'no-cache'});if(!r.ok)throw Error('Cannot load the published slideshow settings.');
      const v=await r.json();published=normalize(v,v);const saved=(()=>{try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');}catch{return null;}})();
      config=saved?normalize(saved,published):clone(published);
      for(const s of published.slides)DEFAULTS[s.id]=clone(s);
      preload();renderList();selectSlide(selectedId);sizeStage();
      setStatus(saved?'Saved on this device · not published':'Showing published settings','good');
      await loadApprovedPhotos();
    }catch(e){setStatus(e.message,'error');document.querySelector('.studio-panel').insertAdjacentHTML('afterbegin',`<p style="color:#a73e35">${esc(e.message)}</p>`);}
  }

  async function loadApprovedPhotos(){
    try{
      const settings=window.TEXAS_SCTP_CONFIG||{};
      if(!settings.supabaseUrl||!settings.supabasePublishableKey)throw Error('Gallery backend is not connected.');
      const sdk=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm');
      client=sdk.createClient(settings.supabaseUrl,settings.supabasePublishableKey,{auth:{
        persistSession:true,autoRefreshToken:true,detectSessionInUrl:true
      }});
      const {data:auth,error:authError}=await client.auth.getUser();
      if(authError||!auth?.user){
        $('live-status').innerHTML='To adjust real tournament photos, sign in using <a href="./index.html">Staff access</a> at the bottom of the gallery.';
        return;
      }
      const {data:staff,error:staffError}=await client.from('memory_moderators')
        .select('user_id').eq('user_id',auth.user.id).limit(1).maybeSingle();
      if(staffError||!staff){
        $('live-status').textContent='This account is not assigned as a Texas SCTP photo moderator.';
        return;
      }
      staffUser=auth.user;
      const {data:rows,error}=await client.rpc('memory_hero_editor_items',{p_limit:400});
      if(error)throw error;
      const photos=rows||[];
      const signed=new Map();
      const paths=[...new Set(photos.map(r=>r.storage_path))];
      for(let start=0;start<paths.length;start+=40){
        const {data:urls,error:signError}=await client.storage.from(settings.storageBucket||'memories-private')
          .createSignedUrls(paths.slice(start,start+40),3600);
        if(signError)throw signError;
        for(const u of urls||[])if(u.path&&u.signedUrl)signed.set(u.path,u.signedUrl);
      }
      const defaults={x:50,y:50,zoom:1};
      const drafts=getLiveDrafts(),live=[];
      for(const row of photos){
        if(!signed.has(row.storage_path))continue;
        const value={
          id:'approved-'+row.photo_id,photoId:row.photo_id,live:true,
          src:signed.get(row.storage_path),
          label:(row.team_name||'Texas SCTP')+' · '+(row.event_name||'Tournament'),
          enabled:row.enabled!==false,
          desktop:normalizePosition(row.desktop,defaults),
          mobile:normalizePosition(row.mobile,defaults),
          card:normalizePosition(row.card,defaults)
        };
        livePublished.set(value.id,clone(value));
        DEFAULTS[value.id]=clone(value);
        const draft=drafts[value.id];
        if(draft){
          value.enabled=draft.enabled!==false;
          for(const type of ['desktop','mobile','card'])value[type]=normalizePosition(draft[type],value[type]);
        }
        live.push(value);
      }
      config.slides.push(...live);
      preload();
      renderList();
      if(live.length)selectSlide(live[0].id);
      $('live-status').textContent=live.length
        ?live.length+' approved tournament photo'+(live.length===1?'':'s')+' available for manual positioning. Save changes directly to the gallery.'
        :'No approved photos are available for editing yet.';
      if(live.length)setStatus('Approved photographs loaded · select one to adjust','good');
    }catch(error){
      console.error('Could not load approved photos for editing',error);
      $('live-status').textContent='Approved tournament photographs could not be loaded. Please refresh or sign in again.';
    }
  }
  async function saveLiveSlide(slide){
    if(!slide?.live||!client||!staffUser){
      setStatus('Sign in as a Texas SCTP moderator before saving approved photos.','error');return false;
    }
    const clean={};
    for(const type of ['desktop','mobile','card'])
      clean[type]=normalizePosition(slide[type],{x:50,y:50,zoom:1});
    // All edits go through the authorized server function, rather than
    // attempting a direct table upsert that the browser role cannot perform.
    const {data,error}=await client.rpc('memory_staff_save_hero_photo_placement',{
      p_photo_id:slide.photoId,p_enabled:slide.enabled!==false,
      p_desktop:clean.desktop,p_mobile:clean.mobile,p_card:clean.card
    });
    if(error||!data?.saved||data?.photo_id!==slide.photoId){
      setStatus('Could not save photo: '+(error?.message||'Update not confirmed'),'error');
      return false;
    }
    livePublished.set(slide.id,clone(slide));
    DEFAULTS[slide.id]=clone(slide);
    try{
      const drafts=getLiveDrafts();delete drafts[slide.id];
      localStorage.setItem(LIVE_DRAFT_KEY,JSON.stringify(drafts));
    }catch{}
    setStatus('Photo placement and slideshow inclusion saved.','good');
    renderList();
    return true;
  }

  function selectSlide(id){
    const found=config?.slides.find(s=>s.id===id);if(!found)return;
    selectedId=id;renderList();$('selected-caption').textContent=found.label;
    $('save-live').hidden=!found.live;
    $('publish-open').textContent=found.live?'Save photo placement':'Publish settings';
    updateSliders();updateCanvas();
  }
  function renderList(){
    if(!config)return;
    $('scene-count').textContent=`${config.slides.filter(s=>s.enabled).length} active / ${config.slides.length} total`;
    const box=$('scene-list');box.replaceChildren();
    config.slides.forEach((s,i)=>{
      const row=document.createElement('div');row.className='scene-entry'+(s.id===selectedId?' selected':'')+(!s.enabled?' off':'');
      const img=document.createElement('img');img.src=s.src;img.alt='';img.loading='lazy';img.style.objectPosition=`${s.card.x}% ${s.card.y}%`;
      const content=document.createElement('div');
      const name=document.createElement('button');name.type='button';name.className='scene-name';name.textContent=`${i+1}. ${s.label}`;name.addEventListener('click',()=>{stopPlayback();selectSlide(s.id)});
      const order=document.createElement('small');order.className='scene-subtitle';order.textContent=s.id.replace('scene-','Scene ')+' · '+(s.enabled?'Included':'Hidden');
      const toggle=document.createElement('label');toggle.className='scene-inclusion-toggle';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.setAttribute('role','switch');
      checkbox.setAttribute('aria-label','Show '+s.label+' in the homepage hero slideshow');
      checkbox.checked=s.enabled!==false;
      const track=document.createElement('span');track.className='scene-inclusion-track';track.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.className='scene-inclusion-text';
      label.textContent=s.enabled?'Shown in hero':'Hidden from hero';
      checkbox.addEventListener('change',async()=>{
        const previous=s.enabled!==false;
        if(previous&&config.slides.filter(item=>item.enabled).length===1){
          checkbox.checked=true;
          setStatus('At least one slide must remain visible in the slideshow.','error');
          return;
        }
        const targetEnabled=checkbox.checked;
        checkbox.disabled=true;
        s.enabled=targetEnabled;
        if(s.live){
          const saved=await saveLiveSlide(s);
          if(!saved){s.enabled=previous;renderList();return;}
          setStatus(targetEnabled?'Photo now appears in the homepage hero slideshow.':'Photo hidden from the homepage hero slideshow; gallery photo remains published.','good');
        }else{
          saveDraft();
          setStatus('Sample scene choice saved locally. Click Publish settings to apply it to the live website.');
        }
        renderList();
      });
      toggle.append(checkbox,track,label);
      content.append(name,order,toggle);
      const actions=document.createElement('div');actions.className='scene-actions';
      const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='Move earlier';up.setAttribute('aria-label',`Move ${s.label} earlier`);up.disabled=i===0;
      up.addEventListener('click',()=>{const tmp=config.slides[i-1];config.slides[i-1]=config.slides[i];config.slides[i]=tmp;saveDraft();renderList();});
      const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='Move later';down.setAttribute('aria-label',`Move ${s.label} later`);down.disabled=i===config.slides.length-1;
      down.addEventListener('click',()=>{const tmp=config.slides[i+1];config.slides[i+1]=config.slides[i];config.slides[i]=tmp;saveDraft();renderList();});
      actions.append(up,down);row.append(img,content,actions);box.append(row);
    });
  }
  function sizeStage(){
    const wrap=$('preview-wrap'),stage=$('preview-stage'),spec=viewSpecs[mode];
    const maxW=Math.min(wrap.parentElement.clientWidth-2,960);const factor=Math.min(1,maxW/spec.width);
    wrap.style.width=`${spec.width*factor}px`;wrap.style.height=`${spec.height*factor}px`;
    stage.style.width=spec.width+'px';stage.style.height=spec.height+'px';stage.style.transform=`scale(${factor})`;
    $('view-label').textContent=spec.name;
  }
  function updateCanvas(){
    if(!config)return;const s=getSlide(),v=s[mode],stage=$('preview-stage'),photo=$('preview-photo');
    stage.className='preview-stage '+mode+(drag?' dragging':'');
    photo.style.backgroundImage=`url("${s.src}")`;
    photo.style.backgroundPosition=`${v.x}% ${v.y}%`;
    photo.style.transform=`scale(${v.zoom})`;
    $('preview-gradient').hidden=mode==='card';$('preview-copy').hidden=mode==='card';
    $('preview-card-caption').hidden=mode!=='card';
    $('frame-percent').textContent=`Position ${Math.round(v.x)}% / ${Math.round(v.y)}% · ${Math.round(v.zoom*100)}%`;
    sizeStage();
  }
  function updateSliders(){
    if(!config)return;const v=getView();
    $('pos-x').value=Math.round(v.x);$('pos-y').value=Math.round(v.y);$('zoom').value=Math.round(v.zoom*100);
    $('out-x').textContent=Math.round(v.x)+'%';$('out-y').textContent=Math.round(v.y)+'%';$('out-zoom').textContent=Math.round(v.zoom*100)+'%';
  }
  function changeMode(next){if(!viewSpecs[next])return;mode=next;document.querySelectorAll('[data-mode]').forEach(b=>{const a=b.dataset.mode===mode;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});updateSliders();updateCanvas();}
  function beginDrag(e){if(!config||e.button!==0)return;stopPlayback();e.preventDefault();$('preview-stage').setPointerCapture(e.pointerId);
    const s=getSlide(),v=s[mode],spec=viewSpecs[mode];
    const image=naturalSizes.get(s.src)||{width:1648,height:1024};
    const scale=Math.max(spec.width/image.width,spec.height/image.height);
    const scaledW=image.width*scale*v.zoom,scaledH=image.height*scale*v.zoom;
    const rect=$('preview-stage').getBoundingClientRect();
    drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,baseX:v.x,baseY:v.y,
      rangeX:Math.max(1,(scaledW-spec.width)*(rect.width/spec.width)),
      rangeY:Math.max(1,(scaledH-spec.height)*(rect.height/spec.height))};
    $('preview-stage').classList.add('dragging');
  }
  function moveDrag(e){if(!drag||e.pointerId!==drag.id)return;
    const v=getView();const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
    if(drag.rangeX>4)v.x=Math.round(minmax(drag.baseX-dx/drag.rangeX*100,0,100));
    if(drag.rangeY>4)v.y=Math.round(minmax(drag.baseY-dy/drag.rangeY*100,0,100));
    updateCanvas();updateSliders();
  }
  function endDrag(e){if(!drag||e.pointerId!==drag.id)return;drag=null;$('preview-stage').classList.remove('dragging');saveDraft();}
  function stopPlayback(){if(timer)clearInterval(timer);timer=null;playing=false;$('play-toggle').textContent='▶ Preview movement';}
  function playToggle(){if(playing){stopPlayback();return;}const list=config.slides.filter(s=>s.enabled);if(!list.length)return;playing=true;$('play-toggle').textContent='Ⅱ Pause preview';timer=setInterval(()=>{const current=list.findIndex(s=>s.id===selectedId);const next=list[(current+1)%list.length];selectSlide(next.id)},(Number(config.intervalSeconds)||10)*1000);}
  function resetSelected(){const s=getSlide(),def=DEFAULTS[s.id];if(!def)return;s[mode]=clone(def[mode]);markChanged();}
  function restorePublished(){if(!published)return;if(!confirm('Discard unsaved adjustments and restore last saved placements?'))return;config=clone(published);config.slides.push(...[...livePublished.values()].map(clone));localStorage.removeItem(DRAFT_KEY);localStorage.removeItem(LIVE_DRAFT_KEY);stopPlayback();renderList();selectSlide(config.slides.some(s=>s.id===selectedId)?selectedId:config.slides[0].id);setStatus('Showing saved placements','good');}
  function downloadConfig(){if(!config)return;const backup={...sampleSettings(),approvedPhotoPlacements:config.slides.filter(s=>s.live).map(s=>({photoId:s.photoId,enabled:s.enabled,desktop:s.desktop,mobile:s.mobile,card:s.card}))};const file=new Blob([JSON.stringify(backup,null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download='texas-sctp-slideshow-settings.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function showPublishModal(){if(getSlide()?.live){saveLiveSlide(getSlide());return;}saveDraft();const dlg=$('publish-dialog');$('publish-result').textContent='';$('publish-result').className='';$('github-token').value='';dlg.showModal();}
  function b64(str){return btoa(unescape(encodeURIComponent(str)));}
  async function publish(){
    const token=$('github-token').value.trim(),button=$('publish-confirm'),status=$('publish-result');
    if(!token){status.textContent='Enter a GitHub token with Contents: Read and write for this repository.';status.className='error';return;}
    button.disabled=true;button.textContent='Committing…';status.textContent='Authorizing repository access…';status.className='';
    const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
    try{
      const get=await fetch(`${GH_URL}?ref=${encodeURIComponent(BRANCH)}`,{headers,cache:'no-store'});
      if(!get.ok){let detail='';try{detail=(await get.json()).message||''}catch{}throw Error(`GitHub access failed (${get.status}). ${detail}`);}
      const file=await get.json();if(!file.sha)throw Error('Could not verify the GitHub staging file.');
      const put=await fetch(GH_URL,{method:'PUT',headers,body:JSON.stringify({message:'Update Texas SCTP sample slideshow focal points from photo editor',content:b64(JSON.stringify(sampleSettings(),null,2)+'\n'),sha:file.sha,branch:BRANCH})});
      if(!put.ok){let detail='';try{detail=(await put.json()).message||''}catch{}throw Error(`GitHub rejected the update (${put.status}). ${detail}`);}
      const result=await put.json();published=clone(sampleSettings());try{localStorage.removeItem(DRAFT_KEY)}catch{}
      setStatus('Saved to GitHub · Render deployment needed','good');
      status.textContent=`Saved to staging commit ${(result.commit?.sha||'').slice(0,8)}. Deploy the latest staging commit from Render to make it visible to all visitors.`;
      status.className='';
    }catch(e){status.textContent=e.message||String(e);status.className='error';setStatus('Publish unsuccessful. Local draft preserved.','error');}
    finally{$('github-token').value='';button.disabled=false;button.textContent='Commit placements';}
  }
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{stopPlayback();changeMode(b.dataset.mode)}));
  for(const key of ['pos-x','pos-y','zoom'])$(key).addEventListener('input',e=>{
    if(!config)return;stopPlayback();const v=getView();if(key==='pos-x')v.x=Number(e.target.value);else if(key==='pos-y')v.y=Number(e.target.value);else v.zoom=Number(e.target.value)/100;markChanged();
  });
  $('preview-stage').addEventListener('pointerdown',beginDrag);
  $('preview-stage').addEventListener('pointermove',moveDrag);
  $('preview-stage').addEventListener('pointerup',endDrag);
  $('preview-stage').addEventListener('pointercancel',endDrag);
  $('reset-image').addEventListener('click',resetSelected);
  $('center-image').addEventListener('click',()=>{const v=getView();v.x=50;v.y=50;markChanged();});
  $('play-toggle').addEventListener('click',playToggle);
  $('gallery-preview').addEventListener('click',()=>{saveDraft();window.open('./index.html?heroPreview=1','_blank','noopener,noreferrer')});
  $('restore-published').addEventListener('click',restorePublished);
  $('download-json').addEventListener('click',downloadConfig);
  $('publish-open').addEventListener('click',showPublishModal);
  $('save-live').addEventListener('click',()=>saveLiveSlide(getSlide()));
  $('publish-cancel').addEventListener('click',()=>$('publish-dialog').close());
  $('publish-close').addEventListener('click',()=>$('publish-dialog').close());
  $('publish-confirm').addEventListener('click',publish);
  window.addEventListener('resize',()=>{if(config)sizeStage()});
  init();
})();
