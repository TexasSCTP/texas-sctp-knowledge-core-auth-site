# Texas SCTP | On the Range - Team Logo Management

## Default public display

Under Texas SCTP policy, a team logo is **approved for public display by default**. There is no separate public-use authorization checkbox and no publicity-approval queue for logos. Team logos are identity assets, not athlete photo releases.

The gallery uses one current logo per team in `public.memory_team_logos`, keyed by the stable gallery team ID. The current logo appears with all approved photo posts from that team, including earlier uploads. Until one is available, the gallery shows the team's initials. The Texas SCTP organization logo is unchanged.

## How team logos arrive

- **First-time gallery upload:** A visitor can optionally provide a PNG/JPG/WebP logo with a tournament photo submission. The browser converts it to a small WebP image, while Cloudflare Turnstile and the upload service validate the submission. Once the logo file is verified, the service atomically assigns it as the team's current logo **if no logo is already on file**. It becomes public immediately, even when the athlete photos are still pending moderation.
- **Different logo for an existing team:** Anonymous submissions cannot overwrite a previously established team logo. They enter **Moderation > Team logos > Logo replacement suggestions**. The moderator chooses **Use this logo** or **Keep existing**. This is a check of which version is current, **not public-display permission**.
- **Authorized moderator:** In **Moderation > Team logos > Team logo library**, moderators may add, replace or remove the current logo directly for teams they manage. Logos supplied by coaches or other trusted channels are public by default once saved. The source is recorded (`moderator`, `team_accounts`, or `external`).
- **Protection:** First-time anonymous logos are rate-limited and checked by Turnstile, but the guest form does not independently verify that the person submitting represents the named team. An authorized moderator can promptly replace or remove an incorrect logo. Existing team logos are protected from anonymous replacement.

Logo files are stored in the gallery's private `memories-team-logos` storage bucket. The site obtains expiring signed image URLs only for current team logos. Guest uploads cannot read pending replacement files or modify the gallery logo table.

## Reusing the existing Team Accounts logos

The separate **Texas SCTP Team Accounts** Supabase project stores logos in its private `team-logos` bucket. Its authenticated Team Accounts page displays the most recent `active` or `approved` logo to authorized team members.

**An active Team Accounts team logo is eligible for public gallery use by default. No extra public-display approval is required.** However, eligibility is separate from moving the image across systems.

Currently, an authorized person can obtain that logo through Team Accounts, then upload a copy to the correct team using the gallery's **Team logo library** with source **Existing Team Accounts logo**. The gallery stores its own public-display-ready copy, without exposing the portal bucket, sessions, team membership data or financial information.

**Automatic cross-project copying is not yet enabled.** It requires a narrowly authorized server-side source for the protected file and a verified team ID mapping. The portals use different database IDs; match through official SHOT IDs or an approved crosswalk, never a similar name. Keller is a known example: SHOT ID **2270** maps to gallery `demo-team-90`.

## Security and auditing

- Team logo files and the original Team Accounts bucket remain private. The public gallery serves current logos through short-lived signed URLs.
- Images are decoded and converted to WebP at upload; SVGs/scripts and oversized originals are not accepted.
- Authorized moderator access is determined by the gallery's `memory_moderators` permissions. Team-logo replacement is logged by the modifying moderator.
- Removing a team logo restores team initials without removing any tournament photos or mutating Team Accounts.
- A logo becoming public does not approve athlete photos and does not turn on Facebook or Instagram publishing.
