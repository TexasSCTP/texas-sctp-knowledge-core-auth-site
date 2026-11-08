/* Public gallery configuration. Never publish service role keys or rate-limit secrets. */
window.TEXAS_SCTP_CONFIG = {
  supabaseUrl: 'https://mlajcbnuponqyoehxydp.supabase.co',
  supabasePublishableKey: 'sb_publishable_wrWV6Cj5M48nxFECBrAcKg_h04TWlqX',
  // Public submissions use backend rate limits and moderation.
  guestUploadsEnabled: true,
  storageBucket: 'memories-private',
  brandLogoUrl: 'https://raw.githubusercontent.com/TexasSCTP/texas-sctp-knowledge-core-auth-site/main/texas-sctp-logo.png',
  organizationUrl: 'https://www.texassctp.com/',
  contactEmail: 'info@texassctp.com'
};