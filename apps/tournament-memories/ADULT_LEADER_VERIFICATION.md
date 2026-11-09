# Adult leader verification and staff access
Texas SCTP On the Range, November 9, 2026.

## Staff identities and authority

- **Owner: Mark Myers**, existing authenticated account `mark@texassctp.com`, statewide moderation authority. The Owner record is preserved and uniquely constrained.
- **Administrator: Jason Anderson**, authorized email `janderson@sssfonline.com`, statewide photo/comment/team logo/social moderation approval rights. Jason's staff invitation remains `pending` until he completes a verified email-link sign-in.
- Moderators authenticate through existing Supabase Auth magic links. For a previously unregistered invited email, the staff login allows the first signup. On confirmed sign-in, the private service verifies the invitation against the authenticated, verified email before granting moderator permissions.
- The protected staff roster on the Moderator page shows Owner and Administrator records and each invitation's status. Neither the names nor email addresses are published to visitors as a public directory.

## Backend adult-leader lookup

When a guest submits a photo:
1. Their named, explicitly selected authorizations are saved to the private `memories_private.memory_photo_authorizations` table.
2. A **database BEFORE INSERT trigger** automatically calls `memories_private.lookup_adult_registration`, comparing the uploader's normalized full name and email to the private adult roster cache and checking the submitted team's current-source assignment.
3. The result, reason, lookup time and roster batch ID are saved alongside the authorization record. This step is server-side and cannot be overridden from the upload form.
4. Authorized moderators read the result through `memory_staff_list_photo_authorizations`, limited to their assigned teams.
5. The **Photo Submissions** Moderator page displays a large colored status box **before** its Approve and Decline buttons.

### Three visual results

- **GREEN: APPROVED**: one exact email and order-insensitive full-name match, recognized adult role, clean source quality, non-retired record, and current-source team assignment.
- **RED: DECLINED**: neither name nor email has a matching adult registration. This is **not** an automatic rejection of the photo, because parents/guardians and photographers need not be SCTP registered leaders.
- **YELLOW: REVIEW NEEDED**: conflicting name/email, duplicate registration, non-current role, flagged quality, missing team assignment, unavailable/stale roster, or historical photo submission without an electronic release. Moderator can still assess consent and approve/decline.

An SCTP registration match does NOT verify email ownership or prove parental consent for minors. The two responsibilities remain distinct.

## Airtable source and snapshot management

Source: private Airtable base `apprZF74BCM6N0G93` (Texas SCTP Private Coach & Team Roster), Adult Members, Team Assignments, and Teams. Imported November 9, 2026: **760 adult records**, **795 assignments**, **182 source teams**. Of the assignments, 761 mapped to known gallery teams. Unmapped or incomplete rows are conservatively labeled Review Needed.

The lookup is performed automatically at submission **against the private backend snapshot**, rather than by scraping or exposing the complete Airtable table to the browser. This snapshot must be refreshed from the private source at least every seven days. If the last completed snapshot is more than seven days old, all new lookups become **REVIEW NEEDED**; the system will never claim a stale record is approved.

The current snapshot import was performed through the connected Airtable tools and a private Supabase import. There is not yet a continuously running Airtable-to-Supabase sync because no transferable server-side Airtable read credential is configured. A recurring sync needs a dedicated read-only Airtable credential (or an Airtable-native automation with a secured receiver). Until that is configured, periodic private roster refreshes are necessary.

## Security, review, and social safety

- The roster cache and snapshot metadata live in the non-public `memories_private` schema with row-level security enabled, no public/client table reads, and service-only writes.
- Social publishing remains disabled. Gallery approval itself does not publish to Meta; social publishing still needs a separate, photo-specific moderator choice and named adult social-use authorization.
- Administrators cannot change owner status through the public UI.
- No CAPTCHA.
