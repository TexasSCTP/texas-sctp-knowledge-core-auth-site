# Texas SCTP On the Range | Individual Photo Report and Disposition Workflow

Implemented on the staging website on November 10, 2026. Production is intentionally unchanged.

## Visitor experience

Each regular gallery card shows a discreet **Flag photo for review** link immediately beneath the photograph. The expanded multi-photo viewer provides a separate flag action for the currently selected image, ensuring the report points to an exact photo ID instead of just a tournament post.

The form requires one reason and detailed comments (12–1,200 characters). Reasons: Privacy/consent (including minors), removal request, athlete safety, inappropriate content, copyright/ownership, correction, or other. Reporter name and email are optional. The report remains private. After successful submission, visitors receive a confirmation and abbreviated reference number.

No CAPTCHA, account registration, or public report thread is added. A report alone never removes a photograph.

## Server-side intake and privacy

- Public intake: existing **guest-memories** Supabase Edge Function with new `action: 'report'` (version 11).
- The function validates the exact photo, confirms approved/current visibility, validates the reason/comments/contact, rejects its honeypot, prevents near-duplicate submissions, and applies server-side HMAC-based request limits (4 per hour per visitor, 350 per day globally).
- Protected table: `public.memory_photo_reports`. Only authenticated moderators authorized for the source team can read records through RLS. Anonymous users cannot read it or directly insert, update, or delete rows.
- Reporter contact details are only displayed within the authorized moderator queue.
- Reports are **not** exposed in gallery posts, comments, public search, or visitor profiles.

## Moderator workflow

**Moderator Hub → Review flagged photographs** opens **On the Range Moderation → Photo flags**.

Staff see the actual photo, team, tournament, reason, reporter comments, optional follow-up contact, current visibility, and a case reference. Cases are divided into **Needs review** and **Disposition history**.

1. **Start review:** Status becomes `in_review`; no public visibility change.
2. **Keep photo:** Status becomes `retained`; image stays public.
3. **Dismiss report:** Status becomes `dismissed`; image stays public.
4. **Remove photo:** A decision note is required. The selected image is hidden from the normal gallery and homepage hero. Original storage remains for audit. Queued social publishing for this image is cancelled where possible. Any in-flight or already published Facebook/Instagram copy is marked `removal_required` for separate Meta action.
5. **Restore to gallery:** A decision note is required. The image returns to the gallery. Its hero visibility and social publication are deliberately **not** auto-restored.

All dispositions run through `public.memory_staff_review_photo_report`, which delegates to a protected `memories_private` routine that checks team authorization and creates an immutable audit event. Staff cannot bypass the workflow by directly updating the report table.

A single removed photo does not delete the entire post or other photos in that same submission. When a post has no visible photos, it is omitted from the public gallery feed.

The Moderator Hub displays the number of open photo reports and refreshes that count every minute while an authenticated staff member has the Hub open. The moderation page offers a manual **Refresh queue** action.

## Operational boundaries

- Automatic delivery is to the **authenticated Moderator Hub / photo-report queue**. No external email notification service is connected to this workflow at present, so do not promise email delivery or unattended email alerts.
- Sensitive concerns, especially minors' privacy or safety, should be reviewed promptly by Texas SCTP staff.
- Source photos are in a private bucket. A signed viewing URL issued before a photo was hidden may remain usable until its original expiry (normally up to one hour). New public gallery access is blocked after removal. This is not an instant global revocation of already issued links.
- Reports are not automatically judged based only on a visitor allegation.
- Restoration requires a separate decision. Neither automatic Meta deletion nor automatic restoration of social and hero approvals is performed.
- No public roll-out or DNS changes are authorized by this work.

## Tests completed

Backend transaction tests confirmed both remove and restore actions, with rollback preserving all existing photos. Public report reading and disposition rights were denied. Build-time checks verify the per-photo flag, required report fields, protected moderator action, and Hub queue link.

A live end-user browser submission must still be verified on staging prior to production promotion.
