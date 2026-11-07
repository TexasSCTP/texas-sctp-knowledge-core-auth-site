/* Safe PUBLIC configuration. Add ONLY a dedicated Supabase project's URL and
   publishable key plus the public Cloudflare Turnstile site key. Never add
   SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SECRET_KEY or rate-limit secrets. */
window.TEXAS_SCTP_CONFIG = {
  supabaseUrl: '',
  supabasePublishableKey: '',
  turnstileSiteKey: '',
  storageBucket: 'memories-private',
  brandLogoUrl: 'https://raw.githubusercontent.com/TexasSCTP/texas-sctp-knowledge-core-auth-site/main/texas-sctp-logo.png',
  organizationUrl: 'https://www.texassctp.com/',
  contactEmail: 'info@texassctp.com'
};