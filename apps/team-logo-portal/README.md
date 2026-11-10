# Texas SCTP Team Logo Portal

Standalone Texas SCTP Team Logo Portal (not part of Tournament Memories).

- **Public site:** A separate Render static-site deployment and domain.
- **Source:** `apps/team-logo-portal/` on branch `team-logo-portal`.
- **Build:** `node apps/team-logo-portal/scripts/build.mjs`.
- **Publish directory:** `apps/team-logo-portal/dist`.
- **Public API:** Supabase Edge Function `team-logo-portal`.
- **Directory and logo records:** Existing shared Texas SCTP Supabase data, retained to avoid losing or duplicating approved logos.
- **Uploads:** Public, no account or CAPTCHA; signed WebP uploads limited to 2MB and backend rate limiting.
- **Administration:** No public deletion endpoint; retain existing logo history.

This site has its own navigation, config, build, deployment, and API endpoint and does not call or link to Tournament Memories.


## Verified team directory fields and publication rules (November 2026)

School/team program level is **not** the same as school-vs-club classification.
The existing team_category (youth or collegiate) and Airtable Team Type
(Youth / Scholastic, Collegiate, etc.) are not proof of school operation.
Never infer team type or home range from the team name, town, league,
event host, or tournament venue.

Staff-only editor: /admin/ (Supabase Auth email link with staff membership
in memory_moderators and team_id IS NULL). All writes are checked by the
team-logo-portal Edge Function and service-only logo_portal_save_profile RPC.

The current range selector has 20 Texas range-city entries imported from the
Texas SCTP Command Center's Venues & Ranges table. Entries are selectable
candidates, not asserted home-range affiliations. Staff must confirm the range
used by each club. A moderator can add a verified new range if missing.

A team profile has profile_status = draft or approved:

- **Draft / no profile:** public page lists the team but indicates the
  details are awaiting review. It never exposes draft contact data.
- **School:** School-operated/sponsored youth or college team. Staff chooses
  team_kind = school and records exact school name and verified school-city.
  home_range_id is forbidden. Public location is the school-city.
- **Club:** Independent/community/4-H club. Staff chooses team_kind = club
  and one verified primary practice home range. School name/city fields are
  forbidden. Public city is derived dynamically from the chosen range's city.
- **Needs classification:** team_kind = NULL; no guessed public type/location.
  Approval is blocked until classification and location are verified.
- **Contacts:** One official Head Coach or Organizational Contact, name, and
  organizational email. Stored privately; public name/email requires
  approved profile and contact_public_approved = true. Staff must confirm
  permission with the organization/contact before enabling public visibility.
  Never automatically copy personal SHOT or adult-roster emails.
- **Approval:** logo_portal_save_profile enforces school name/city or club
  home range, validates contact requirements, and audits changes to the
  private memories_private.logo_portal_profile_events table.
  The Edge Function returns approved fields only, never private source notes.
- **Visibility:** memory_teams.portal_visible and memory_teams.active are
  independent controls. Hidden teams disappear from the logo portal and
  cannot upload logos publicly. Existing logo/profile remains preserved.
  Source team/SHOT status is unchanged.

Reconciliation order: use SHOT Team ID to identify the record; confirm team
type with the head coach or organizational leader; verify the school city
with the institution or the club's actual primary practice range with the
range directory; obtain approved public contact details and publication
permission; record source notes; then approve. Collegiate division remains
separate from school-vs-club classification.

Outstanding: verify the 171 profiles with their teams; add missing
practice ranges. No team is automatically approved from name patterns or
private coach email databases.


## Shared staff moderation (November 10, 2026)

Team Logo public browsing and uploads remain hosted independently. All staff
moderation now runs from the existing On the Range authentication origin:

https://texas-sctp-tournament-memories-preview.onrender.com/moderator-hub/

The hub uses the same Supabase project, moderator registry, and default
browser session as the On the Range moderation interface. It presents both
On the Range and Team Logo Directory management in one place. Team Logo
settings remain independent and statewide access continues to require the
global staff role on the server. The old /admin/ path is now a static
redirect; the previous separate staff login client and its distinct storage
key have been retired.

Do not reintroduce a second staff login on the public Team Logo Portal.
The canonical staff editor source is now in the On the Range repository
subfolder apps/tournament-memories/moderator-hub/team-logos/.

## Community team listing reports (November 10, 2026)

A small flag on each public team card lets any visitor submit an inactivity, incorrect-information, or other team directory concern. An optional note is limited to 500 characters. No account or CAPTCHA is required. Submitting a report cannot hide a team.

The team-logo-portal Edge Function exposes report_team for visitors and staff_reports, staff_report_review, and staff_report_summary for authenticated statewide moderators. The database table public.logo_portal_reports is RLS-protected and grants no direct access to public roles. Server-hashed IP fingerprints, rather than raw IP addresses, enforce at most 5 submissions per visitor per day and 1 per team every 7 days. No reporting identity is displayed publicly.

The canonical staff queue is in the shared Moderator Hub at /moderator-hub/team-logos/. Staff may dismiss a report without changing the listing or confirm inactivity with a required verification note (at least 8 characters). A confirmed inactivity decision sets memory_teams.portal_visible=false and closes pending flags for that team atomically with private history. The team and logo disappear from the public directory and public logo uploads stop for that team. Files and profile data remain stored, and staff can restore visibility when activity is verified.

The existing active/SHOT state is unchanged. A previously issued signed storage URL can remain valid for its original one-hour lifetime even after hiding the public listing.

Backend source: supabase/functions/team-logo-portal/index.ts. SQL transaction tests exercised the flow and rolled back the test changes. Real staff sign-in and visitor browser testing remain useful final checks.
