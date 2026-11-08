/**
 * Texas SCTP | On the Range: Facebook sharing adapter (server-side only)
 *
 * This module prepares approved, social-consented gallery photos for a Zapier
 * Catch Hook -> Facebook Pages "Create Page Photo" workflow.
 *
 * IMPORTANT: not a scheduler, not a public API, and not a permission system.
 * The future gallery backend must enforce parental/guardian permission, local
 * moderation and a transactional publication outbox before invoking this.
 * No Facebook/Zapier credentials belong in the browser or Git repository.
 */

export const FACEBOOK_PAGE_URL = 'https://www.facebook.com/TexasSCTP';
export const GALLERY_ORIGIN = 'https://texas-sctp-tournament-memories-preview.onrender.com';

function plainText(value, max = 220) {
  return String(value ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validGalleryLink(value) {
  if (!validHttpsUrl(value)) return false;
  const url = new URL(value);
  // Only trusted Texas SCTP gallery links should be promoted.
  return url.origin === GALLERY_ORIGIN && /^(\/|\/index\.html)$/.test(url.pathname);
}

/**
 * Backend fields needed for automated Facebook promotion:
 * - status: 'approved' on the parent gallery post
 * - socialConsent: separate explicit opt-in from the uploader/authorized guardian
 * - socialReviewed: authorized representative approved the exact photo+caption
 * - privacyHold: not removed, disputed or held for review
 * - outboxStatus: 'ready' after transactional selection / de-duplication
 * - photoUrl: time-limited HTTPS photo URL minted server-side
 * - galleryUrl: share link to the approved post
 */
export function eligibility(item) {
  if (!item || typeof item !== 'object') return { ok: false, reason: 'missing_item' };
  if (item.status !== 'approved') return { ok: false, reason: 'not_gallery_approved' };
  if (item.socialConsent !== true) return { ok: false, reason: 'no_social_opt_in' };
  if (item.socialReviewed !== true) return { ok: false, reason: 'not_social_reviewed' };
  if (item.privacyHold === true) return { ok: false, reason: 'privacy_hold' };
  if (item.outboxStatus !== 'ready') return { ok: false, reason: 'not_queued' };
  if (item.facebookPostId || item.facebookPublishedAt) return { ok: false, reason: 'already_published' };
  if (!/^[0-9a-f-]{36}$/i.test(String(item.postId ?? '')) ||
      !/^[0-9a-f-]{36}$/i.test(String(item.photoId ?? ''))) {
    return { ok: false, reason: 'missing_post_identity' };
  }
  if (!validHttpsUrl(item.photoUrl)) return { ok: false, reason: 'unusable_photo_url' };
  if (!validGalleryLink(item.galleryUrl)) return { ok: false, reason: 'untrusted_gallery_url' };
  return { ok: true };
}

export function buildFacebookPhoto(item) {
  const status = eligibility(item);
  if (!status.ok) throw new Error(`Cannot prepare Facebook photo: ${status.reason}`);
  const team = plainText(item.teamName, 100) || 'a Texas SCTP team';
  const tournament = plainText(item.tournamentName, 120) || 'a Texas SCTP tournament';
  const caption = item.captionSocialApproved ? plainText(item.caption, 180) : '';
  const message = [
    'TEXAS SCTP | ON THE RANGE',
    `${team} in action at ${tournament}.`,
    caption || null,
    `See more tournament photos and share the action: ${item.galleryUrl}`,
    '#TexasSCTP #OnTheRange',
  ].filter(Boolean).join('\n\n');
  return {
    page_url: FACEBOOK_PAGE_URL,
    publication_key: `${item.postId}:${item.photoId}:facebook:v1`,
    source_post_id: item.postId,
    source_photo_id: item.photoId,
    team_name: team,
    tournament_name: tournament,
    photo_url: item.photoUrl,
    gallery_url: item.galleryUrl,
    description: message,
  };
}

function checkZapierHook(hookUrl) {
  if (!validHttpsUrl(hookUrl)) throw new Error('Zapier webhook URL must be HTTPS');
  const url = new URL(hookUrl);
  if (url.hostname !== 'hooks.zapier.com' || !url.pathname.startsWith('/hooks/catch/')) {
    throw new Error('Webhook must be a Zapier Catch Hook URL');
  }
  return url.href;
}

/**
 * Sends ONE eligible, previously claimed outbox item to Zapier.
 * A 2xx response means only Zapier accepted the webhook. It does NOT prove
 * Facebook published the photo. The Zap must acknowledge success back to the
 * backend using the same publication_key and the Facebook post ID.
 *
 * Caller must handle retries, outbox leases and publication acknowledgments.
 */
export async function sendToZapier(item, { hookUrl, fetchImpl = fetch, signal } = {}) {
  const endpoint = checkZapierHook(hookUrl);
  const payload = buildFacebookPhoto(item);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw new Error(`Zapier did not accept the publication (${response.status})`);
  return { accepted: true, publicationKey: payload.publication_key };
}
