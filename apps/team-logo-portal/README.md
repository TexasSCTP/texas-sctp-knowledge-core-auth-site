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
