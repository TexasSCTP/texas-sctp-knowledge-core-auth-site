/* Texas SCTP Tournament Memories | frontend application
   Public client only. Supabase authorization is enforced by database/storage RLS.
   Nothing in this file should be treated as a server-side permission check. */
(() => {
  'use strict';
  const config = window.TEXAS_SCTP_CONFIG || {};
  const BUCKET = config.storageBucket || 'memories-private';
  const LOGO_BUCKET = 'memories-team-logos';
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  const PAGE_SIZE = 24;
  // Slide framing is published through hero-config.json, not hard-coded into the page.
  const HERO_DRAFT_KEY = 'txsctp-slide-editor-v1';
  const ALLOWED_SCENES = /^\.\/public\/images\/scene-0[1-7]\.webp$/;
  const FALLBACK_SCENES = Object.freeze([
    {id:'scene-01',src:'./public/images/scene-01.webp',label:'Eyes on the target',enabled:true,desktop:{x:36,y:24,zoom:1},mobile:{x:38,y:18,zoom:1},card:{x:38,y:26,zoom:1}},
    {id:'scene-02',src:'./public/images/scene-02.webp',label:'Moving between stations',enabled:true,desktop:{x:30,y:18,zoom:1},mobile:{x:34,y:14,zoom:1},card:{x:32,y:18,zoom:1}},
    {id:'scene-03',src:'./public/images/scene-03.webp',label:'Target in sight',enabled:true,desktop:{x:32,y:22,zoom:1},mobile:{x:30,y:16,zoom:1},card:{x:33,y:24,zoom:1}},
    {id:'scene-04',src:'./public/images/scene-04.webp',label:'Squad celebration',enabled:true,desktop:{x:41,y:8,zoom:1},mobile:{x:44,y:12,zoom:1},card:{x:42,y:20,zoom:1}},
    {id:'scene-05',src:'./public/images/scene-05.webp',label:'Squad on the line',enabled:true,desktop:{x:34,y:12,zoom:1},mobile:{x:30,y:18,zoom:1},card:{x:35,y:24,zoom:1}},
    {id:'scene-06',src:'./public/images/scene-06.webp',label:'Coach on the range',enabled:true,desktop:{x:43,y:20,zoom:1},mobile:{x:39,y:16,zoom:1},card:{x:44,y:22,zoom:1}},
    {id:'scene-07',src:'./public/images/scene-07.webp',label:'After the final target',enabled:true,desktop:{x:31,y:11,zoom:1},mobile:{x:25,y:14,zoom:1},card:{x:30,y:22,zoom:1}}
  ]);
  let ALL_SCENES = FALLBACK_SCENES.map(s=>({...s}));
  let HERO_SCENES = ALL_SCENES;
  let APPROVED_HERO_SCENES = [];
  let heroLastLoadedAt = 0;
  let heroReloading = false;
  let heroIntervalMs = 10000;
  function rebuildHeroScenes(){
    const base=ALL_SCENES.filter(scene=>scene.enabled);
    HERO_SCENES=[...(base.length?base:ALL_SCENES),...APPROVED_HERO_SCENES];
    heroSequence=shuffleIndices(HERO_SCENES.length);
    heroSequencePosition=0;
    currentHero=heroSequence[0]||0;
  }
  function clampCrop(v,fallback=50){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):fallback;}
  function cropMode(mode,defaultMode){return {
    x:clampCrop(mode?.x,defaultMode.x), y:clampCrop(mode?.y,defaultMode.y),
    zoom:Math.max(1,Math.min(1.45,Number(mode?.zoom)||1))
  };}
  function applyHeroConfig(data){
    const allowed=new Map(FALLBACK_SCENES.map(s=>[s.id,s]));
    const seen=new Set();const mapped=[];
    for(const raw of Array.isArray(data?.slides)?data.slides:[]){
      const def=allowed.get(raw?.id);
      if(!def||seen.has(raw.id)||raw.src!==def.src||!ALLOWED_SCENES.test(raw.src))continue;
      seen.add(raw.id);
      mapped.push({...def,enabled:raw.enabled!==false,
        desktop:cropMode(raw.desktop,def.desktop),mobile:cropMode(raw.mobile,def.mobile),card:cropMode(raw.card,def.card)});
    }
    for(const def of FALLBACK_SCENES)if(!seen.has(def.id))mapped.push({...def});
    ALL_SCENES=mapped;
    heroIntervalMs=Math.max(6000,Math.min(30000,Number(data?.intervalSeconds||10)*1000));
    rebuildHeroScenes();
    if(heroTimer){clearInterval(heroTimer);heroTimer=null;}
  }
  async function loadHeroConfig(){
    try{
      let cfg=null;
      if(new URLSearchParams(window.location.search).get('heroPreview')==='1'){
        try{cfg=JSON.parse(localStorage.getItem(HERO_DRAFT_KEY)||'null');}catch{}
      }
      if(!cfg){const resp=await fetch('./hero-config.json',{cache:'no-cache'});if(resp.ok)cfg=await resp.json();}
      if(cfg)applyHeroConfig(cfg);
    }catch(err){console.warn('Published slideshow framing unavailable; using default positions.',err);}
  }
  function shuffleIndices(count) {
    const indices = Array.from({length:count}, (_,i)=>i);
    for(let i=indices.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}
    return indices;
  }
  let heroSequence = shuffleIndices(HERO_SCENES.length);
  let heroSequencePosition = 0;
  let currentHero = heroSequence[0];
  let heroPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let heroTimer = null;
  function nextHeroScene() {
    const slides=$$('.hero-slide');
    if(slides.length!==HERO_SCENES.length)return;
    const previous=currentHero;
    heroSequencePosition += 1;
    if(heroSequencePosition >= heroSequence.length){
      heroSequence=shuffleIndices(HERO_SCENES.length);
      if(heroSequence[0]===previous){const swapWith=heroSequence.length>1?1:0;[heroSequence[0],heroSequence[swapWith]]=[heroSequence[swapWith],heroSequence[0]];}
      heroSequencePosition=0;
    }
    currentHero=heroSequence[heroSequencePosition];
    slides[currentHero].classList.add('is-active');
    slides[previous].classList.remove('is-active');
  }
  function ensureHeroTimer(){
    if(heroTimer)return;
    heroTimer=window.setInterval(()=>{
      if(state.client && state.screen==='gallery' && !heroReloading &&
         !document.hidden && Date.now()-heroLastLoadedAt>5*60*1000){
        loadHeroGallery().then(()=>{if(state.screen==='gallery')render();}).catch(()=>{});
      }
      if(!heroPaused && !document.hidden)nextHeroScene();
    },heroIntervalMs);
  }
  const state = {
    client:null, ready:false, user:null, moderator:false, screen:'gallery',
    teams:[], tournaments:[], availableSeasons:[], posts:[], photos:[], comments:[], reactions:[],
    teamLogos:new Map(), logoUrls:new Map(), adminLogoRequests:[], pendingLogoUrls:new Map(), logoScopes:[],
    logoUploadFile:null, logoBusy:false, logoManageTeam:'', logoSource:'moderator',
    totalFetched:0, hasMore:true, loading:false, fetching:false, galleryError:'',
    filter:{team:'', tournament:'', season:'', query:'', sort:'newest'},
    feedTab:'latest', adminTab:'photos', adminPosts:[], adminComments:[],
    modal:null, selectedPost:null, selectedImage:0, uploadFiles:[],
    uploadBusy:false, signingIn:false, pendingComments:{}, imageUrls:new Map(),
    turnstileTokens:{upload:'',comment:''}, turnstileWidget:null, guestPending:null, visitorId:null, guestLiked:new Set(),
    filtersExpanded:false, cardCrops:new Map()
  };
  const el = document.getElementById('app');
  const root = document.getElementById('modal-root');
  const svgPaths = {
    camera:'<path d="M14 4h-4l-2 3H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4l-2-3Z"/><circle cx="12" cy="13" r="3"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    message:'<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.9 8.9 0 0 1-4-1l-5 2 2-5a8.4 8.4 0 0 1-1-4A8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z"/>',
    share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.7 4m0-11-6.7 4"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    filter:'<path d="M4 7h16M7 12h10m-7 5h4"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    close:'<path d="M18 6 6 18M6 6l12 12"/>',
    chevron:'<path d="m9 18 6-6-6-6"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    people:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.9"/><circle cx="9" cy="7" r="4"/>',
    grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10v.2"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 6 9 7 9-7"/>',
    external:'<path d="M13 4h7v7m0-7-10 10"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>',
    award:'<circle cx="12" cy="8" r="5"/><path d="m8 12-2 10 6-3 6 3-2-10"/>',
    image:'<rect x="2" y="3" width="20" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m2 17 6-5 5 4 4-3 5 4"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    chevrondown:'<path d="m6 9 6 6 6-6"/>'
  };
  function icon(name, clazz=''){return `<svg class="icon ${clazz}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">${svgPaths[name] || svgPaths.info}</svg>`;}
  function esc(s){return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function attr(s){return esc(s);}
  function cleanUrl(u){try{const p=new URL(u);if(p.protocol==='https:' || (p.protocol==='blob:' && u.startsWith('blob:')))return attr(u);}catch{}return '';}
  function todayCentral(){const vals={};for(const part of new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()))vals[part.type]=part.value;return vals.year+'-'+vals.month+'-'+vals.day;}
  function dateFmt(d,opt={month:'short',day:'numeric',year:'numeric'}){if(!d)return 'Date unavailable';let dt=new Date((String(d).length===10?d+'T12:00:00':d));return isNaN(dt)?esc(d):dt.toLocaleDateString('en-US',opt);}
  function seasonStart(date){
    const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    const year=Number(m[1]),month=Number(m[2]);
    return month>=1&&month<=12?(month>=9?year:year-1):null;
  }
  function seasonLabel(date){
    const year=seasonStart(date);
    return year===null?'Unspecified':year+'–'+(year+1);
  }
  function seasonFilterValue(date){
    const year=seasonStart(date);
    return year===null?'':year+'-'+(year+1);
  }
  function initials(s){return (s||'TX').split(/\s+/).filter(x=>x.length>2).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'TX';}
  function toast(msg,bad=false){const box=document.createElement('div');box.className='toast'+(bad?' toast-error':'');box.textContent=msg;document.getElementById('toast-root').appendChild(box);setTimeout(()=>box.remove(),5600);}
  const team=(id)=>state.teams.find(x=>x.id===id);
  const tournament=(id)=>state.tournaments.find(x=>x.id===id);
  const assets=(id)=>state.photos.filter(x=>x.post_id===id).sort((a,b)=>a.position-b.position);
  const postComments=(id)=>state.comments.filter(x=>x.post_id===id && x.status==='approved');
  const postReactions=(id)=>state.reactions.filter(x=>x.post_id===id);
  const shownPosts=()=>state.posts.filter(x=>x.status==='approved');
  const connected=()=>Boolean(state.client);
  const guestReady=()=>connected() && Boolean(config.turnstileSiteKey) && config.guestUploadsEnabled === true;
  function newUuid(){
    if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
    const a=new Uint8Array(16);crypto.getRandomValues(a);a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;
    const h=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function getVisitorId(){
    if(state.visitorId)return state.visitorId;
    const key='txsctp-memories-visitor-v1';let stored='';
    try{stored=window.localStorage.getItem(key)||'';}catch{}
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(stored))stored=newUuid();
    try{window.localStorage.setItem(key,stored);}catch{}
    state.visitorId=stored;
    try{state.guestLiked=new Set(JSON.parse(window.localStorage.getItem('txsctp-liked-v1')||'[]'));}catch{}
    return stored;
  }
  async function guestCall(payload){
    if(!state.client)throw new Error('Gallery service is not connected.');
    const {data,error}=await state.client.functions.invoke('guest-memories',{body:payload});
    if(error){
      // FunctionHttpError exposes the response body in the context.
      let detail='Please try again.';
      try{const json=await error.context?.json?.();detail=json?.error||detail;}catch{}
      throw new Error(detail);
    }
    if(data?.error)throw new Error(data.error);
    return data;
  }
  function resetChallenge(which){
    state.turnstileTokens[which]='';
    if(window.turnstile && state.turnstileWidget!==null){
      try{window.turnstile.reset(state.turnstileWidget);}catch{}
    }
  }
  function mountChallenge(){
    const slot=document.querySelector('[data-turnstile-slot]');
    if(!slot||!config.turnstileSiteKey)return;
    const which=slot.dataset.turnstileSlot;
    state.turnstileTokens[which]='';
    let retries=0;
    const attempt=()=>{
      if(!slot.isConnected)return;
      if(!window.turnstile){if(retries++<30)setTimeout(attempt,150);else slot.textContent='Security check is unavailable. Open the gallery in a new tab and try again.';return;}
      try{state.turnstileWidget=window.turnstile.render(slot,{
        sitekey:config.turnstileSiteKey,
        callback:(token)=>{state.turnstileTokens[which]=token;},
        'expired-callback':()=>{state.turnstileTokens[which]='';},
        'error-callback':()=>{state.turnstileTokens[which]='';}
      });}catch(e){slot.textContent='Could not load the security check. Try the full-page gallery.';console.error(e);}
    };
    attempt();
  }


  async function connect(){
    await loadHeroConfig();
    if(!config.supabaseUrl || !config.supabasePublishableKey){await loadPreviewCatalog();state.ready=true;render();return;}
    try{
      // Version pinned deliberately. The browser receives only the publishable key.
      const sdk=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm');
      state.client=sdk.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      const [{data:sessionResult},catalog] = await Promise.all([
        state.client.auth.getUser(),loadCatalog()
      ]);
      state.user=sessionResult?.user||null;
      state.client.auth.onAuthStateChange((_event,session)=>{
        const next=session?.user||null;
        if((state.user?.id||null)!==(next?.id||null)){
          state.user=next;refreshAccount();
        }
      });
      await refreshAccount();
      state.ready=true;render();
      await openHashMemory();
    }catch(e){console.error('Gallery connection error',e);state.ready=true;state.galleryError='The gallery service is unavailable. Please try again later.';render();}
  }
  async function loadPreviewCatalog(){
    try{const data=window.TEXAS_SCTP_PREVIEW_CATALOG || await (async()=>{const res=await fetch('./preview-catalog.json');if(!res.ok)return null;return res.json();})();if(!data)return;state.teams=data.teams||[];state.tournaments=data.tournaments||[];}
    catch(e){console.warn('Preview catalog could not load:',e);}
  }
  async function loadCatalog(){
    if(!state.client)return;
    const [t,e,seasons]=await Promise.all([
      state.client.from('memory_teams').select('id,name,shot_team_id').eq('active',true).order('name').limit(1000),
      state.client.from('memory_tournaments').select('id,title,event_date,venue').eq('active',true).order('event_date',{ascending:false}).limit(300),
      state.client.rpc('memory_gallery_seasons')
    ]);
    if(t.error)throw t.error;if(e.error)throw e.error;
    state.teams=t.data||[];state.tournaments=e.data||[];
    state.availableSeasons=seasons.error?[]:(seasons.data||[]).map(row=>row.season_label);
    await loadTeamLogos();
  }
  async function loadTeamLogos(){
    if(!state.client)return;
    const {data,error}=await state.client.from('memory_team_logos')
      .select('team_id,storage_path,updated_at').limit(1000);
    if(error){console.warn('Team logo catalog unavailable',error);return;}
    const rows=data||[];
    const signed=new Map(),paths=[...new Set(rows.map(row=>row.storage_path))];
    for(let i=0;i<paths.length;i+=40){
      const result=await state.client.storage.from(LOGO_BUCKET)
        .createSignedUrls(paths.slice(i,i+40),3600);
      if(result.error){console.warn('Approved team logo images unavailable',result.error);continue;}
      for(const item of result.data||[])if(item.path&&item.signedUrl)signed.set(item.path,item.signedUrl);
    }
    state.teamLogos=new Map(rows.map(row=>[row.team_id,row]));
    state.logoUrls=new Map(rows.filter(row=>signed.has(row.storage_path))
      .map(row=>[row.team_id,signed.get(row.storage_path)]));
  }
  function logoForTeam(id,name='Texas SCTP team',extra=''){
    const src=state.logoUrls.get(id);
    return src
      ? `<img class="team-logo-img ${extra}" src="${cleanUrl(src)}" alt="${attr(name)} team logo" loading="lazy">`
      : `<span class="team-logo-initials ${extra}" aria-hidden="true">${esc(initials(name))}</span>`;
  }
  async function refreshAccount(){
    if(!state.client)return;
    if(state.user){
      const {data,error}=await state.client.from('memory_moderators').select('user_id').eq('user_id',state.user.id).limit(1).maybeSingle();
      state.moderator=!error&&Boolean(data);
    }else state.moderator=false;
    await loadGallery(true);
    if(state.screen==='admin'&&state.moderator)await loadAdmin();
  }
  // Only approved, non-held photos can enter the hero. The SECURITY INVOKER
  // database RPC selects them under public RLS; private files receive short
  // lived signed URLs that expire after one hour.
  async function loadHeroGallery(){
    if(!state.client||heroReloading)return;
    heroReloading=true;
    try{
      const {data,error}=await state.client.rpc('memory_hero_candidates',{p_limit:24});
      if(error)throw error;
      const rows=data||[];
      const paths=[...new Set(rows.map(r=>r.storage_path))];
      const signed=new Map();
      for(let i=0;i<paths.length;i+=40){
        const {data:items,error:signError}=await state.client.storage.from(BUCKET).createSignedUrls(paths.slice(i,i+40),3600);
        if(signError)throw signError;
        for(const item of items||[])if(item.path&&item.signedUrl){
          signed.set(item.path,item.signedUrl);
          state.imageUrls.set(item.path,item.signedUrl);
        }
      }
      const centered={x:50,y:50,zoom:1};
      APPROVED_HERO_SCENES=rows.filter(r=>signed.has(r.storage_path)).map(r=>({
        id:'approved-'+r.photo_id,
        src:signed.get(r.storage_path),live:true,
        label:'Approved Texas SCTP tournament photo',
        enabled:true,desktop:cropMode(r.desktop,centered),
        mobile:cropMode(r.mobile,centered),card:cropMode(r.card,centered)
      }));
      heroLastLoadedAt=Date.now();
      rebuildHeroScenes();
    }catch(error){
      console.warn('Approved slideshow photos could not be loaded; retaining available slides.',error);
      heroLastLoadedAt=Date.now();
    }finally{heroReloading=false;}
  }

  async function loadGallery(reset=false){
    if(!state.client || state.fetching)return;
    if(reset){state.posts=[];state.photos=[];state.comments=[];state.reactions=[];state.totalFetched=0;state.hasMore=true;state.imageUrls.clear();state.cardCrops.clear();}
    if(!state.hasMore)return;
    state.fetching=true;state.loading=true;render();
    try{
      const start=state.totalFetched;
      let query=state.client.from('memory_posts').select('id,team_id,tournament_id,other_tournament,photo_date,photo_credit,caption,status,created_at').eq('status','approved');
      if(state.filter.season){
        const year=Number(state.filter.season.slice(0,4));
        if(Number.isInteger(year)&&year>=1900&&year<=2100)
          query=query.gte('photo_date',year+'-09-01').lt('photo_date',(year+1)+'-09-01');
      }
      const {data,error}=await query.order('created_at',{ascending:false}).range(start,start+PAGE_SIZE-1);
      if(error)throw error;
      const rows=data||[];
      state.posts=[...state.posts,...rows];state.totalFetched+=rows.length;state.hasMore=rows.length===PAGE_SIZE;
      await loadRelated(rows);
      if(reset || !heroLastLoadedAt)await loadHeroGallery();
      state.galleryError='';
    }catch(e){state.galleryError='Could not load the gallery. '+(e?.message||'');console.error(e);}
    finally{state.fetching=false;state.loading=false;render();}
  }

  async function openHashMemory(){
    if(!state.client)return;
    const matched=(window.location.hash||'').match(/^#memory-([0-9a-f-]{36})$/i);
    if(!matched)return;
    const id=matched[1];let post=state.posts.find(p=>p.id===id);
    if(!post){
      const {data,error}=await state.client.from('memory_posts')
        .select('id,team_id,tournament_id,other_tournament,photo_date,photo_credit,caption,status,created_at')
        .eq('id',id).eq('status','approved').maybeSingle();
      if(error||!data)return;
      post=data;state.posts.unshift(data);await loadRelated([data]);
    }
    state.selectedPost=post;state.selectedImage=0;state.modal='view';render();
  }
  async function loadRelated(posts){
    if(!posts.length)return;
    const ids=posts.map(x=>x.id);
    const [img,com,likes]=await Promise.all([
      state.client.from('memory_photos').select('id,post_id,storage_path,position').in('post_id',ids).order('position'),
      state.client.from('memory_comments').select('id,post_id,display_name,body,status,created_at').in('post_id',ids).eq('status','approved').order('created_at'),
      state.client.from('memory_reactions').select('post_id').in('post_id',ids)
    ]);
    if(img.error)throw img.error;if(com.error)throw com.error;if(likes.error)throw likes.error;
    state.photos=[...state.photos,...(img.data||[])];
    const photoIds=(img.data||[]).map(x=>x.id);
    if(photoIds.length){
      const {data:crops,error:cropError}=await state.client.from('memory_hero_placements')
        .select('photo_id,card').in('photo_id',photoIds);
      if(!cropError)for(const value of crops||[])state.cardCrops.set(value.photo_id,value.card);
    }
    state.comments=[...state.comments,...(com.data||[])];
    state.reactions=[...state.reactions,...(likes.data||[])];
    await Promise.all((img.data||[]).filter(x=>!state.imageUrls.has(x.storage_path)).map(async photo=>{
      const {data,error}=await state.client.storage.from(BUCKET).createSignedUrl(photo.storage_path,3600);
      if(!error&&data?.signedUrl)state.imageUrls.set(photo.storage_path,data.signedUrl);
    }));
  }
  function render(){
    if(!state.ready){el.innerHTML='<div class="boot-screen"><span class="boot-mark">TX</span><strong>Texas SCTP | On the Range</strong><span>Preparing the gallery...</span></div>';return;}
    el.innerHTML=`<div class="site-shell">${topBar()}${state.screen==='admin'&&state.moderator?renderAdmin():`<main>${hero()}${renderGallery()}</main>`}${footer()}</div>`;
    renderModal();
    ensureHeroTimer();
  }

  function topBar(){return `<header class="topbar"><a class="brand" href="./" aria-label="Return to Texas SCTP On the Range gallery"><span class="brand-seal"><span class="seal-fallback">TX</span>${config.brandLogoUrl?`<img src="${cleanUrl(config.brandLogoUrl)}" alt="Texas SCTP logo">`:''}</span><span class="brand-copy"><strong>TEXAS SCTP</strong><small>ON THE RANGE</small></span></a><div class="head-right"><span class="header-context">THE ACTION ACROSS TEXAS</span>${state.moderator?`<button data-action="admin" class="staff-head" aria-label="Open moderation">${icon('shield','icon-sm')}</button>`:''}</div></header>`;}
  function hero(){return `<section class="hero hero-photo" aria-label="Texas SCTP tournament action photo gallery"><div class="hero-slideshow" aria-hidden="true">${HERO_SCENES.map((scene,i)=>`<div class="hero-slide ${i===currentHero?'is-active':''}" style="background-image:url('${scene.live?cleanUrl(scene.src):attr(scene.src)}');--desktop-focus:${scene.desktop.x}% ${scene.desktop.y}%;--mobile-focus:${scene.mobile.x}% ${scene.mobile.y}%;--zoom-desktop:${scene.desktop.zoom};--zoom-mobile:${scene.mobile.zoom}"></div>`).join('')}<div class="hero-slideshow-scrim"></div></div><div class="hero-inner"><div class="hero-text"><p class="hero-kicker"><span class="kicker-line"></span> TEXAS SCTP <span class="kicker-slash">/</span> TOURNAMENT ACTION</p><h1>THE ACTION <em>IS ON.</em></h1><p class="hero-lede">From the first call to the final target, follow the competition across Texas. See the teams in action. Share what's happening on your range.</p><div class="hero-cta-row"><button class="btn btn-primary hero-share" data-action="upload">${icon('camera')} Share Photos</button><button class="hero-see" data-action="scroll-gallery">See the Action ${icon('arrow','icon-sm')}</button></div><div class="hero-assurance">${icon('check','icon-sm')} No login required <span class="dot-sep">&bull;</span> Photos reviewed before posting</div></div></div><div class="hero-motion-controls"><button type="button" data-action="toggle-slideshow" aria-pressed="${heroPaused}" aria-label="${heroPaused?'Play background slideshow':'Pause background slideshow'}">${heroPaused?'Play motion':'Pause motion'}</button></div></section>`;}
    function renderGallery(){
    const all=shownPosts();const query=state.filter.query.toLowerCase().trim();
    let results=all.filter(p=>!state.filter.team||p.team_id===state.filter.team)
      .filter(p=>!state.filter.tournament||p.tournament_id===state.filter.tournament)
      .filter(p=>!state.filter.season||seasonFilterValue(p.photo_date)===state.filter.season)
      .filter(p=>!query||[p.caption,team(p.team_id)?.name,tournament(p.tournament_id)?.title,p.other_tournament,seasonLabel(p.photo_date),seasonFilterValue(p.photo_date)].some(v=>(v||'').toLowerCase().includes(query)))
      .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const hasFilters=Boolean(state.filter.team||state.filter.tournament||state.filter.season||state.filter.query);
    return `<section class="content-wrap gallery-section" id="memories-gallery" aria-label="Tournament photo gallery"><div class="section-intro"><div><div class="section-kicker">TEXAS SCTP PHOTO FEED</div><h2>Latest from the Range</h2><p>See who's competing, catch the action, and share photos from your tournament.</p></div></div>
      <div class="gallery-main"><div class="gallery-toolbar"><div class="searchbox">${icon('search','icon-sm')}<label class="sr-only" for="memory-search">Search photos and teams</label><input type="search" id="memory-search" data-filter="query" maxlength="100" placeholder="Search photos, teams, tournaments..." value="${attr(state.filter.query)}"></div><button data-action="toggle-filters" aria-expanded="${state.filtersExpanded}" aria-controls="filter-strip" class="filter-trigger ${state.filtersExpanded||hasFilters?'is-active':''}">${icon('filter','icon-sm')} Filters ${hasFilters?`<span class="filter-dot"></span>`:''}${icon('chevrondown','icon-xs')}</button></div>
      <div id="filter-strip" class="filter-strip ${state.filtersExpanded?'filter-open':''}" ${!state.filtersExpanded?'hidden':''}><label>Team<select data-filter="team" aria-label="Filter photos by team"><option value="">All teams</option>${state.teams.map(t=>`<option value="${attr(t.id)}" ${state.filter.team===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><label>Tournament<select data-filter="tournament" aria-label="Filter photos by tournament"><option value="">All tournaments</option>${state.tournaments.map(t=>`<option value="${attr(t.id)}" ${state.filter.tournament===t.id?'selected':''}>${esc(t.title)}</option>`).join('')}</select></label><label>Texas SCTP Season<select data-filter="season" aria-label="Filter by Texas SCTP Season"><option value="">All seasons</option>${state.availableSeasons.map(v=>`<option value="${attr(v)}" ${state.filter.season===v?'selected':''}>Season ${esc(v.replace('-', '–'))}</option>`).join('')}</select></label><button class="clear-filters" data-action="clear-filters">Clear filters</button></div>
      ${state.galleryError?`<p class="form-message form-error" role="alert">${esc(state.galleryError)}</p>`:''}
      ${connected()?(results.length?`<div class="memory-list">${results.map(postCard).join('')}</div>`:state.loading?`<div class="memory-list"><div class="loading-card"><div class="loading-line"></div><div class="loading-media"></div><div class="loading-line"></div></div></div>`:hasFilters?emptyState():previewMemory()):previewMemory()}
      ${state.hasMore&&connected()?`<div class="more-wrap"><button class="btn btn-outline" data-action="load-more" ${state.loading?'disabled':''}>${state.loading?'Loading...':'Load more photos'}</button></div>`:''}</div>
      <p class="gallery-trust">${icon('shield','icon-sm')} Shared with care. Photos and comments are reviewed before they appear. <a href="mailto:${attr(config.contactEmail||'info@texassctp.com')}?subject=Texas%20SCTP%20photo%20removal">Request a photo removal</a>.</p></section>`;
  }
  function previewMemory(){
    const sceneTitles=[
      'Eyes on the target',
      'Moving between stations',
      'Target in sight',
      'Squad celebration',
      'Squad on the line',
      'Coach on the range',
      'After the final target'
    ];
    return `<div class="sample-preview-banner"><strong>Illustrative photo concepts</strong> These sample scenes demonstrate the gallery layout. Real tournament photographs appear here after review and approval.</div><div class="memory-list sample-photo-list">${ALL_SCENES.map((scene,i)=>`<article class="memory-card sample-photo-card"><div class="sample-photo-heading"><span class="sample-photo-mark">TX</span><span><strong>Texas SCTP Action</strong><small>ON THE RANGE</small></span></div><div class="sample-photo-image"><img src="${scene.src}" alt="${scene.label||sceneTitles[i]||'Texas SCTP on the range'}" loading="lazy" style="object-position:${scene.card.x}% ${scene.card.y}%;transform:scale(${scene.card.zoom})"></div><div class="sample-photo-caption">${scene.label||sceneTitles[i]}</div></article>`).join('')}</div>`;
  }
    function postCard(p){
    const t=team(p.team_id),evt=tournament(p.tournament_id),photos=assets(p.id),first=photos[0],src=first&&state.imageUrls.get(first.storage_path);
    const comments=postComments(p.id),likes=postReactions(p.id),liked=state.guestLiked.has(p.id);
    const crop=first&&state.cardCrops.get(first.id);
    const cardStyle=crop?` style="object-position:${clampCrop(crop.x)}% ${clampCrop(crop.y)}%;transform:scale(${Math.max(1,Math.min(1.45,Number(crop.zoom)||1))})"` : '';
    return `<article class="memory-card"><div class="memory-head"><div class="memory-avatar">${logoForTeam(p.team_id,t?.name||'Texas SCTP team')}</div><div class="memory-byline"><strong>${esc(t?.name||'Texas SCTP team')}</strong><span>${esc(evt?.title||p.other_tournament||'Tournament')} &middot; ${dateFmt(p.photo_date)}</span><span class="season-tag">Texas SCTP Season ${esc(seasonLabel(p.photo_date))}</span></div><button class="memory-more" data-action="report" data-id="${attr(p.id)}" title="Report photo" aria-label="Report or request photo removal">${icon('more')}</button></div>
    <button class="memory-photo" data-action="view" data-id="${attr(p.id)}" aria-label="View photos from ${attr(t?.name||'Texas SCTP')}">${src?`<img src="${cleanUrl(src)}" alt="Tournament memory shared by ${attr(t?.name||'Texas SCTP')}" loading="lazy"${cardStyle}>`:`<span class="no-photo">${icon('image')} Photo temporarily unavailable</span>`}${photos.length>1?`<span class="multi-photo">${icon('image','icon-sm')} ${photos.length} photos</span>`:''}</button>
    <div class="memory-body"><p class="memory-caption">${esc(p.caption||'Action from the range.')}</p>${p.photo_credit?`<p class="photo-by">Photo by ${esc(p.photo_credit)}</p>`:''}<div class="memory-gestures"><button class="memory-gesture ${liked?'is-liked':''}" data-action="like" data-id="${attr(p.id)}" aria-label="${liked?'Remove appreciation':'Appreciate'}">${icon('heart','icon-sm')} <span>${likes.length?likes.length:'Appreciate'}</span></button><button class="memory-gesture" data-action="view" data-id="${attr(p.id)}">${icon('message','icon-sm')} <span>${comments.length?`${comments.length} comments`:'Comment'}</span></button><button class="memory-gesture" data-action="share" data-id="${attr(p.id)}">${icon('share','icon-sm')} Share</button></div>
    <div class="comments-preview">${comments.slice(-2).map(c=>`<div class="inline-comment"><span class="comment-avatar">${esc(initials(c.display_name))}</span><p><strong>${esc(c.display_name)}</strong> ${esc(c.body)}</p></div>`).join('')}${comments.length>2?`<button class="view-comments" data-action="view" data-id="${attr(p.id)}">View all ${comments.length} comments</button>`:''}<button class="comment-invite" data-action="view" data-id="${attr(p.id)}">${icon('message','icon-sm')} Write a comment...</button></div></div></article>`;
  }
    function emptyState(){const filtered=state.filter.team||state.filter.tournament||state.filter.query;
    return `<div class="empty-state"><span class="empty-icon">${icon('camera','icon-lg')}</span><h3>${filtered?'No photos match these filters.':'The next shoot starts here.'}</h3><p>${filtered?'Try another team or tournament, or clear your filters.':'Tournament photos will appear here once submissions are enabled. Get ready to share your team in action.'}</p><button class="btn btn-outline" data-action="${filtered?'clear-filters':'upload'}">${filtered?'Show all photos':'Share Photos'}</button></div>`;}
    function footer(){return `<footer class="site-footer"><div class="footer-inner"><div class="footer-left"><strong>TEXAS SCTP <span class="footer-sep">/</span> ON THE RANGE</strong><span>Every target. Every team. Every tournament. Share the action across Texas.</span></div><div class="footer-links"><a href="${attr(config.organizationUrl||'https://www.texassctp.com/')}" target="_blank" rel="noopener noreferrer">Texas SCTP</a><button data-action="privacy">Photo guidelines</button><a href="mailto:${attr(config.contactEmail||'info@texassctp.com')}?subject=Texas%20SCTP%20photo%20removal">Photo removal</a><button data-action="open-full">Open full page</button><button data-action="${state.moderator?'admin':'login'}">${state.moderator?'Moderation':'Staff access'}</button></div></div></footer>`;}
    function renderModal(){
    if(window.turnstile&&state.turnstileWidget!==null){try{window.turnstile.remove(state.turnstileWidget);}catch{}state.turnstileWidget=null;}
    root.innerHTML='';if(!state.modal)return;
    let html='';let cls='';
    if(state.modal==='upload'){html=uploadModal();cls='modal-wide';}
    else if(state.modal==='login'){html=loginModal();}
    else if(state.modal==='account'){html=accountModal();}
    else if(state.modal==='view'){html=viewModal();cls='modal-post';}
    else if(state.modal==='privacy'){html=privacyModal();}
    root.innerHTML=`<div class="modal-backdrop" data-action="backdrop"><div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${attr(state.modal==='upload'?'Share tournament photos':state.modal==='view'?'Tournament photo':'Texas SCTP')}">${html}</div></div>`;
    const close=$('.close-modal',root);if(close)close.focus();
    if(state.modal==='upload'||state.modal==='view')mountChallenge();
  }
  function modalHead(title,desc=''){return `<div class="modal-top"><div><h2>${title}</h2>${desc?`<p>${desc}</p>`:''}</div><button class="close-modal" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>`;}
  function selectTeams(){return `<option value="">Choose your team</option>${state.teams.map(t=>`<option value="${attr(t.id)}">${esc(t.name)}</option>`).join('')}`;}
  function selectEvents(){return `<option value="">Choose a tournament</option>${state.tournaments.filter(t=>t.event_date<=todayCentral()).map(t=>`<option value="${attr(t.id)}" data-date="${attr(t.event_date)}">${esc(t.title)} · ${dateFmt(t.event_date)}</option>`).join('')}<option value="other">Other Texas SCTP tournament</option>`;}

  function uploadModal(){return `${modalHead('Share Photos','Three simple steps. No account needed.')}<div class="modal-scroll"><form id="upload-form" novalidate>
    <section class="upload-step"><div class="step-title"><span>1</span><div><h3>Pick your photos</h3><p>Choose up to six shots of your team in action.</p></div></div><div class="form-field"><label class="dropzone" id="upload-dropzone" for="photo-picker">${icon('camera','icon-lg')}<strong>Choose photos</strong><small>or drag and drop &middot; JPG, PNG, WebP or supported iPhone photos</small><input type="file" id="photo-picker" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"></label><div class="previews" id="upload-previews">${state.uploadFiles.map((f,i)=>`<div class="preview-thumb"><img alt="Selected photo ${i+1}" src="${attr(f.preview)}"><button type="button" data-action="remove-upload" data-index="${i}" aria-label="Remove photo">${icon('close')}</button></div>`).join('')}</div></div></section>
    <section class="upload-step"><div class="step-title"><span>2</span><div><h3>Tag your team and shoot</h3><p>Select your team and tournament. We fill in the date.</p></div></div><div class="form-grid"><div class="form-field"><label for="upload-team">Your team *</label><select id="upload-team" name="team" required>${selectTeams()}</select></div><div class="form-field"><label for="upload-event">Tournament *</label><select id="upload-event" name="tournament" required>${selectEvents()}</select></div></div><input id="upload-date" name="photoDate" type="hidden" value=""><div class="event-date-info" id="event-date-info" hidden>${icon('calendar','icon-sm')} <span id="event-date-text"></span></div><div id="other-event-wrap" hidden><div class="form-grid"><div class="form-field"><label for="upload-other">Tournament name *</label><input id="upload-other" name="other" maxlength="120" placeholder="Name of the tournament"></div><div class="form-field"><label for="upload-manual-date">Tournament date *</label><input id="upload-manual-date" type="date" max="${todayCentral()}"></div></div></div><div class="form-field"><label for="upload-caption">Add a caption <span class="optional">(optional)</span></label><textarea id="upload-caption" name="caption" maxlength="900" rows="3" placeholder="What is your team doing on the range?"></textarea></div>
    <div class="form-field logo-submission-section">
      <label for="logo-picker">Offer your team logo <span class="optional">(optional, only needed once per team)</span></label>
      <p class="field-note">If your team already has a logo in this gallery, you do not need to upload it again. A new logo will be reviewed before replacing an existing one.</p>
      <div id="team-existing-logo" class="team-existing-logo" hidden></div>
      <input type="file" id="logo-picker" accept="image/jpeg,image/png,image/webp" aria-label="Optional team logo image">
      <div id="logo-preview" class="logo-upload-preview">${state.logoUploadFile?`<img src="${attr(state.logoUploadFile.preview)}" alt="Proposed team logo preview"><span>${esc(state.logoUploadFile.file.name)}</span><button type="button" data-action="remove-logo-upload" class="btn btn-outline btn-sm">Remove</button>`:''}</div>
      <label class="checkbox-wrap"><input id="team-logo-permission" name="logoPermission" type="checkbox"><span>If submitting a logo, I confirm I am authorized to let Texas SCTP display it publicly with this team's gallery photos.</span></label>
    </div></section>
    <section class="upload-step upload-final"><div class="step-title"><span>3</span><div><h3>Submit for review</h3><p>Texas SCTP checks each submission before it's published.</p></div></div><label class="checkbox-wrap"><input id="photo-consent" name="consent" type="checkbox" required><span>I have permission to share these photos, including any required parent or guardian consent for minors shown.</span></label><label class="checkbox-wrap"><input id="social-consent" name="socialConsent" type="checkbox"><span><strong>Optional social spotlight:</strong> I also permit Texas SCTP to feature an approved photo and reviewed caption on our official Facebook and Instagram pages. Public posts may be reshared. Gallery submission does not require this permission.</span></label><input type="text" name="website" class="honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">${guestReady()?`<div class="captcha-wrap"><div class="captcha-note">${icon('shield','icon-sm')} Quick security check</div><div data-turnstile-slot="upload"></div></div>`:'<p class="form-message form-warn">Photo uploads will open once the final security verification is enabled.</p>'}<div class="form-actions"><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button><button class="btn btn-navy" type="submit" ${!guestReady()||state.uploadBusy?'disabled':''}>${icon('arrow','icon-sm')} ${state.uploadBusy?'Uploading...':state.guestPending?'Continue upload':'Submit photos'}</button></div><p class="field-note">Need a team or tournament added? <a href="mailto:${attr(config.contactEmail||'info@texassctp.com')}?subject=Texas%20SCTP%20On%20the%20Range%20team%20request">Contact Texas SCTP</a>.</p></section>
    </form></div>`;}
    function loginModal(){return `${modalHead('Texas SCTP staff access','For authorized photo and comment moderators only. Visitors do not need to sign in.')}<div class="modal-scroll"><form id="login-form"><div class="form-field"><label for="auth-email">Staff email address</label><input id="auth-email" name="email" type="email" autocomplete="email" required placeholder="staff@texassctp.com"></div><button class="btn btn-navy btn-block" type="submit" ${!connected()?'disabled':''}>${icon('mail')} Send staff sign-in link</button></form><p class="auth-rule">Staff access is granted separately by Texas SCTP. Entering an email here does not provide moderation privileges. If embedded, open the gallery in a full tab to complete staff sign-in.</p><div class="form-actions" style="justify-content:center"><button class="btn btn-outline btn-sm" data-action="open-full">Open gallery in a new tab ${icon('external','icon-xs')}</button></div></div>`;}

  function accountModal(){return `${modalHead('Staff account','Texas SCTP moderation access')}<div class="modal-scroll"><p class="form-message">${icon('check','icon-xs')} Signed in as <strong>${esc(state.user?.email||'Texas SCTP staff')}</strong></p><div class="form-actions"><button class="btn btn-outline" type="button" data-action="logout">Sign out</button>${state.moderator?`<button class="btn btn-navy" data-action="admin">${icon('shield')} Review submissions</button>`:''}</div></div>`;}

  function viewModal(){const post=state.selectedPost;if(!post)return '';const arr=assets(post.id),photo=arr[state.selectedImage]||arr[0],url=photo&&state.imageUrls.get(photo.storage_path),t=team(post.team_id),ev=tournament(post.tournament_id);
    return `<div class="post-view"><div class="post-view-media">${url?`<img src="${cleanUrl(url)}" alt="Photo from ${attr(t?.name||'Texas SCTP')}"/>`:`<div class="no-photo">${icon('image')} Photo temporarily unavailable</div>`}${arr.length>1?`<div class="photo-pager"><button data-action="previous-photo" aria-label="Previous photo">${icon('chevron')}</button><span>${state.selectedImage+1} / ${arr.length}</span><button data-action="next-photo" aria-label="Next photo">${icon('chevron')}</button></div>`:''}</div><div class="post-view-side"><div class="post-view-top"><div class="post-team-identity"><span class="post-team-logo">${logoForTeam(post.team_id,t?.name||'Texas SCTP team')}</span><div><strong>${esc(t?.name||'Texas SCTP community')}</strong><small>${esc(ev?.title||post.other_tournament||'Tournament')} &middot; ${dateFmt(post.photo_date)}</small><span class="season-tag">Texas SCTP Season ${esc(seasonLabel(post.photo_date))}</span></div></div><button class="close-modal" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><div class="post-view-caption">${esc(post.caption||'Action from the range.')}${post.photo_credit?`<div class="field-note">Photo by ${esc(post.photo_credit)}</div>`:''}</div><div class="comments-head">Comments <span>(${postComments(post.id).length})</span></div><div class="comments-list">${postComments(post.id).length?postComments(post.id).map(c=>`<div class="comment"><strong>${esc(c.display_name)}</strong><small>${dateFmt(c.created_at)}</small><p>${esc(c.body)}</p></div>`).join(''):'<div class="comments-empty">No comments yet. Leave the first kind word.</div>'}</div><div class="comment-editor"><form id="comment-form"><input type="hidden" name="postId" value="${attr(post.id)}"><div class="form-field"><label for="comment-author">Your name</label><input id="comment-author" name="displayName" maxlength="60" required placeholder="Your first name"></div><label class="sr-only" for="comment-text">Your comment</label><textarea id="comment-text" name="body" maxlength="400" placeholder="Write an encouraging comment..." required></textarea><input type="text" name="website" class="honeypot" tabindex="-1" autocomplete="off" aria-hidden="true">${guestReady()?`<div class="captcha-wrap"><div class="captcha-note">${icon('shield','icon-sm')} Quick security check</div><div data-turnstile-slot="comment"></div></div>`:''}<button class="btn btn-navy btn-sm" type="submit" ${!guestReady()?'disabled':''}>Post comment ${icon('arrow','icon-xs')}</button><small>No login required. Comments are reviewed before appearing.</small></form><button class="reset-link" data-action="report" data-id="${attr(post.id)}">Report or request photo removal</button>${state.moderator?`<button class='btn btn-danger btn-sm' data-action='remove-published' data-id='${attr(post.id)}'>Remove from gallery</button>`:''}</div></div></div>`;
  }
    function privacyModal(){return `${modalHead('Community photo guidelines','Keeping our athletes and families safe is our first priority.')}<div class="modal-scroll"><p>Share photos you own or have permission to submit. For athletes under 18, confirm any required parent or guardian consent before posting. Avoid disclosing private athlete information, home addresses, or personal contact details.</p><p>All photos and comments are reviewed before publication. Texas SCTP may decline, hide, or remove submissions. Comments should be positive, relevant, and respectful. We do not allow harassment or unsolicited advertising.</p><p>For correction, removal, or concerns, email <a href="mailto:${attr(config.contactEmail||'info@texassctp.com')}?subject=Texas%20SCTP%20photo%20concern">${esc(config.contactEmail||'info@texassctp.com')}</a>.</p><p class="field-note">This page provides community guidelines and does not replace Texas SCTP's formal policies or required photography releases.</p></div>`;}

  async function uploadPhotos(form){
    if(state.uploadBusy)return;
    if(!guestReady()){toast('Photo submissions are not available until the gallery is configured.',true);return;}
    if(!state.uploadFiles.length){toast('Choose at least one photo.',true);return;}
    const fields=new FormData(form),teamId=String(fields.get('team')||''),eventId=String(fields.get('tournament')||'');
    const event=eventId!=='other'?tournament(eventId):null;
    const eventName=String(fields.get('other')||'').trim(),day=String(fields.get('photoDate')||'');
    if(!state.teams.some(t=>t.id===teamId)||!eventId||(eventId==='other'&&eventName.length<3)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)||!fields.get('consent')){
      toast('Complete the team, tournament, date, and permission fields.',true);return;
    }
    if(state.logoUploadFile&&!fields.get('logoPermission')){toast('Confirm permission to display the proposed team logo publicly.',true);return;}
    if(!state.guestPending&&!state.turnstileTokens.upload){toast('Complete the quick security check.',true);return;}
    if(day>todayCentral()){toast('Please use the actual tournament date.',true);return;}
    state.uploadBusy=true;const button=$('#upload-form button[type=submit]');if(button){button.disabled=true;button.textContent='Preparing and uploading photos...';}
    try{
      if(!state.guestPending){
        const blobs=await Promise.all(state.uploadFiles.map(f=>compress(f.file)));
        const logoBlob=state.logoUploadFile?await compressLogo(state.logoUploadFile.file):null;
        const started=await guestCall({action:'begin',teamId,tournamentId:event?.id||null,otherTournament:eventId==='other'?eventName:null,
          photoDate:day,credit:String(fields.get('credit')||'').trim(),caption:String(fields.get('caption')||'').trim(),
          fileCount:blobs.length,consent:true,socialConsent:Boolean(fields.get('socialConsent')),
          logoRequested:Boolean(logoBlob),logoPermission:Boolean(fields.get('logoPermission')),website:String(fields.get('website')||''),turnstileToken:state.turnstileTokens.upload});
        if(!started?.slots||started.slots.length!==blobs.length||(logoBlob&&!started.logoSlot))throw Error('Unexpected upload response.');
        state.guestPending={...started,blobs,next:0,logoBlob,logoUploaded:false};
      }
      const pending=state.guestPending;
      while(pending.next<pending.blobs.length){
        const index=pending.next,slot=pending.slots[index];
        if(button)button.textContent=`Uploading photo ${index+1} of ${pending.blobs.length}...`;
        const {error}=await state.client.storage.from(BUCKET).uploadToSignedUrl(slot.path,slot.token,pending.blobs[index],{contentType:'image/webp'});
        if(error)throw error;
        pending.next++;
      }
      if(pending.logoSlot&&pending.logoBlob&&!pending.logoUploaded){
        if(button)button.textContent='Uploading proposed team logo...';
        const {error}=await state.client.storage.from(LOGO_BUCKET)
          .uploadToSignedUrl(pending.logoSlot.path,pending.logoSlot.token,pending.logoBlob,{contentType:'image/webp'});
        if(error)throw error;
        pending.logoUploaded=true;
      }
      if(button)button.textContent='Sending for approval...';
      const done=await guestCall({action:'finish',submissionId:pending.submissionId,submissionKey:pending.submissionKey});
      if(!done?.accepted)throw Error('Could not finalize your submission.');
      state.guestPending=null;releaseUploads();state.modal=null;render();
      toast('Your tournament photos are submitted for review. Thanks for sharing the action!');
    }catch(e){console.error('Upload failed:',e);toast('Could not complete your photos. '+(e?.message||'Please try again.'),true);}
    finally{state.uploadBusy=false;if(button?.isConnected){button.disabled=false;button.textContent=state.guestPending?'Continue photo upload':'Submit for approval';}if(!state.guestPending)resetChallenge('upload');}
  }
  async function compress(file){
    if(!isSupportedImage(file))throw new Error('Choose a JPG, PNG, WebP or supported iPhone photo.');
    if(file.size>12*1024*1024)throw new Error('Each original photo must be under 12 MB.');
    let image;const url=URL.createObjectURL(file);
    try{
      image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Could not open this photo. If it is HEIC, export it as JPG and try again.'));i.src=url;});
      const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Your browser cannot prepare this photo.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Photo conversion failed.')),'image/webp',0.83));
      if(blob.type!=='image/webp')throw new Error('Your browser does not support WebP photo uploads.');
      if(blob.size>5*1024*1024)throw new Error('Photo is too large after processing. Try a smaller image.');return blob;
    }finally{URL.revokeObjectURL(url);}
  }
  async function compressLogo(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>8*1024*1024)
      throw Error('Choose a JPG, PNG, or WebP team logo under 8 MB.');
    const image=await createImageBitmap(file);
    try{
      if(image.width<64||image.height<64)throw Error('Your team logo must be at least 64 pixels wide and tall.');
      const ratio=Math.min(1,768/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.width*ratio));
      canvas.height=Math.max(1,Math.round(image.height*ratio));
      const ctx=canvas.getContext('2d');
      if(!ctx)throw Error('Cannot process this team logo on your device.');
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(Error('Cannot convert team logo.')),'image/webp',0.88));
      if(blob.type!=='image/webp'||blob.size>2*1024*1024||blob.size<100)
        throw Error('Team logo could not be converted to an image under 2 MB.');
      return blob;
    }finally{image.close();}
  }
  function releaseUploads(){
    state.uploadFiles.forEach(f=>URL.revokeObjectURL(f.preview));
    state.uploadFiles=[];
    if(state.logoUploadFile)URL.revokeObjectURL(state.logoUploadFile.preview);
    state.logoUploadFile=null;
  }

  async function submitComment(form){
    if(!guestReady())return toast('Comments will be available once the gallery is connected.',true);
    const f=new FormData(form),displayName=String(f.get('displayName')||'').trim(),body=String(f.get('body')||'').trim();
    if(displayName.length<2||displayName.length>60||!body||body.length>400){toast('Enter your display name and a comment of 400 characters or fewer.',true);return;}
    if(!state.turnstileTokens.comment){toast('Complete the quick security check.',true);return;}
    const submit=form.querySelector('button[type=submit]');if(submit)submit.disabled=true;
    try{
      await guestCall({action:'comment',postId:String(f.get('postId')),displayName,body,website:String(f.get('website')||''),turnstileToken:state.turnstileTokens.comment});
      form.reset();toast('Your comment has been submitted for review.');
      resetChallenge('comment');
    }catch(e){toast('Comment could not be submitted. '+e.message,true);resetChallenge('comment');}
    finally{if(submit)submit.disabled=false;}
  }
  async function toggleLike(id){
    if(!connected())return toast('Reactions will be available when the gallery is connected.',true);
    const visitorId=getVisitorId();
    try{
      const result=await guestCall({action:'react',postId:id,visitorId});
      if(result.liked)state.guestLiked.add(id);else state.guestLiked.delete(id);
      try{window.localStorage.setItem('txsctp-liked-v1',JSON.stringify([...state.guestLiked]));}catch{}
      const present=state.reactions.findIndex(r=>r.post_id===id);
      if(result.liked)state.reactions.push({post_id:id});else if(present>=0)state.reactions.splice(present,1);
      render();
    }catch(e){toast('Could not save the reaction. '+e.message,true);}
  }
  async function loadAdmin(){
    if(!state.client||!state.moderator)return;
    const [p,c,l,scopes]=await Promise.all([
      state.client.from('memory_posts').select('id,team_id,tournament_id,other_tournament,photo_date,photo_credit,caption,status,created_at,social_consent,social_reviewed,caption_social_approved,privacy_hold,expected_photo_count,upload_verified_at').eq('status','pending').order('created_at',{ascending:true}).limit(100),
      state.client.from('memory_comments').select('id,post_id,display_name,body,status,created_at').eq('status','pending').order('created_at',{ascending:true}).limit(100),
      state.client.from('memory_team_logo_requests').select('id,post_id,team_id,storage_path,status,created_at').eq('status','pending').order('created_at',{ascending:true}).limit(200),
      state.client.from('memory_moderators').select('team_id').eq('user_id',state.user.id).limit(500)
    ]);
    if(p.error||c.error||l.error||scopes.error){toast('Could not load moderation queue.',true);return;}
    state.adminPosts=p.data||[];state.adminComments=c.data||[];
    state.adminLogoRequests=l.data||[];
    state.logoScopes=(scopes.data||[]).map(x=>x.team_id);
    if(!state.logoScopes.includes(null)&&
        !state.logoScopes.includes(state.logoManageTeam))state.logoManageTeam=state.logoScopes.find(Boolean)||'';
    const knownPending=new Map();
    await Promise.all(state.adminLogoRequests.map(async row=>{
      if(state.pendingLogoUrls.has(row.storage_path))return;
      const {data,error}=await state.client.storage.from(LOGO_BUCKET).createSignedUrl(row.storage_path,3600);
      if(!error&&data?.signedUrl)knownPending.set(row.storage_path,data.signedUrl);
    }));
    for(const [key,url] of knownPending)state.pendingLogoUrls.set(key,url);
    const missing=state.adminPosts.filter(p=>!state.posts.some(x=>x.id===p.id));
    const allIds=state.adminPosts.map(x=>x.id);
    if(allIds.length){
      const {data,error}=await state.client.from('memory_photos').select('id,post_id,position,storage_path').in('post_id',allIds);
      if(!error){state.photos=state.photos.filter(x=>!allIds.includes(x.post_id)).concat(data||[]);await Promise.all((data||[]).map(async x=>{if(!state.imageUrls.has(x.storage_path)){const signed=await state.client.storage.from(BUCKET).createSignedUrl(x.storage_path,3600);if(signed.data?.signedUrl)state.imageUrls.set(x.storage_path,signed.data.signedUrl);}}));}
    }
    render();
  }

  function renderTeamLogoAdmin(){
    const pending=state.adminLogoRequests;
    const allowed=state.teams.filter(t=>state.logoScopes.includes(null)||state.logoScopes.includes(t.id));
    const chosen=allowed.find(t=>t.id===state.logoManageTeam)||allowed[0]||null;
    const selected=chosen?.id||'',src=state.logoUrls.get(selected);
    return `<div class="team-logo-admin">
      <section class="logo-admin-panel">
        <h3>Proposed team logos (${pending.length})</h3>
        <p class="field-note">A submitted logo does not change the team's gallery branding until you approve it.</p>
        <div class="review-grid">${pending.map(r=>{
          const t=team(r.team_id),url=state.pendingLogoUrls.get(r.storage_path);
          return `<div class="review-card team-logo-request">
            ${url?`<div class="logo-review-image"><img src="${cleanUrl(url)}" alt="Proposed logo for ${attr(t?.name||'team')}"></div>`:'<div class="logo-review-image">Preview unavailable</div>'}
            <div class="review-body">
              <strong>${esc(t?.name||'Unlisted team')}</strong>
              <div class="meta">Proposed ${dateFmt(r.created_at)} · Awaiting public-display approval</div>
              <p class="field-note">Approval applies this logo to every approved photo from the same team.</p>
              <div class="review-actions">
                <button class="btn btn-primary btn-sm" data-action="approve-team-logo" data-id="${attr(r.id)}" ${url?'':'disabled'}>Approve team logo</button>
                <button class="btn btn-danger btn-sm" data-action="reject-team-logo" data-id="${attr(r.id)}">Decline</button>
              </div>
            </div>
          </div>`;
        }).join('')||'<p class="full-width-notice">No team logos awaiting approval.</p>'}</div>
      </section>
      <section class="logo-admin-panel">
        <h3>Team logo library</h3>
        <p>Manage the single approved logo shown on every gallery photo tagged with a team.</p>
        <div class="form-field"><label for="team-logo-team">Select team</label>
          <select id="team-logo-team">${allowed.map(t=>`<option value="${attr(t.id)}" ${t.id===selected?'selected':''}>${esc(t.name)}</option>`).join('')}</select>
        </div>
        ${chosen?`<div class="logo-current-record">
          <div class="logo-current-preview">${src?logoForTeam(selected,chosen.name):'<span>No logo currently approved</span>'}</div>
          <div><strong>${esc(chosen.name)}</strong><p class="field-note">${src?'Approved logo is shown on every matching gallery photo.':'A team logo is optional. Posts use team initials until one is approved.'}</p></div>
        </div>
        <div class="form-field"><label for="team-logo-source">Source of replacement logo</label>
          <select id="team-logo-source">
            <option value="moderator" ${state.logoSource==='moderator'?'selected':''}>Provided by team or coach</option>
            <option value="team_accounts" ${state.logoSource==='team_accounts'?'selected':''}>Existing Team Accounts logo (authorized copy)</option>
            <option value="external" ${state.logoSource==='external'?'selected':''}>Other authorized source</option>
          </select>
        </div>
        <div class="logo-staff-actions">
          <label for="staff-logo-picker" class="btn btn-primary btn-sm">${src?'Replace team logo':'Add team logo'}</label>
          <input id="staff-logo-picker" type="file" accept="image/png,image/jpeg,image/webp" ${state.logoBusy?'disabled':''}>
          <button type="button" class="btn btn-danger btn-sm" data-action="remove-current-team-logo" data-id="${attr(selected)}" ${src?'':'disabled'}>Remove team logo</button>
        </div>
        <p class="field-note">PNG, JPG or WebP. Images are reduced to a secure WebP copy under 2 MB. Confirm permission for public display when prompted. Changes apply to every photo for this team.</p>`:'<p class="field-note">No teams are assigned to this moderator.</p>'}
        <p class="field-note">Team Accounts logos are stored privately. Authorized staff may copy an existing approved logo from <a href="https://teamaccounts.texassctp.com/" target="_blank" rel="noopener noreferrer">Team Accounts</a> and upload that copy here. This does not share private portal access or account data.</p>
      </section>
    </div>`;
  }
  function renderAdmin(){const pendingP=state.adminPosts.length,pendingC=state.adminComments.length,pendingL=state.adminLogoRequests.length;
    return `<div class="content-wrap admin-shell"><div class="admin-heading"><div><div class="eyebrow" style="color:#b78031">ADMINISTRATION</div><h2>Community moderation</h2><p>Review athlete photos and comments before they appear to the public.</p></div><div class="admin-heading-actions"><a class="btn btn-outline" href="./hero-studio.html">Adjust slideshow photos</a><button class="btn btn-outline" data-action="refresh-admin">Refresh queue</button></div></div>
    <div class="admin-stats"><div class="admin-stat"><strong>${pendingP}</strong><small>Photo submissions waiting</small></div><div class="admin-stat"><strong>${pendingC}</strong><small>Comments waiting</small></div><div class="admin-stat"><strong>${shownPosts().length}</strong><small>Published photo posts loaded</small></div></div>
    <div class="admin-tabs"><button class="admin-tab ${state.adminTab==='photos'?'active':''}" data-action="admin-photos">Photo submissions (${pendingP})</button><button class="admin-tab ${state.adminTab==='comments'?'active':''}" data-action="admin-comments">Comments (${pendingC})</button><button class="admin-tab ${state.adminTab==='logos'?'active':''}" data-action="admin-logos">Team logos (${pendingL})</button></div>
    ${state.adminTab==='photos'?`<div class="review-grid">${state.adminPosts.map(p=>{const a=assets(p.id),img=a[0]&&state.imageUrls.get(a[0].storage_path);return `<div class="review-card">${img?`<img src="${cleanUrl(img)}" alt="Photo awaiting moderation" loading="lazy">`:`<div style="background:#edf0f1;height:170px;display:grid;place-items:center">${icon('camera','icon-lg')}</div>`}<div class="review-body"><div class="review-team-logo">${logoForTeam(p.team_id,team(p.team_id)?.name||'Texas SCTP team')}<strong>${esc(team(p.team_id)?.name||'Unlisted team')}</strong></div><div class="meta">${esc(tournament(p.tournament_id)?.title||p.other_tournament||'Unlisted event')} · ${dateFmt(p.photo_date)} · ${a.length} photo(s)</div><span class="season-tag">Texas SCTP Season ${esc(seasonLabel(p.photo_date))}</span><p>${esc(p.caption||'No caption')}</p><p class="field-note">Submitted ${dateFmt(p.created_at)}</p><div class="review-actions"><button class="btn btn-primary btn-sm" data-action="approve-post" data-id="${attr(p.id)}" ${a.length?'':'disabled'}>${icon('check')} Approve</button>${p.social_consent?`<button class='btn btn-outline btn-sm' data-action='approve-social-post' data-id='${attr(p.id)}' ${a.length?'':'disabled'}>${icon('camera')} Approve + Spotlight</button>`:''}<button class="btn btn-danger btn-sm" data-action="reject-post" data-id="${attr(p.id)}">Decline</button></div>${p.social_consent?`<p class='field-note'>Social promotion permission given. Approve the exact photo and caption before selecting the spotlight option.</p>`:`<p class='field-note'>Gallery permission only. No Facebook or Instagram sharing.</p>`}${!a.length?'<p class="field-note">No photo file attached. Do not approve.</p>':''}</div></div>`;}).join('')||'<p class="full-width-notice">No pending photos. You are caught up.</p>'}</div>`:state.adminTab==='logos'?renderTeamLogoAdmin():
    `<div class="review-grid">${state.adminComments.map(c=>{const p=state.adminPosts.find(x=>x.id===c.post_id)||state.posts.find(x=>x.id===c.post_id);return `<div class="review-card"><div class="review-body review-comment"><strong>${esc(c.display_name)}</strong><div class="meta">${dateFmt(c.created_at)} · ${esc(team(p?.team_id)?.name||'Tournament photo')}</div><p>${esc(c.body)}</p><div class="review-actions"><button class="btn btn-primary btn-sm" data-action="approve-comment" data-id="${attr(c.id)}">${icon('check')} Approve</button><button class="btn btn-danger btn-sm" data-action="reject-comment" data-id="${attr(c.id)}">Decline</button></div></div></div>`;}).join('')||'<p class="full-width-notice">No pending comments. You are caught up.</p>'}</div>`}</div>`;
  }
  async function moderate(type,id,decision){
    if(!state.moderator)return;
    const tbl=type==='post'?'memory_posts':'memory_comments';
    const approved=decision==='approve'||decision==='approveSocial';const update={status:approved?'approved':'rejected',moderated_at:new Date().toISOString(),moderated_by:state.user.id};if(type==='post'&&decision==='approveSocial'){if(!state.adminPosts.some(p=>p.id===id&&p.social_consent)){toast('Social promotion was not authorized.',true);return;}Object.assign(update,{social_reviewed:true,caption_social_approved:true,social_reviewed_at:new Date().toISOString(),social_reviewed_by:state.user.id});}
    if(type==='post'&&approved&&!assets(id).length){toast('Cannot approve a submission without a photo.',true);return;}
    const {error}=await state.client.from(tbl).update(update).eq('id',id);
    if(error){toast('Moderation failed: '+error.message,true);return;}
    toast(approved?(decision==='approveSocial'?'Approved for gallery and social spotlight.':'Approved for gallery only.'):'Submission declined.');await loadGallery(true);await loadAdmin();
  }
  function sharePost(id){const url=new URL(window.location.href);url.hash=`memory-${id}`;
    if(navigator.share){navigator.share({title:'Texas SCTP | On the Range',url:url.toString()}).catch(()=>{});}
    else if(navigator.clipboard?.writeText){navigator.clipboard.writeText(url.toString()).then(()=>toast('Link copied to clipboard.')).catch(()=>toast(url.toString()));}
    else toast(url.toString());
  }
  async function onAction(e){const target=e.target.closest('[data-action]');if(!target)return;
    const action=target.dataset.action,id=target.dataset.id;
    if(action==='toggle-slideshow'){
      heroPaused=!heroPaused;
      target.setAttribute('aria-pressed',String(heroPaused));
      target.setAttribute('aria-label',heroPaused?'Play background slideshow':'Pause background slideshow');
      target.textContent=heroPaused?'Play motion':'Pause motion';
      return;
    }
    if(action==='backdrop'){if(e.target===target){if(state.modal==='upload'){releaseUploads();state.guestPending=null;}state.modal=null;renderModal();}return;}
    if(action==='close-modal'){if(state.modal==='upload'){releaseUploads();state.guestPending=null;}state.modal=null;renderModal();return;}
    if(action==='scroll-gallery'){$('#memories-gallery')?.scrollIntoView({behavior:'smooth'});return;}
    if(action==='gallery'){state.screen='gallery';render();return;}
    if(action==='admin'){if(!state.moderator){state.modal='login';renderModal();return;}state.modal=null;state.screen='admin';render();await loadAdmin();return;}
    if(action==='admin-photos'||action==='admin-comments'){state.adminTab=action==='admin-photos'?'photos':'comments';render();return;}
    if(action==='refresh-admin'){await loadAdmin();return;}
    if(action==='login'||action==='account'||action==='privacy'){state.modal=action;renderModal();return;}
    if(action==='upload'){state.modal='upload';renderModal();return;}
    if(action==='logout'&&state.client){const {error}=await state.client.auth.signOut();if(error)toast(error.message,true);else{state.user=null;state.moderator=false;state.modal=null;await refreshAccount();render();toast('Signed out.');}return;}
    if(action==='toggle-filters'){state.filtersExpanded=!state.filtersExpanded;render();return;}
    if(action==='clear-filters'){state.filter={team:'',tournament:'',season:'',query:'',sort:'newest'};await loadGallery(true);return;}
    if(action==='tab-latest'||action==='tab-popular'){state.feedTab=action==='tab-latest'?'latest':'popular';render();return;}
    if(action==='load-more'){await loadGallery(false);return;}
    if(action==='view'){state.selectedPost=state.posts.find(x=>x.id===id)||null;state.selectedImage=0;state.modal=state.selectedPost?'view':null;renderModal();return;}
    if(action==='previous-photo'||action==='next-photo'){let a=assets(state.selectedPost.id);state.selectedImage=(state.selectedImage+(action==='next-photo'?1:-1)+a.length)%a.length;renderModal();return;}
    if(action==='like'){await toggleLike(id);return;}
    if(action==='share'){sharePost(id);return;}
    if(action==='remove-published'&&state.moderator){if(!confirm('Remove this photo post from the public gallery and cancel queued social sharing?'))return;const {error}=await state.client.from('memory_posts').update({status:'removed',privacy_hold:true,moderated_at:new Date().toISOString(),moderated_by:state.user.id}).eq('id',id);if(error)toast('Removal failed: '+error.message,true);else{state.modal=null;state.selectedPost=null;await loadGallery(true);toast('Removed. Any photo already posted on Facebook or Instagram also needs removal from Meta.');}return;}
    if(action==='report'){const url=`mailto:${config.contactEmail||'info@texassctp.com'}?subject=${encodeURIComponent('Texas SCTP photo concern')}&body=${encodeURIComponent('Please review the photo post: '+id+'\n\nReason for request: ')}`;window.location.href=url;return;}
    if(action==='remove-logo-upload'){
      if(state.guestPending){toast('A secure upload is already in progress.',true);return;}
      if(state.logoUploadFile)URL.revokeObjectURL(state.logoUploadFile.preview);
      state.logoUploadFile=null;
      const wrap=$('#logo-preview');if(wrap)wrap.innerHTML='';
      const consent=$('#team-logo-permission');if(consent)consent.checked=false;
      return;
    }
    if(action==='remove-upload'){state.guestPending=null;let n=Number(target.dataset.index);if(state.uploadFiles[n])URL.revokeObjectURL(state.uploadFiles[n].preview);state.uploadFiles.splice(n,1);const wrap=$('#upload-previews');if(wrap)wrap.innerHTML=state.uploadFiles.map((f,i)=>`<div class="preview-thumb"><img alt="Selected photo ${i+1}" src="${attr(f.preview)}"><button type="button" data-action="remove-upload" data-index="${i}" aria-label="Remove photo">${icon('close')}</button></div>`).join('');return;}
    if(action==='open-full'){window.open(window.location.href,'_blank','noopener,noreferrer');return;}
    if(action.startsWith('approve-')||action.startsWith('reject-')){await moderate(action.endsWith('post')?'post':'comment',id,action==='approve-social-post'?'approveSocial':action.startsWith('approve')?'approve':'reject');return;}
  }
  async function onSubmit(e){
    if(e.target.id==='login-form'){
      e.preventDefault();if(!state.client)return;
      const email=String(new FormData(e.target).get('email')||'').trim();if(!email)return;
      const {error}=await state.client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:window.location.origin+window.location.pathname}});
      if(error)toast('Could not send sign-in email: '+error.message,true);
      else{state.modal=null;renderModal();toast('Check your email for a secure sign-in link.');}
    }
    if(e.target.id==='upload-form'){e.preventDefault();await uploadPhotos(e.target);}
    if(e.target.id==='comment-form'){e.preventDefault();await submitComment(e.target);}
  }
  async function onChange(e){
    const element=e.target;
    if(element.id==='photo-picker'){
      addChosenPhotos([...element.files]);element.value='';return;
    }
    if(element.id==='upload-team'){
      const wrap=$('#team-existing-logo'),src=state.logoUrls.get(element.value);
      if(wrap){
        wrap.hidden=!src;
        wrap.innerHTML=src?`${logoForTeam(element.value,team(element.value)?.name||'Team')} <span>Approved team logo already on file. No reupload needed.</span>`:'';
      }
      return;
    }
    if(element.id==='logo-picker'){
      const file=element.files?.[0];element.value='';
      if(!file)return;
      if(state.guestPending){toast('Finish or cancel the current upload before changing its logo.',true);return;}
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>8*1024*1024){
        toast('Choose a JPG, PNG, or WebP team logo under 8 MB.',true);return;
      }
      if(state.logoUploadFile)URL.revokeObjectURL(state.logoUploadFile.preview);
      state.logoUploadFile={file,preview:URL.createObjectURL(file)};
      const wrap=$('#logo-preview');
      if(wrap)wrap.innerHTML=`<img src="${attr(state.logoUploadFile.preview)}" alt="Proposed team logo"><span>${esc(file.name)}</span><button type="button" class="btn btn-outline btn-sm" data-action="remove-logo-upload">Remove</button>`;
      return;
    }
    if(element.id==='upload-event'){
      const extra=$('#other-event-wrap'),date=$('#upload-date'),info=$('#event-date-info'),label=$('#event-date-text');
      const event=tournament(element.value);if(extra)extra.hidden=element.value!=='other';
      if(date)date.value=event?.event_date||'';if(info)info.hidden=!event;
      if(label)label.textContent=event?'Tournament date: '+dateFmt(event.event_date)+' · Texas SCTP Season '+seasonLabel(event.event_date):'';return;
    }
    if(element.id==='upload-manual-date'){const date=$('#upload-date');if(date)date.value=element.value;const label=$('#event-date-text'),info=$('#event-date-info');if(label)label.textContent=element.value?'Texas SCTP Season '+seasonLabel(element.value):'';if(info)info.hidden=!element.value;return;}
    if(element.dataset.filter){state.filter[element.dataset.filter]=element.value;if(element.dataset.filter==='season'){await loadGallery(true);}else render();return;}
  }
  function isSupportedImage(file){return ['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type)||/\.(heic|heif)$/i.test(file.name||'');}
  function addChosenPhotos(files){
      let available=6-state.uploadFiles.length;
      if(files.length>available)toast(`Only ${available} more photos can be added.`,true);
      for(const file of files.slice(0,available)){
        if(!isSupportedImage(file)||file.size>12*1024*1024){toast(`Skipped ${file.name}: unsupported type or larger than 12 MB.`,true);continue;}
        state.uploadFiles.push({file,preview:URL.createObjectURL(file)});
      }
      // Updating only the preview grid preserves the rest of the form.
      const wrap=$('#upload-previews');if(wrap)wrap.innerHTML=state.uploadFiles.map((f,i)=>`<div class="preview-thumb"><img alt="Selected photo ${i+1}" src="${attr(f.preview)}"><button type="button" data-action="remove-upload" data-index="${i}" aria-label="Remove photo">${icon('close')}</button></div>`).join('');
  }
  let searchTimer;
  function onInput(e){if(e.target.dataset.filter==='query'){const v=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.filter.query=v;render();$('#memory-search')?.focus();$('#memory-search')?.setSelectionRange(v.length,v.length);},250);}}
  document.addEventListener('dragover',e=>{const zone=e.target.closest?.('#upload-dropzone');if(!zone)return;e.preventDefault();zone.classList.add('drag-over');});
  document.addEventListener('dragleave',e=>{const zone=e.target.closest?.('#upload-dropzone');if(zone)zone.classList.remove('drag-over');});
  document.addEventListener('drop',e=>{const zone=e.target.closest?.('#upload-dropzone');if(!zone)return;e.preventDefault();zone.classList.remove('drag-over');addChosenPhotos([...e.dataTransfer.files]);});
  document.addEventListener('click',onAction);document.addEventListener('submit',onSubmit);
  document.addEventListener('change',onChange);document.addEventListener('input',onInput);
  window.addEventListener('hashchange',()=>openHashMemory());
  document.addEventListener('error',e=>{if(e.target?.matches?.('.brand-seal img, .demo-photo img'))e.target.style.display='none';},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.modal){state.modal=null;releaseUploads();state.guestPending=null;renderModal();}});
  getVisitorId();
  connect();
})();
