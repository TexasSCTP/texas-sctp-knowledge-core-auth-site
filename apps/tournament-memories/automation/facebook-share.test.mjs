import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibility, buildFacebookPhoto, sendToZapier } from './facebook-share.mjs';

const valid = () => ({
  status: 'approved', socialConsent: true, socialReviewed: true,
  privacyHold: false, outboxStatus: 'ready',
  postId: '63a0b071-03ac-479b-8a41-d2f9c4c7e731',
  photoId: '6845f568-a3b9-41fd-b1f7-d4e68c70a108',
  teamName: 'Northwest Texas Team', tournamentName: 'Gobble Gobble Shoot',
  photoUrl: 'https://valid.example.org/signed/picture.jpg',
  galleryUrl: 'https://texas-sctp-tournament-memories-preview.onrender.com/#memory-63a0b071-03ac-479b-8a41-d2f9c4c7e731',
  caption: 'A great team moment', captionSocialApproved: true,
});

test('approved and separately authorized image can be queued', () => {
  assert.equal(eligibility(valid()).ok, true);
});

test('gallery approval alone never authorizes Facebook publishing', () => {
  const x = valid(); x.socialConsent = false;
  assert.deepEqual(eligibility(x), { ok: false, reason: 'no_social_opt_in' });
});

test('social opt-in still requires local review', () => {
  const x = valid(); x.socialReviewed = false;
  assert.equal(eligibility(x).reason, 'not_social_reviewed');
});

test('pending and privacy-held posts cannot be shared', () => {
  const x = valid(); x.status = 'pending';
  assert.equal(eligibility(x).reason, 'not_gallery_approved');
  x.status = 'approved'; x.privacyHold = true;
  assert.equal(eligibility(x).reason, 'privacy_hold');
});

test('requires transactional outbox readiness and avoids already posted photos', () => {
  const x = valid(); x.outboxStatus = 'sent';
  assert.equal(eligibility(x).reason, 'not_queued');
  x.outboxStatus = 'ready'; x.facebookPostId = 'fbid';
  assert.equal(eligibility(x).reason, 'already_published');
});

test('requires trusted HTTPS gallery URL and HTTPS photo URL', () => {
  const x = valid(); x.photoUrl = 'http://example.org/pic.jpg';
  assert.equal(eligibility(x).reason, 'unusable_photo_url');
  x.photoUrl = 'https://valid.example.org/pic.jpg'; x.galleryUrl = 'https://random.example.com/a';
  assert.equal(eligibility(x).reason, 'untrusted_gallery_url');
});

test('caption is omitted unless separately reviewed, and post contains shareable gallery link', () => {
  const x = valid(); x.caption = 'Never publish unreviewed text'; x.captionSocialApproved = false;
  const p = buildFacebookPhoto(x);
  assert.ok(!p.description.includes(x.caption));
  assert.ok(p.description.includes(x.galleryUrl));
  assert.equal(p.page_url, 'https://www.facebook.com/TexasSCTP');
});

test('duplicate key is stable per approved image', () => {
  const x = valid();
  assert.equal(buildFacebookPhoto(x).publication_key, buildFacebookPhoto(x).publication_key);
});

test('Zapier webhook is called only with eligible posts', async () => {
  let count = 0;
  const fetchImpl = async (url, opt) => {
    count++;
    assert.equal(url, 'https://hooks.zapier.com/hooks/catch/123/456/');
    assert.equal(opt.method, 'POST');
    assert.equal(JSON.parse(opt.body).source_photo_id, valid().photoId);
    return { ok: true, status: 200 };
  };
  const result = await sendToZapier(valid(), { hookUrl: 'https://hooks.zapier.com/hooks/catch/123/456/', fetchImpl });
  assert.equal(result.accepted, true);
  assert.equal(count, 1);
});

test('never sends to arbitrary URLs', async () => {
  await assert.rejects(
    () => sendToZapier(valid(), { hookUrl: 'https://untrusted.example.com/catch', fetchImpl: () => { throw Error('should not run'); } }),
    /Zapier Catch Hook URL/
  );
});
