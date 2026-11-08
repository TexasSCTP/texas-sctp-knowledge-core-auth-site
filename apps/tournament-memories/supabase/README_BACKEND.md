# Dedicated Texas SCTP gallery backend: installation and verification

**DEPLOYED BACKEND STATUS, November 8, 2026:** Dedicated Supabase project [Texas SCTP On the Range Gallery](https://supabase.com/dashboard/project/mlajcbnuponqyoehxydp) was created at an explicitly approved **$10/month**. Region: us-east-2. Schema and all RLS fixes applied to this project only; seed catalog 171 teams / 48 tournaments. Edge Functions `guest-memories` and `social-publisher` deployed ACTIVE. Staging Render frontend wired read-only with public URL/publishable API key. SQL tests validated public approval visibility, hidden pending posts/photos/comments and no unassigned moderator approval. Social channels `enabled=false`, zero scheduled jobs, zero posts. **Do not claim live uploads, moderation or Facebook/Instagram publishing yet.** Cloudflare Turnstile site/secret + private Edge secrets are missing; staff Auth provisioning, integration tests and Meta/Zapier authorizations remain. No Team Accounts, Scholarship or Knowledge Core project changes. Two follow-up migration files correct initial nested RLS issues.

## Files

- `migrations/20261108180000_on_the_range_backend.sql`: restricted database, moderation, upload records, protected social queue, private storage bucket, RLS and roles.
- `seed_reference.sql`: 171 public-safe team labels and 48 tournament labels from the existing static gallery catalog. Event details need periodic source reconciliation and verification before publication.
- `functions/guest-memories/index.ts`: public but CAPTCHA-protected, rate-limited, two-phase uploads with verified file completion; comments, reactions.
- `functions/social-publisher/index.ts`: disabled-by-default, fair-rotation, per-channel dispatch, photo URLs, Zapier acknowledgment, retention cleanup.
- `config.toml`: `verify_jwt=false` for public guest gateway and separately secret-authenticated publisher.
- `activate_schedules.sql`: safe template for cron jobs, Vault secrets, and final channel enablement; intentionally NOT executed until accounts and secrets are ready.
- `../automation/ZAPIER_SETUP.md`: field mappings and Meta permissions.

## Safe deployment order (once dedicated project is authorized)

1. Create only the **dedicated** Supabase project after explicit nonzero-cost approval.
2. Run the migration against that dedicated project. Inspect security advisors, RLS, and storage policies.
3. Load `seed_reference.sql`, verify team/event counts and correct upcoming events using an authoritative schedule before enabling public submissions.
4. Create a Cloudflare Turnstile widget for the Render hostname. Set secrets `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAMES`, `MEMORIES_RATE_SECRET` (32+ random chars), `MEMORIES_ALLOWED_ORIGINS` in Supabase Edge Function secrets. Do NOT publish secrets in GitHub.
5. Deploy `guest-memories`, keeping verify_jwt disabled but Turnstile required and rate limiting fail-closed. Deploy `social-publisher`, keeping its secret-authenticated API and both channels **disabled**.
6. Configure only dedicated-project public URL, public publishable key and Turnstile site key in `config.js` on the staging branch. Trigger the existing Render static-site deployment.
7. Create/invite approved staff users in Supabase Auth, disable unapproved public signups, assign them to `memory_moderators` using actual `auth.users.id` values and their team IDs; NULL team ID means statewide moderator. Never grant via guessed emails or automatic public registration.
8. Verify end-to-end: guest CAPTCHA, signed upload, staff approval, public feed, image RLS, negative/overlimit tests, comments, account permission tests, photo takedown and retention cleanup. Do not launch if pending photos are publicly accessible or if guests can change moderation status.
9. Connect official social accounts in Zapier; test on a permitted staff-owned image. Configure independent webhook URLs and secret acknowledgment, and verify duplicate prevention and exact real Meta IDs.
10. Store scheduler secrets in Supabase Vault and run `activate_schedules.sql` *only after* step 9. Finally enable each `memory_social_channels` row intentionally. Until then every social channel stays OFF.

## Privacy notes

Gallery approval, social distribution consent and social-review approval are separate. A submitted consent checkbox is an attestation, not legal proof of all guardian permissions. Review team/athlete photo-release practices before statewide launch.

Signed URLs to approved private images can be shared and last until expiry, even after a gallery takedown. Public image access is never permanent; external Facebook/Instagram copies require separate Meta removals. Moderators can remove gallery posts. This blocks new exposure and marks any published external IDs for removal.

The gallery deliberately does not ingest athlete rosters, ages or other protected operational details. Prefer minimal storage, no analytics trackers, and periodic exception audits.

## Automated tests

- Run `node --test tests/backend-invariants.test.mjs` from `apps/tournament-memories`.
- Run `node --experimental-strip-types --check supabase/functions/guest-memories/index.ts` and same for `social-publisher`.
- Tests are static/source-contract checks. **Actual live security tests must run against the dedicated Supabase project before launch.**
