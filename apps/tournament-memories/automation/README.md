# Texas SCTP | On the Range: Facebook sharing bridge

**Integration target:** <https://www.facebook.com/TexasSCTP>

**Current status:** Prepared and tested only. **Not connected, scheduled or posting.** This directory is server-only staging integration code. The existing gallery is still a design preview. This repository must not automatically share generated sample images or treat gallery consent as permission for Facebook distribution.

## Intended no-touch publishing flow

1. Parent or authorized contributor submits tournament photos and separately opts in to Facebook distribution (not bundled with consent for gallery display).
2. Host-team moderator / State Advisor reviews and approves the exact image and optional public caption, including any required minor/guardian permissions.
3. Backend creates a durable, unique, *ready* Facebook publication outbox entry for eligible photo(s). Feature one image per eligible entry and cap output at roughly three shares per seven-day period, with fair team rotation and a spacing interval. Never auto-publish by likes alone.
4. A secure backend worker transactionally claims an eligible outbox entry, generates a short-lived signed photo URL for the approved asset (or provides an approved public URL), creates the payload using `buildFacebookPhoto`, and invokes `sendToZapier` with the secret URL stored on the backend.
5. Zapier **Webhooks: Catch Hook** receives `description`, `photo_url` and `publication_key`. The action **Facebook Pages: Create Page Photo** uses the account owner’s one-time authorized Texas SCTP Page connection, maps Photo to `photo_url` and Description to `description`.
6. Only after Facebook Pages returns success does the Zap call a secure backend acknowledgment endpoint with `publication_key` and Facebook post ID. The backend records `published`, Facebook post ID and timestamp. An unsuccessful Zap must remain queued or flagged for controlled retry. A 2xx from the Catch Hook **does not** confirm Facebook publishing.
7. Failed posts go to an exception queue. Unapproved, disputed, opt-out or removed photos never enter the workflow. Provide a revocation/removal process for posts already shared externally.

## Integration handoff contract

`facebook-share.mjs` exports `eligibility`, `buildFacebookPhoto` and `sendToZapier`.

A candidate must include:

```json
{
  "status": "approved",
  "socialConsent": true,
  "socialReviewed": true,
  "privacyHold": false,
  "outboxStatus": "ready",
  "postId": "UUID",
  "photoId": "UUID",
  "teamName": "Approved team display name",
  "tournamentName": "Approved tournament display name",
  "caption": "Reviewed caption (optional)",
  "captionSocialApproved": true,
  "photoUrl": "https://... approved, accessible image URL",
  "galleryUrl": "https://texas-sctp-tournament-memories-preview.onrender.com/#memory-UUID"
}
```

The outgoing JSON keys are `page_url`, `publication_key`, `source_post_id`, `source_photo_id`, `team_name`, `tournament_name`, `photo_url`, `gallery_url` and `description`.

## One-time integration steps that remain

- Connect the Texas SCTP Facebook Page to **Facebook Pages in Zapier** using the Page owner’s Meta authorization. Do not put Facebook or Zapier tokens in chat or source control.
- Authorize the Zapier Catch Hook -> Facebook Pages Create Page Photo -> backend acknowledgment chain.
- Complete the secure gallery backend, separate social-media permission field, moderator workflow, durable outbox, and HTTPS image access. Those features are *not implemented* in the current gallery preview.
- Store the Catch Hook URL only as a backend secret; never in a public JavaScript file or publicly accessible endpoint.
- Test one staff-owned/authorized photo with a nonpublic draft or test Page. Confirm acknowledgments and duplicate prevention before enabling unattended live posting.
- Define revocation handling, post limits, team fairness, error escalation, and token-expiry alerting. Only then activate scheduled execution.

Run tests: `node --test apps/tournament-memories/automation/facebook-share.test.mjs` from the repo root.

**No automatic posting is enabled by these files.** No new paid infrastructure is provisioned.
