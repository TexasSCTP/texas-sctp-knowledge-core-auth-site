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
