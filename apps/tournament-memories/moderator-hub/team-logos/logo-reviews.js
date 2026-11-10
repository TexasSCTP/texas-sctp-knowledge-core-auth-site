/* Statewide-only logo review queue. All authorization is enforced by the Edge Function. */
export function createLogoReviewQueue({request,onReviewSaved,apiRoot}) {
  const $ = selector => document.querySelector(selector);
  const itemsRoot = $('#logo-review-items');
  const selection = $('#logo-review-filter');
  const pendingCount = $('#logo-review-count');
  const emailStatus = $('#logo-email-status');
  const queueStatus = $('#logo-review-status');
  const stat = $('#stat-pending-logos');
  let submissions = [];
  let busy = false;
  let mailReady = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function signedLogo(url) {
    if (typeof url !== 'string' || !url) return null;
    try {
      const parsed = new URL(url, apiRoot);
      if (parsed.origin !== new URL(apiRoot).origin ||
          !parsed.pathname.startsWith('/storage/v1/object/sign/memories-team-logos/')) return null;
      return parsed.href;
    } catch { return null; }
  }
  function status(message, error = false) {
    queueStatus.textContent = message;
    queueStatus.className = 'logo-review-status' + (error ? ' error' : '');
  }
  function imageFigure(src, label, teamName) {
    const figure = el('figure', 'logo-review-figure');
    figure.append(el('figcaption', '', label));
    const art = el('div', 'logo-review-art');
    const url = signedLogo(src);
    if (url) {
      const image = el('img', '');
      image.src = url;
      image.alt = label + ': ' + teamName;
      image.loading = 'lazy';
      image.onerror = () => art.replaceChildren(el('span', '', 'Preview unavailable'));
      art.append(image);
    } else {
      art.append(el('span', '', label === 'Currently published' ? 'No published logo' : 'Preview unavailable'));
    }
    figure.append(art);
    return figure;
  }
  async function act(item, approve) {
    if (busy) return;
    if (!approve && !window.confirm('Reject the submitted logo for ' + item.teamName + '? Its current published logo will remain unchanged.')) return;
    busy = true;
    status((approve ? 'Approving ' : 'Rejecting ') + item.teamName + '…');
    render();
    try {
      const result = await request('staff_logo_review', {submissionId:item.id, approve});
      if (result?.ok !== true) throw Error('Review was not confirmed.');
      status(item.teamName + (approve ? ' approved and published.' : ' rejected. Existing published logo unchanged.'));
      if (typeof onReviewSaved === 'function') await onReviewSaved();
      else await load();
    } catch (error) {
      status('Could not save review: ' + error.message, true);
      await load();
    } finally {
      busy = false;
      render();
    }
  }
  async function retry(item) {
    if (busy || !mailReady) return;
    busy = true;
    status('Retrying moderator email for ' + item.teamName + '…');
    render();
    try {
      const result = await request('staff_logo_notify_retry', {submissionId:item.id});
      if (!result?.ok) throw Error('Server did not confirm retry.');
      await load();
      status((result.delivery?.sent || 0) + ' moderator email(s) sent. See the alert status on the card for any remaining problems.');
    } catch(error) {
      status('Could not send email: ' + error.message, true);
    } finally { busy = false; render(); }
  }
  function card(item) {
    const box = el('article', 'logo-review-card');
    const top = el('div', 'logo-review-card-head');
    const info = el('div');
    info.append(el('h3', '', item.teamName));
    const meta = el('p', '', (item.league || 'Assignment Pending') +
      (item.shotTeamId ? ' · SHOT ID ' + item.shotTeamId : '') +
      ' · Submitted ' + (item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'recently'));
    info.append(meta);
    const label = el('span', 'logo-review-status-pill ' + item.status, item.status === 'pending' ? 'Awaiting review' : item.status);
    top.append(info, label);
    box.append(top);
    const images = el('div', 'logo-review-images');
    images.append(imageFigure(item.logoUrl, 'Submitted logo', item.teamName));
    images.append(imageFigure(item.previousLogoUrl, 'Currently published', item.teamName));
    box.append(images);
    const bottom = el('div', 'logo-review-card-bottom');
    const delivery = el('span', 'logo-review-mail-note', 'Email: ' +
      ({sent:'Sent to moderator',failed:'Delivery failed',not_configured:'Sending service not configured',
        pending:'Sending pending',unavailable:'No delivery record'}[item.deliveryStatus] || 'Pending'));
    bottom.append(delivery);
    if (item.status === 'pending') {
      const controls = el('div', 'logo-review-actions');
      const approve = el('button','button button-gold','Approve & publish');
      const reject = el('button','button button-outline','Reject');
      approve.type = reject.type = 'button';
      approve.disabled = reject.disabled = busy;
      approve.addEventListener('click',()=>act(item,true));
      reject.addEventListener('click',()=>act(item,false));
      controls.append(approve,reject);
      if (mailReady && ['failed','not_configured','unavailable'].includes(item.deliveryStatus)) {
        const resend = el('button','button button-light','Retry email');
        resend.type = 'button';
        resend.disabled = busy;
        resend.addEventListener('click',()=>retry(item));
        controls.append(resend);
      }
      bottom.append(controls);
    } else if (item.reviewedAt) {
      bottom.append(el('span','logo-review-mail-note','Reviewed '+new Date(item.reviewedAt).toLocaleString()));
    }
    box.append(bottom);
    return box;
  }
  function render(){
    const pending = submissions.filter(s=>s.status==='pending').length;
    stat.textContent = String(pending);
    pendingCount.textContent = pending + (pending === 1 ? ' logo awaiting review' : ' logos awaiting review');
    emailStatus.textContent = mailReady
      ? 'Email alerts are configured. A notification is attempted when each submission is received.'
      : 'Email alerts need a verified sender and Resend credentials. Pending submissions are still retained for review.';
    emailStatus.className = 'logo-email-status' + (mailReady ? ' configured' : ' needs-setup');
    const shown = selection.value === 'all' ? submissions : submissions.filter(s=>s.status==='pending');
    itemsRoot.replaceChildren();
    if (!shown.length) itemsRoot.append(el('p','logo-review-empty',selection.value==='all'
      ? 'No logo submissions have been received yet.' : 'No logos awaiting review.'));
    else itemsRoot.append(...shown.map(card));
  }
  async function load(){
    if (busy) return;
    status('Loading team logo submissions…');
    try {
      const data = await request('staff_logo_queue');
      if (!Array.isArray(data.submissions)) throw Error('Incomplete review queue response.');
      submissions = data.submissions;
      mailReady = data.emailConfigured === true;
      render();
      status('');
    } catch (error) {
      status('Unable to load team logo reviews: ' + error.message, true);
    }
  }
  $('#logo-review-refresh').addEventListener('click',load);
  selection.addEventListener('change',render);
  return {load};
}
