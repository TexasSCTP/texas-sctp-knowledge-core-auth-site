# Texas SCTP | On the Range

### Team logos: public by default (November 8)

Each team has one current gallery logo that appears on all of that team's photo posts. New team logos supplied with photos are displayed publicly once verified if the team has no existing logo; conflicting replacements must be selected by a moderator to protect established team identities. **There is no additional public-display consent or logo-publication approval step.** Moderators can add, replace, or remove any logo for teams in their scope. Team Accounts logos are likewise eligible for public use under Texas SCTP policy, but because Team Accounts stores them in a separate private Supabase project they must currently be imported by authorized staff. Automatic cross-project synchronization is not yet enabled. See [TEAM_LOGO_WORKFLOW.md](supabase/TEAM_LOGO_WORKFLOW.md) for details.

### Gallery seasons and live-photo framing (November 8)

- Texas SCTP season is computed from each approved post's tournament/photo date, September 1 through August 31. Examples: August 2026 = **2025–2026**; October 2026 = **2026–2027**. Approved post cards, photo detail views and moderator reviews show this tag. The Season dropdown queries only seasons containing approved, publicly viewable posts and filters older pages at the database level.
- Newly approved images automatically become eligible for the animated hero, with up to 24 randomly selected approved tournament photos per refresh alongside the original seven curated scenes. The visitor slideshow changes every ten seconds; it checks for newly approved photos around every five minutes. Unapproved, removed and privacy-held photos cannot enter the hero. Staff can hide an individual approved image from the hero without hiding it from the gallery.
- Authorized moderators choose **Moderation → Adjust slideshow photos** (or visit `/hero-studio.html` while signed in), select any approved photo, and independently drag/zoom its **Desktop**, **Mobile** and **Photo card** framing. **Save photo placement** writes to the RLS-protected `memory_hero_placements` table immediately. No GitHub token or Render redeploy is required for uploaded photos. The initial seven illustration scenes retain their existing GitHub-published positioning workflow and remain independently adjustable.
- Approved photo settings and private photo URLs are not stored in the public static site or GitHub. Supabase serves only approved images through time-limited signed URLs; editor updates require an authorized, team-scoped moderator.

**Current implementation status (November 8, 2026):** A dedicated Supabase project (`mlajcbnuponqyoehxydp`) was created with explicit approval at $10/month. Database schema, two additional RLS security fixes, 171 public team names and 48 tournament entries have been applied and verified. Edge Functions `guest-memories` and `social-publisher` are ACTIVE. The Render staging gallery is linked using the **public** publishable key, and its seven illustrative images remain visible until real approved photos arrive. Live SQL role tests verify pending photos/comments are private, approved content is readable, and unauthorised moderators cannot approve. Cloudflare Turnstile and rate-limit secrets are configured; gallery photo upload and moderator approval were exercised successfully. Authorized moderator access and live photo display were verified. The logo-specific end-to-end guest test remains pending. Facebook and Instagram remain OFF until proper Meta ownership/permissions, Zapier hooks, secrets and an end-to-end test are complete. No other Supabase projects were modified. See [`supabase/README_BACKEND.md`](supabase/README_BACKEND.md).

## What visitors can do

- Browse an image-first social feed **without signing in**.
- View large photo cards with captions and recent comments immediately below photos. Search memories or expand discreet filters for a team or tournament.
- Upload one to six pictures using the three-step form: photos, team/tournament (date autofills), optional caption and permission confirmation. No login required.
- Comment using a display name, appreciate a post, and share its link **without signing in**.
- Request removal through the Texas SCTP contact link.

### What staff can do

Authorized Texas SCTP moderators use a separate email-link sign-in to review photos and comments. Everything submitted by guests remains private or hidden until a moderator approves it. Unapproved files are in a private Supabase Storage bucket, not a publicly accessible folder.

## Historical project notes (November 6, 2026; superseded by the status above)

**Implemented in the included source package:** HTML/CSS/JavaScript interface, no-login guest workflows, Supabase schema and access rules, protected guest-submission Edge Function, upload token flow, image compression, CAPTCHA wiring, moderation interface, and initial reference catalog from Texas SCTP's approved public Airtable data.

**Not yet live:** No dedicated Supabase project has been provisioned, no SQL migration or Edge Function has been deployed, and no Render production site, DNS change, or Google Sites embed has been published. This is intentional: the existing Scholarship Portal and Team Accounts projects contain operational data and must not be reused without approval. New Supabase projects can incur charges in an existing Pro organization; confirm the quote first. The frontend displays a clearly marked design preview, including one credited public-domain sample photograph, until configured. No sample photograph is represented as a Texas SCTP event. Upload file selection works in design preview but final submission remains disabled.

**Tests run:** browser checks verified that the gallery renders, no public sign-in button exists, and the guest upload dialog opens. The frontend JavaScript passed `node --check`, and the static build excludes backend sources from public hosting. Real upload, rate-limiting, storage, and permission tests still require the dedicated Supabase environment.

## Architecture

- Render Static Site: serves only the front-end files under `dist/`.
- Supabase Database: teams, tournaments, posts, photos, comments, guest reactions, moderator list, and abuse counters.
- Supabase Storage: private `memories-private` bucket; guest uploads use signed, one-time file upload tokens.
- Supabase Edge Function `guest-memories`: mandatory Cloudflare Turnstile validation on photo submissions and comments, salted-IP rate limiting, safe field validation, and batch completion verification.
- Airtable: source of approved, **public-safe** team names and tournament dates; not exposed directly to the browser.

### Privacy and safety

- No visitor accounts, email collection, third-party analytics, or public access to unpublished images.
- Guest uploads require a confirmation of sharing rights and appropriate guardian consent for minors. This is a user attestation, not proof of legal consent; Texas SCTP should establish its own applicable photo-release policy.
- The public never receives the service-role key, Turnstile secret, or rate-limiting secret.
- Staff moderator privileges are granted through `memory_moderators` by a trusted administrator, not by entering an arbitrary email.
- File uploads are capped at six WebP images, five megabytes each after browser-side optimization; the private storage bucket enforces type and size restrictions.
- Please implement a removal and retention policy, a process to delete declined/orphan uploads, and testing for minors' privacy before inviting teams statewide.
- Guest reactions use a local browser identifier plus rate controls, not verified unique persons; counts are community appreciation, not voting results.

## Required deployment steps

1. Select or create a **dedicated** Supabase project for Tournament Memories. Get and approve any nonzero cost before creating a project. Do not touch Texas SCTP Team Accounts, Scholarship Portal or Knowledge Core.
2. Apply `supabase/migrations/20261106165000_tournament_memories.sql` once in that project's SQL editor. Then apply `supabase/seed_reference.sql` to populate **171 approved public teams** and **48 tournament dates** from the existing Airtable references, without athlete records or coach contacts. Keep these catalog entries refreshed as teams or dates change.
3. Create a free [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) widget for the Render URL and eventual custom domain. Configure the site's approved hostnames, then obtain its public **site key** and private **secret key**.
4. Configure these **server-side Supabase Edge Function secrets**: `TURNSTILE_SECRET_KEY` (private), `TURNSTILE_ALLOWED_HOSTNAMES` (comma-separated hostnames with no scheme), and `MEMORIES_RATE_SECRET` (32+ random characters). Supabase also provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to functions. Never put these private values into browser files.
5. Deploy `supabase/functions/guest-memories/index.ts` as the Edge Function **`guest-memories`** with JWT verification **disabled** per `supabase/config.toml`. This function is intentionally public, but fail-closed CAPTCHA, limits, and moderation enforce submission safety. Never disable the Turnstile or rate-limit checks just to make the form work.
6. In `config.js`, set only your new Supabase project's `supabaseUrl`, `supabasePublishableKey`, and **public** `turnstileSiteKey`. These are safe browser-facing values. All secret values must remain server-only.
7. Connect this source repository to a Render **Static Site**. Build command: `node scripts/build-static.mjs`. Publish directory: `dist`. A paid web service is not needed. The `render.yaml` provides an optional Blueprint configuration; avoid adding paid infrastructure.
8. Create or invite Texas SCTP staff accounts in Supabase Auth, restrict public sign-ups, and manually add the exact intended staff `auth.users.id` to `memory_moderators`. Staff can then sign in via the discreet **Staff access** link in the footer. Do not add visitors to the moderator roster.
9. Test production behavior from the Render URL on desktop and mobile, including from a Google Sites embed: anonymous browse/upload/comment/reaction, CAPTCHA, upload completion, moderation, private pending URL access, rejected submission handling, and iframe login handling for **staff**.
10. Once verified, set up `memories.texassctp.com` if desired, and embed the URL on the existing Texas SCTP Tournament Photos Google Sites page. Adjust the allowed Turnstile hostnames and Supabase Auth redirect settings to match. Update DNS only after confirming the correct configuration.

## Test matrix before launch

- **Guest:** Opens the gallery and the upload form without being asked to sign in. Upload accepts only allowed formats and six or fewer photos. It requires team, tournament/date, permission, and security verification.
- **Safety:** A guest cannot read an unapproved post/photo/comment by listing tables or accessing direct storage URLs. Even an uploader cannot retrieve pending private photo URLs after upload.
- **Moderator:** An authorized staff account can see pending images, approve or decline, and is prevented from publishing an incomplete upload.
- **Comments:** A guest can add a comment with a display name; it does not display until approved.
- **Reactions:** A guest can react/unreact without sign-in. Counts are not reliable individual-identity measurements and are rate limited.
- **Reliability:** Image compression strips browser-accessible original metadata, oversized upload attempts fail, missed uploads can be retried in the open form, and orphaned batches are cleaned by retention process.
- **Mobile:** Verify on current iOS and Android browsers, including a Google Sites embed, in landscape and portrait.

## File structure

- `index.html`, `styles.css`, `app.js`, `config.js`, `favicon.svg`: website files
- `scripts/build-static.mjs`: builds `dist/` containing **only public files**
- `render.yaml`: static hosting settings and Google Sites embedding permissions
- `supabase/migrations/`: PostgreSQL schema, RLS policies and private storage rules
- `supabase/functions/guest-memories/index.ts`: server-side guest security and upload handling
- `supabase/config.toml`: guest Edge Function JWT setting
- `supabase/seed_reference.sql`: initial approved public team and tournament catalog
- `reference/`: human-readable source snapshots for future approved catalog reconciliation

## Cost guardrails

No app builder is required. Render Static Sites have a free tier, subject to bandwidth and build quotas. Cloudflare Turnstile has a free tier. Supabase project pricing, storage, bandwidth and Edge Function usage must be checked in the **existing Pro organization** before provisioning. A new project can incur an incremental fee and should not be created without explicit approval.

## Simplified visual design (v2)

The visitor homepage has one simple header action, a compact branded introduction, an uncluttered single-column photo feed, inline approved comments, and a search box with optional team/tournament filters. The guest upload form uses three visible steps without account creation. Back-office tools remain restricted to moderators and do not appear in the public navigation. The sample photograph is public-domain USFWS photography, shown **only when the backend is not configured** and clearly identified as example content. A local `preview-catalog.json` provides approved public team and tournament selectors in demo mode; it is never used as a source of database permissions.


## Seven-scene cinematic gallery hero (November 7, 2026)

Seven AI-generated illustrative scenes rotate in a randomized order every 10 seconds, with 2.2-second opacity crossfades, a restrained Ken Burns effect, and a user-operated Pause/Play motion button. On reduced-motion devices the slideshow starts paused. The image sequence is reordered without immediate repetition after each seven-scene cycle.

The photographs are **illustrations**, not real Texas SCTP tournament submissions. They are not stored as user posts or mixed into user-generated photos. Visitors can browse this staging preview without logging in; publishing real submissions still requires the private Supabase backend and approval workflow.

The images are in `public/images/scene-01.webp` through `scene-07.webp`.


## Slideshow Studio (staging)

The separate **`/hero-admin.html`** page is a visual editor for the seven photos in
**the rotating homepage banner**. It works without Supabase and does not modify
any financial, team account, or scholarship databases.

1. Choose a scene from the left panel. Drag within the photo to change its
   visible framing, or use the horizontal / vertical position and zoom sliders.
2. Choose Desktop, Mobile, or Photo card for **independent positions and zooms**.
   Hide a photo from the rotation, or use the small arrows to change slide order.
3. Changes are automatically saved as a draft **only in the same browser**.
   **Preview in gallery** opens a full-page preview that reads that local draft.
   Visitors do not see drafts.
4. **Publish settings** requires a repository-restricted GitHub fine-grained
   personal access token. Give the token Contents: Read and write access to
   `TexasSCTP/texas-sctp-knowledge-core-auth-site` only. It is used for a single
   browser API transaction, never stored or written to the repository.
   This commits `apps/tournament-memories/hero-config.json` to the isolated
   `staging/tournament-memories-preview` branch. Never paste a token into an
   email or message.
5. Render is currently configured with automatic deployment **off**. After
   committing, deploy the latest staging commit from the service dashboard:
   https://dashboard.render.com/static/srv-dbnot895efls73bujcfg . Once deployed,
   the public gallery reads the new JSON and applies the published framing.

### Security boundary

`hero-admin.html` is a client-side editor on a public static staging URL.
Possession of the URL alone does **not** grant the ability to publish changes.
Publishing is authenticated by GitHub. Drafts are saved locally and are not
shared with visitors. This is not a private server-side dashboard; do not
mistake a hidden URL for authentication. Staff-only access to the page itself
requires a future authenticated backend or restricted hosting.

The public gallery loads `hero-config.json`. Changes to this JSON control
which photo appears, order, enabled status, cropping coordinates for desktop
and mobile, zoom, and card crops. **All src paths are restricted to the seven
approved local image files**, preventing remote-image injection.
