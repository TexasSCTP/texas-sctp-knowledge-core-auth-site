# Texas SCTP | On the Range - Team Logo Management

## One approved logo per team

Gallery logo association lives in `public.memory_team_logos`, keyed by `memory_teams.id`. An approved team logo appears automatically on every approved gallery post tagged with that team, including existing and future photos. A logo is optional. Missing logos display initials.

**Public photos and the Texas SCTP organization logo are not replaced or altered.** Logos identify the individual team on its gallery cards and photo detail pages.

## How logos arrive

- **Optional photo submission:** A visitor selects a team, adds an optional PNG/JPG/WebP logo, and explicitly confirms permission for public display. Cloudflare Turnstile verifies the photo upload. The service generates a short-lived signed upload slot in the separate private `memories-team-logos` bucket. The proposal appears in Moderation > Team logos with status `pending`. It does not replace an existing logo until an authorized moderator approves it.
- **Moderator:** Moderation > Team logos > Team logo library lets an authorized moderator select a team, choose the source, upload or replace a logo, or remove the association. The gallery serves reduced WebP copies (up to 2 MB), while the original source remains wherever it was stored. Replacements automatically update every post sharing that team ID.
- **Other approved channels:** A moderator can upload a permitted copy supplied by a coach or from a previously approved repository. The source is recorded as `moderator`, `team_accounts`, or `external`. Every import requires independent public-display permission.

Staff rights remain scoped to `memory_moderators`. An anonymous visitor cannot modify team logos or view pending submissions. The moderator review operation is a transactional `memory_review_team_logo_request` RPC with Row Level Security (RLS) and actor audit fields.

## Existing Team Accounts portal reuse

Verified on November 8, 2026: the separate **Texas SCTP Team Accounts** Supabase project stores private team logo files in the `team-logos` bucket, with `team_logo_submissions` status `active` or `approved`. The Team Accounts React component displays the latest such logo only to authorized team members. An `active` portal logo **has not been approved for public gallery display**, so it must not be automatically made public.

For now, an authorized portal user may download or otherwise obtain the team's logo in the normal approved process. A Texas SCTP gallery moderator then selects that team in **Team logo library**, chooses **Existing Team Accounts logo (authorized copy)** and uploads it, after confirming permission for public use. The gallery holds its own approved copy. No portal passwords, financial tables, team membership records, or private portal storage URLs are sent to the public website.

**Automatic cross-project importing is not enabled.** It would require a deliberately authorized server-to-server identity mapping, a narrowly scoped read pathway for private portal assets, and approval before publication. Do not embed a Team Accounts service key or secret URL in the gallery browser.

### Identifier mapping

The two projects have different IDs: Team Accounts uses UUID `teams.id`; the gallery uses its own `memory_teams.id` and also retains the SHOT Team ID. Always match by an independently verified SHOT identifier or approved mapping, never a fuzzy team-name guess. Example only: Keller Clay Target Team is identified by SHOT **2270** in the official crosswalk, while its gallery record is `demo-team-90`. This is *not* consent to publish Keller's currently private portal logo.

## Security and quality checks

- Storage in both projects stays private, with time-limited signed download URLs for approved gallery assets.
- Accepted PNG/JPEG/WebP images are decoded, resized, and re-encoded to WebP. SVG, scripts, and arbitrary uploads are rejected.
- Pending proposal files cannot be accessed by anonymous visitors, and RLS restricts review to the appropriate moderator.
- Removing a team logo does not delete any tournament photographs. The UI falls back to team initials. Previous private source files may remain retained separately according to the source system's retention policy.
- Facebook and Instagram publication remain independently disabled. Approving a team logo does not initiate social sharing.
