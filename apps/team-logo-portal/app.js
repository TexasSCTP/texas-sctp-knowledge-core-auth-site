/* Texas SCTP Team Logo Portal. Browser code contains only the public project key. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const config = window.TEXAS_SCTP_CONFIG || {};
  const apiRoot = config.supabaseUrl;
  const publicKey = config.supabasePublishableKey;
  const endpoint = apiRoot + '/functions/v1/team-logo-portal';
  const bucket = 'memories-team-logos';
  const allTeams = [];
  let activeTeam = null, selectedBlob = null, selectedPreviewUrl = null, busy = false;
  let statusFilter = 'all';
  let reportTeam = null, reportBusy = false;
  const reportDialog = $('#report-dialog'), reportForm = $('#report-form');
  const grid = $('#team-grid'), statusMessage = $('#directory-status');
  const dialog = $('#upload-dialog'), form = $('#upload-form');
  $('#current-year').textContent = String(new Date().getFullYear());

  function clean(value) { return String(value == null ? '' : value); }
  function errMessage(e) { return e instanceof Error ? e.message : 'Something went wrong. Please try again.'; }
  function notify(message) {
    const t = $('#toast'); t.textContent = message; t.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { t.hidden = true; }, 5200);
  }
  async function parseResponse(response) {
    let data;
    try { data = await response.json(); } catch { throw Error('The server returned an unexpected response.'); }
    if (!response.ok || data.error) throw Error(data.error || 'Request failed. Please try again.');
    return data;
  }
  async function portalRequest(action, payload) {
    const response = await fetch(endpoint, {
      method: action ? 'POST' : 'GET',
      headers: {'apikey': publicKey, ...(action ? {'Content-Type': 'application/json'} : {})},
      ...(action ? {body: JSON.stringify({action, ...payload})} : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000)
    });
    return parseResponse(response);
  }
  function countLogo() { return allTeams.filter(t => !!t.logoUrl).length; }
  function updateCounts() {
    $('#total-teams').textContent = String(allTeams.length);
    $('#total-logos').textContent = String(countLogo());
  }
  function setStatusFilter(next) {
    statusFilter = next;
    document.querySelectorAll('[data-status]').forEach(btn => {
      const active = btn.dataset.status === next;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }
  // Older cached page markup can contain the removed duplicate gallery.
  // Keep just the single searchable directory even during cache transitions.
  document.querySelector('.featured-section')?.remove();
  function logoPlaceholder() {
    const wrap = document.createElement('div');
    wrap.className = 'missing-art';
    wrap.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"></path><circle cx="9" cy="9" r="1.6"></circle><path d="m6 16 5-4 3 2 3-3 2 3"></path></svg>';
    return wrap;
  }
  function createCard(team) {
    const card = document.createElement('article');
    card.className = 'team-card';
    card.dataset.teamId = team.id;
    card.tabIndex = -1;
    const artwork = document.createElement('div');
    artwork.className = 'card-logo-area' + (team.logoUrl ? ' has-logo' : '');
    if (team.logoUrl) {
      const image = document.createElement('img');
      image.src = team.logoUrl;
      image.alt = clean(team.name) + ' official team logo';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.onerror = () => { artwork.classList.remove('has-logo'); image.replaceWith(logoPlaceholder()); };
      artwork.append(image);
    } else {
      artwork.append(logoPlaceholder());
    }
    const body = document.createElement('div');
    body.className = 'card-body';
    const status = document.createElement('p');
    status.className = 'logo-status' + (team.logoUrl ? ' present' : '');
    status.textContent = team.logoUrl ? '✓ LOGO ON FILE' : 'LOGO NEEDED';
    const name = document.createElement('h3');
    name.className = 'card-name';
    name.textContent = clean(team.name);
    const league = document.createElement('p');
    league.className = 'card-league';
    league.textContent = clean(team.league || 'Assignment Pending');
    body.append(status, name, league);
    const details = document.createElement('div');
    details.className = 'card-details';
    if (team.profileVerified && team.teamKind) {
      const kind = document.createElement('span');
      kind.className = 'team-kind';
      kind.textContent = team.teamKind === 'school' ? 'School Team' : 'Club Team';
      details.append(kind);
      function detail(label,value) {
        if (!value) return;
        const line = document.createElement('p');
        line.className = 'card-detail';
        const key = document.createElement('span');
        key.textContent = label;
        const text = document.createElement('strong');
        text.textContent = value;
        line.append(key,text);
        details.append(line);
      }
      if (team.teamKind === 'school') detail('School',team.schoolName);
      else detail('Home range',team.homeRange);
      detail('City',team.city);
      if (team.contact) {
        detail(team.contact.role || 'Contact',team.contact.name);
        if (team.contact.email) {
          const mail = document.createElement('a');
          mail.className = 'card-email';
          mail.href = 'mailto:' + team.contact.email;
          mail.textContent = team.contact.email;
          mail.setAttribute('aria-label','Email '+team.name);
          details.append(mail);
        }
      } else {
        const awaiting = document.createElement('p');
        awaiting.className = 'card-pending';
        awaiting.textContent = 'Contact not yet approved';
        details.append(awaiting);
      }
    } else {
      const pending = document.createElement('p');
      pending.className = 'card-pending';
      pending.textContent = 'Team details pending verification';
      details.append(pending);
    }
    body.append(details);
    if (team.shotTeamId) {
      const shot = document.createElement('small');
      shot.className = 'card-shot';
      shot.textContent = 'SHOT ID: ' + clean(team.shotTeamId);
      body.append(shot);
    }
    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'card-button';
    upload.textContent = team.logoUrl ? 'Update team logo' : 'Upload team logo';
    upload.addEventListener('click', () => openUpload(team.id));
    body.append(upload);
    const reportLink = document.createElement('button');
    reportLink.type = 'button';
    reportLink.className = 'report-team-link';
    reportLink.setAttribute('aria-label', 'Flag ' + team.name + ' for team directory review');
    reportLink.title = 'Flag this team for review';
    reportLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 5c4-3 7 3 12 0v11c-5 3-8-3-12 0"></path></svg><span>Report a listing concern</span>';
    reportLink.addEventListener('click', () => openReport(team.id));
    body.append(reportLink);
    card.append(artwork, body);
    return card;
  }
  function filteredTeams() {
    const q = $('#team-search').value.trim().toLocaleLowerCase();
    const league = $('#league-filter').value;
    const kind = $('#kind-filter').value;
    return allTeams.filter(t =>
      (league === 'all' || t.league === league) &&
      (kind === 'all' || (kind === 'pending' && !t.profileVerified) || (t.profileVerified && t.teamKind === kind)) &&
      (statusFilter === 'all' || (statusFilter === 'present') === !!t.logoUrl) &&
      (!q || clean(t.name).toLocaleLowerCase().includes(q) || clean(t.shotTeamId).toLocaleLowerCase().includes(q) ||
       clean(t.city).toLocaleLowerCase().includes(q) || clean(t.schoolName).toLocaleLowerCase().includes(q) ||
       clean(t.homeRange).toLocaleLowerCase().includes(q))
    );
  }
  function render() {
    const matched = filteredTeams().sort((a,b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true })
    );
    grid.replaceChildren();
    const frag = document.createDocumentFragment();
    for (const team of matched) frag.append(createCard(team));
    grid.append(frag);
    $('#results-count').textContent = matched.length + ' of ' + allTeams.length + ' teams';
    statusMessage.hidden = matched.length > 0;
    if (!matched.length) statusMessage.textContent = 'No matching teams. Try another search or clear a filter.';
  }
  async function loadTeams() {
    statusMessage.hidden = false;
    statusMessage.textContent = 'Loading the team directory...';
    try {
      const payload = await portalRequest();
      if (!Array.isArray(payload.teams)) throw Error('The directory response was incomplete.');
      allTeams.splice(0, allTeams.length, ...payload.teams.map(t => ({
        id: clean(t.id), name: clean(t.name), league: clean(t.league || 'Assignment Pending'),
        shotTeamId: clean(t.shotTeamId), logoUrl: t.logoUrl || null,
        teamKind: t.teamKind === 'school' || t.teamKind === 'club' ? t.teamKind : null,
        profileVerified: t.profileVerified === true,
        schoolName: clean(t.schoolName), homeRange: clean(t.homeRange),
        city: clean(t.city), contact: t.contact && typeof t.contact === 'object'
          ? {name:clean(t.contact.name),role:clean(t.contact.role),email:clean(t.contact.email)} : null
      })));
      const leagueSelect = $('#league-filter'), previous = leagueSelect.value;
      leagueSelect.replaceChildren(new Option('All leagues', 'all'));
      for (const league of [...new Set(allTeams.map(t => t.league))].sort((a,b) => a.localeCompare(b)))
        leagueSelect.add(new Option(league, league));
      if ([...leagueSelect.options].some(o => o.value === previous)) leagueSelect.value = previous;
      updateCounts();
      render();
    } catch (e) {
      statusMessage.hidden = false;
      const recover = e?.name === 'TimeoutError' || e?.name === 'AbortError'
        ? 'The directory request timed out. Refresh the page to try again.'
        : 'Team directory could not load. ' + errMessage(e);
      statusMessage.textContent = recover;
      $('#results-count').textContent = 'Unavailable';
    }
  }
  function revokePreview() { if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl); selectedPreviewUrl = null; selectedBlob = null; }
  function setError(text) {
    const el = $('#dialog-error'); el.hidden = !text; el.textContent = text || '';
  }
  function setBusy(next, message = '') {
    busy = next;
    $('#submit-upload').disabled = busy || !selectedBlob || !$('#upload-confirmation').checked;
    $('#cancel-upload').disabled = busy;
    $('#close-dialog').disabled = busy;
    $('#logo-file').disabled = busy;
    $('#upload-confirmation').disabled = busy;
    $('#dialog-progress').textContent = message;
    $('#submit-upload').textContent = busy ? 'Submitting…' : 'Submit for review';
  }
  function closeUpload() {
    if (busy) return;
    dialog.close();
    revokePreview();
    $('#logo-file').value = '';
    $('#upload-confirmation').checked = false;
    $('#preview-box').hidden = true;
    $('#file-description').textContent = 'Choose a clear image of your team’s official logo.';
    $('#dialog-progress').textContent = '';
    setError('');
    activeTeam = null;
  }
  function openUpload(id) {
    const team = allTeams.find(t => t.id === id);
    if (!team || busy) return;
    activeTeam = team;
    form.reset();
    revokePreview();
    $('#preview-box').hidden = true;
    setError('');
    $('#file-description').textContent = 'Choose a clear image of your team’s official logo.';
    $('#dialog-progress').textContent = '';
    $('#selected-team').textContent = team.name;
    $('#selected-league').textContent = team.league + (team.shotTeamId ? ' · SHOT ID: ' + team.shotTeamId : '');
    $('#dialog-heading').textContent = team.logoUrl ? 'Update your team logo' : 'Upload your team logo';
    setBusy(false);
    dialog.showModal();
  }
  async function optimizeImage(file) {
    if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type))
      throw Error('Choose a PNG, JPG, or WebP image.');
    if (file.size > 15 * 1024 * 1024) throw Error('The original image is too large. Choose one under 15 MB.');
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width < 48 || bitmap.height < 48) throw Error('Choose a logo at least 48 pixels wide and tall.');
      const scale = Math.min(1, 1500 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Unable to process this image.');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const encode = quality => new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      let image = await encode(.91);
      if (!image) throw Error('Unable to convert this logo to WebP.');
      if (image.size > 2097152) image = await encode(.75);
      if (image.size > 2097152) image = await encode(.52);
      if (!image || image.size > 2097152) throw Error('Image could not be optimized below 2 MB. Choose a smaller logo.');
      return image;
    } finally { bitmap.close(); }
  }
  async function prepareFile(file) {
    revokePreview();
    $('#preview-box').hidden = true;
    setError('');
    setBusy(true, 'Optimizing image...');
    try {
      const blob = await optimizeImage(file);
      selectedBlob = blob;
      selectedPreviewUrl = URL.createObjectURL(blob);
      $('#logo-preview').src = selectedPreviewUrl;
      $('#preview-size').textContent = Math.round(blob.size / 1024).toLocaleString() + ' KB · WebP';
      $('#preview-box').hidden = false;
      $('#file-description').textContent = clean(file.name);
      setBusy(false, '');
    } catch (e) {
      setBusy(false, '');
      setError(errMessage(e));
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !activeTeam || !selectedBlob || !$('#upload-confirmation').checked) return;
    const teamId = activeTeam.id;
    const blob = selectedBlob;
    setError('');
    setBusy(true, 'Reserving secure upload...');
    try {
      const reservation = await portalRequest('begin', {teamId});
      if (!reservation.path || !reservation.token || reservation.teamId !== teamId)
        throw Error('Invalid upload reservation. Please retry.');
      if (blob.size > Number(reservation.maxBytes || 2097152)) throw Error('Image exceeds upload limit.');
      setBusy(true, 'Uploading optimized logo...');
      const pathSegments = reservation.path.split('/').map(encodeURIComponent).join('/');
      const uploadUrl = apiRoot + '/storage/v1/object/upload/sign/' + bucket + '/' + pathSegments +
        '?token=' + encodeURIComponent(reservation.token);
      const multipart = new FormData();
      multipart.append('cacheControl','3600');
      multipart.append('', blob, 'logo.webp');
      const uploaded = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {'apikey': publicKey, 'x-upsert': 'false'},
        body: multipart
      });
      if (!uploaded.ok) {
        let details = {};
        try { details = await uploaded.json(); } catch {}
        throw Error(details.message || details.error || 'Unable to upload logo. Please retry.');
      }
      setBusy(true, 'Submitting logo for moderator review...');
      const complete = await portalRequest('complete', {teamId, path: reservation.path});
      if (!complete.ok) throw Error('The logo was uploaded but could not be queued for moderator review.');
      setBusy(false);
      closeUpload();
      notify(complete.status === 'pending' ? 'Logo submitted for moderator review. It will appear publicly after approval.' : 'Logo submission already reviewed.');
      await loadTeams();
    } catch (e) {
      setError(errMessage(e));
      setBusy(false, '');
    }
  }

  function reportStatus(message, isError = false) {
    const el = $('#report-status');
    el.textContent = message || '';
    el.className = 'report-status' + (isError ? ' error' : '');
  }
  function openReport(id) {
    const team = allTeams.find(t => t.id === id);
    if (!team || reportBusy) return;
    reportTeam = team;
    reportForm.reset();
    $('#reported-team-name').textContent = team.name;
    $('#report-team-reason').value = '';
    reportStatus('');
    reportDialog.showModal();
    $('#report-team-reason').focus();
  }
  function closeReport() {
    if (reportBusy) return;
    if (reportDialog.open) reportDialog.close();
    reportTeam = null;
    reportForm.reset();
    reportStatus('');
  }
  async function submitReport(event) {
    event.preventDefault();
    if (reportBusy || !reportTeam) return;
    const reason = $('#report-team-reason').value;
    const details = $('#report-details').value.trim();
    if (!['inactive','incorrect_details','other'].includes(reason)) {
      reportStatus('Choose the reason for this report.', true);
      return;
    }
    if (details.length > 500) {
      reportStatus('Please limit additional details to 500 characters.', true);
      return;
    }
    reportBusy = true;
    $('#report-submit').disabled = true;
    $('#report-cancel').disabled = true;
    $('#report-close').disabled = true;
    $('#report-submit').textContent = 'Sending report…';
    reportStatus('Sending this report to Texas SCTP moderators…');
    try {
      const response = await portalRequest('report_team',{teamId:reportTeam.id,reason,details});
      if (response.ok !== true) throw Error('The report was not confirmed.');
      reportBusy = false;
      closeReport();
      notify('Report received. A Texas SCTP moderator will review this team. Its listing remains visible unless staff confirms a change.');
    } catch (error) {
      reportStatus(errMessage(error), true);
    } finally {
      reportBusy = false;
      $('#report-submit').disabled = false;
      $('#report-cancel').disabled = false;
      $('#report-close').disabled = false;
      $('#report-submit').textContent = 'Send for moderator review';
    }
  }

  reportForm.addEventListener('submit', submitReport);
  $('#report-cancel').addEventListener('click', closeReport);
  $('#report-close').addEventListener('click', closeReport);
  reportDialog.addEventListener('cancel', e => {
    if (reportBusy) e.preventDefault();
    else reportTeam = null;
  });
  reportDialog.addEventListener('click', e => {
    if (e.target === reportDialog && !reportBusy) closeReport();
  });
  $('#find-team-upload').addEventListener('click', () => {
    $('#team-search').scrollIntoView({behavior:'smooth',block:'center'});
    $('#team-search').focus({preventScroll:true});
  });
  $('#team-search').addEventListener('input', render);
  $('#league-filter').addEventListener('change', render);
  $('#kind-filter').addEventListener('change', render);
  document.querySelectorAll('[data-status]').forEach(btn => btn.addEventListener('click', () => {
    setStatusFilter(btn.dataset.status);
    render();
  }));
  $('#close-dialog').addEventListener('click', closeUpload);
  $('#cancel-upload').addEventListener('click', closeUpload);
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); else closeUpload(); });
  dialog.addEventListener('click', event => { if (event.target === dialog && !busy) closeUpload(); });
  $('#logo-file').addEventListener('change', event => { if (event.target.files?.[0]) prepareFile(event.target.files[0]); });
  $('#upload-confirmation').addEventListener('change', () => setBusy(false, ''));
  const dropzone = $('#upload-dropzone');
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('dragover');
    if (busy || !e.dataTransfer?.files?.[0]) return;
    prepareFile(e.dataTransfer.files[0]);
  });
  form.addEventListener('submit', submit);
  if (!apiRoot || !publicKey) { statusMessage.textContent = 'The directory is not configured. Please contact Texas SCTP.'; }
  else loadTeams();
})();
