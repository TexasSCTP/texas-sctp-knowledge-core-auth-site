# Texas SCTP Knowledge Core Authentication Site

This public repository contains generated deployment artifacts for the Texas SCTP Knowledge Core authentication interface. It does not contain the private Knowledge Core source, knowledge records, role data, credentials, secret keys, or database exports.

- Public address: `https://knowledge.texassctp.com`
- Hosting: GitHub Pages
- DNS management: Squarespace
- Authentication and authorization: Texas SCTP Knowledge Core Supabase project
- Source of record: private `TexasSCTP/texas-sctp-knowledge-core` repository

The browser bundle contains only a Supabase publishable key. Supabase MFA, the authenticated Edge Function, database authorization, and row-level protections remain the security boundaries. Generated assets must not be edited directly; changes are built and security-checked from the private source repository before publication.
