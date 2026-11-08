# Texas SCTP | On the Range — Facebook + Instagram publishing automation

**Staging status:** backend source prepared. No Meta or Zapier authorization exists here. Nothing is connected or publishing. Activating real social sharing requires the official Facebook Page/Instagram permissions, Zapier connection, and a dedicated gallery backend.

## Exact two Zap workflows

**Zap A — Facebook**

1. Trigger: **Webhooks by Zapier > Catch Hook** (keep the unique Catch Hook URL server-side only).
2. Action: **Facebook Pages > Create Page Photo**.
   - Page = `Texas SCTP` (`facebook.com/TexasSCTP`)
   - Photo = incoming `photo_url`
   - Description = incoming `description`
3. Action: **Webhooks by Zapier > Custom Request** (or POST) to `https://DEDICATED_PROJECT.supabase.co/functions/v1/social-publisher`, JSON:
   `{"action":"ack","platform":"facebook","publication_key":"<map incoming publication_key>","external_post_id":"<map Facebook photo/post ID>"}`
   - Header `x-ack-secret: <SOCIAL_ACK_SECRET>` (stored privately in Zapier and Supabase)
4. A failure in step 2 must **never** run the acknowledgment. Keep an error record and notify a delegated admin. Do not automatically retry unknown outcomes.

**Zap B — Instagram**

1. Trigger: **Webhooks by Zapier > Catch Hook** (a DIFFERENT URL, server-side only).
2. Action: **Instagram for Business > Publish Photo(s)**.
   - Account = official `@texassctp`, NOT personal `@mrja132023`
   - Media = incoming `image_url` (24-hour signed image URL)
   - Caption = incoming `caption`
3. Action: **Webhooks by Zapier > Custom Request** (or POST) to the same Supabase endpoint, JSON `{"action":"ack","platform":"instagram","publication_key":"<map incoming publication_key>","external_post_id":"<map Instagram media ID>"}` with `x-ack-secret` header.
4. Failure and acknowledgment rules match Facebook.

Zapier's integration actions and names may evolve. Confirm action availability in the connected account before activation. Do not share Zap hooks/keys in browser code or chat.

## Workflow controls

- Only a real photo uploaded by an authorized contributor is eligible. AI-generated demo scenes are never social candidates.
- The contributor separately opts in to official Facebook and Instagram promotion. Guardian permissions remain the submitter's attestation, and moderators must review for minors/privacy.
- A local team moderator or State Advisor checks the exact photo and caption and clicks **Approve + Spotlight**. Gallery-only approvals cannot enter the social queue.
- A database trigger queues **one** approved photo per submission for each channel. Each photo/platform key is unique.
- Each channel defaults **OFF**, with a maximum of 3 posts in the trailing 7 days and a 5-day same-team cooldown. A secure scheduled function claims an eligible item transactionally.
- Signed photo URLs expire after 24 hours and are never stored permanently in the Zap payload queue.
- Zapier receiving a webhook means **accepted**, not published. The independent acknowledgment must provide the real Meta ID. An uncertain result stays out of automatic retries to avoid duplicates.
- Removing gallery consent stops future publishing. If already published, staff must use the recorded Meta post ID to remove the external post; deleting the gallery alone cannot remove Meta's copy.
- A daily cleanup removes expired draft uploads (48+ hours) and old rejected submissions (30+ days), but never removes approved or externally published records automatically.
- Queue failures should alert a delegated staff member through a Zapier alert/notification workflow. No routine manual review or weekly content selection is necessary, but exceptions still need human resolution.

## Credentials: server-only

Supabase Edge Function secrets (not in GitHub or the browser):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: provided by dedicated Supabase project.
- `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAMES`, `MEMORIES_RATE_SECRET`, `MEMORIES_ALLOWED_ORIGINS`.
- `SOCIAL_PUBLISHER_SECRET`: 32+ random characters, used by scheduled jobs.
- `SOCIAL_ACK_SECRET`: independent 32+ character key, used by Zapier acknowledgment.
- `SOCIAL_FACEBOOK_ZAPIER_HOOK`, `SOCIAL_INSTAGRAM_ZAPIER_HOOK`: private Zapier Catch Hook URLs.
- `SOCIAL_GALLERY_ORIGIN`: approved gallery URL, currently the Render preview domain.

Only the dedicated project's URL, **publishable** key and Turnstile **site** key go into `config.js`.

## Meta prerequisite

The official `@texassctp` Instagram Business account must be connected to the Texas SCTP Facebook Page with adequate publishing permissions. Screenshots from November 8, 2026 showed the Facebook Page connected to a personal Instagram account in the portfolio called Jason Anderson. Do not authorize automation against that Instagram account. Wait for Texas SCTP organizational access and correct ownership/connection before enabling either channel.
