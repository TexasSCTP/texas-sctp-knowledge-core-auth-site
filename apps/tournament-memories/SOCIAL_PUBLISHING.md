# Texas SCTP | Tournament Memories | Social Publishing

## Adult uploader authorization and privacy (November 9, 2026)

The On the Range submission form now collects the full name, email address, and role of the adult authorizing the photographs. Uploaders must confirm they are at least 18 years old, give explicit website publishing permission, and separately choose whether they authorize Facebook/Instagram publication. Social permission is unchecked by default and optional.

- The accepted photo authorization version is `TXSCTP_ON_THE_RANGE_2026_11_09_V1`.
- `photo-use-policy.html` is a linked, public Photo Use & Privacy Notice. It explains intellectual property, minors, scope of publication, copying by third parties, contact details, removal requests, and private handling of uploader records.
- `guest-memories` requires a valid adult authorizer, email, role, and version. The frontend also validates these items before initiating uploads.
- Each authorization is recorded server-side in `memories_private.memory_photo_authorizations`. The record is append-only and includes full name, email, role, accepted gallery/social terms, optional social status, acceptance timestamp, related photo paths, and an HMAC request fingerprint. The uploader's details are not displayed publicly.
- Only the backend service role may insert records. Public visitors and normal authenticated users cannot read or change the private audit table.
- Authorized moderators can see authorizer contact details and role via the team-scoped staff authorization RPC on Photo Submissions and Social Publishing.
- Previous submissions **do not inherit this new authorization automatically**, even when an older social-consent flag exists. The social queue now requires this named-adult authorization evidence. A new authorized submission must be obtained before sharing an older image on Facebook or Instagram.
- Authorization records alone do not prove legal authority to consent for every minor in a group image; appropriate parental/guardian permissions and any separately required releases still need verification.


## What was built (November 9, 2026)

A dedicated **Social Publishing** tab inside the existing Texas SCTP moderator interface, with Texas SCTP navy, gold, burnt-orange and responsive styling.

It is part of the existing photo gallery. No separate moderator login, third-party admin site, or CAPTCHA is required.

### Moderator workflow

1. Open the Tournament Memories gallery and use **Staff access** to sign in with an existing authorized moderator account.
2. Choose **Moderation** (the footer button or moderator header control).
3. Click **Social publishing**, next to **Photo submissions** and **Comments**.
4. Browse already gallery-approved memories. Each card shows its team, tournament, date and whether social-media permission is recorded. A gallery-approved photo with no recorded social permission cannot be queued.
5. Select the **specific** photo from that submission (not automatically the first image).
6. Choose **Facebook**, **Instagram**, or both.
7. Edit the approved social caption; expand the preview to see the caption, team/tournament introduction, gallery URL and hashtags.
8. Explicitly confirm that the chosen photo, caption and required permissions (including guardian consent for minors where applicable) have been reviewed.
9. Click **Approve & Queue**. The database records the moderator, chosen photo, chosen channels, approved caption and approval timestamp. It does not post while the respective platform is disabled.
10. Inspect the **Publishing history** table for queued, canceled, failed, accepted and published status and Meta IDs. Ready/held/failed items can be canceled. Accepted/published items must be handled on Meta and may need removal review.

### Separate guest sharing permission

The guest photo-submission form now offers a separate, **unchecked by default**, social-media permission option. It is distinct from required permission to display photos in the Tournament Memories gallery. Server-side submission handling already accepts and stores the `socialConsent` Boolean.

Legacy gallery submissions may have historical social-consent flags. Moderators must verify actual permission independently for those records before queuing them.

### Publication controls and safeguards

- The legacy database trigger is retained only for **cancellation/removal tracking** when consent, gallery approval, or privacy status changes. It no longer automatically queues the first photo to every platform.
- Explicit queueing runs through `public.memory_staff_queue_social` and a private guarded function. It requires a signed-in `memory_moderators` staff member authorized for that team.
- It also requires approved gallery status, a matching photo in that submission, explicit social permission, no privacy hold, and one or two supported platforms.
- The social queue records the chosen image and an editorial caption, preserving the original gallery caption.
- One record is allowed per photo/platform. Duplicate queue requests do not create duplicate publication rows.
- The publisher reads the chosen approved caption from the queue, rather than replacing it with an unapproved guest caption.
- A separate staff-only cancellation action prevents pending publication of a queued item.
- Anonymous visitors cannot invoke queue, cancel, or queue-claim functions.
- Moderators can read publishing history under team-scoped row-level security; they cannot use public database access to manipulate the queue.
- Existing privacy hold and consent-withdrawal logic remains in force, including a `removal_required` flag for content already handed to Meta.
- A Facebook photo post is **not** marked published when Zapier merely accepts the webhook. The acknowledgment must carry the real external post ID and the protected acknowledgment secret.
- Facebook and Instagram publishing remain **disabled** until controlled testing and explicit activation.
- Publishing frequency remains limited by the `memory_social_channels` setting, currently 3 per 7 days per channel.
- CAPTCHA was removed from guest uploads/comments, with the existing honeypot, HMAC-based per-origin abuse limits and global rate limits retained on the server.

### Files

- `index.html`: Loads the social module before `app.js`.
- `social-publishing.js`: Moderator photo choice, social approvals, caption editor, preview, history, queue and cancellation.
- `social-publishing.css`: Independent styling layer preserving the existing Team Logos and slideshow layouts.
- `app.js`: Adds the third moderation tab, explicit guest social permission, and event handling.
- `styles.css`: Existing responsive Texas SCTP styling is preserved.
- `scripts/build-static.mjs`: Copies the module into the published static directory.
- Render staging service: `srv-dbnot895efls73bujcfg`, sourced from `TexasSCTP/texas-sctp-knowledge-core-auth-site`, uses a manual deployment. Do not confuse this with the similarly named private `TexasSCTP/Texas-SCTP` repository, which is not connected to the Render gallery.

### Deployment / test checklist

The application files are committed to the staging branch `staging/tournament-memories-preview` in the Render-connected repository `TexasSCTP/texas-sctp-knowledge-core-auth-site`. The Supabase schema/function changes are applied in the dedicated Tournament Memories project `mlajcbnuponqyoehxydp`.

Implemented verification: JavaScript syntax checks; mock moderator review with a photo choice and a denial for a non-consented submission; PostgreSQL function permission checks; no queue created by migration; existing pending-comment grants; and continued Facebook/Instagram channel disablement.

Before a live publication: confirm the Render static build has deployed, sign in as the authorized moderator, visually verify an actual photo preview, select a photo with documented social permission, **activate the approved Zap only as part of a controlled live test**, and verify the real Facebook post ID is acknowledged and stored. Do not activate Instagram until its account/connection and publication process are independently tested.

**Important:** Committing GitHub code or receiving HTTP 200 from Zapier is not proof of live Facebook/Instagram publication.
