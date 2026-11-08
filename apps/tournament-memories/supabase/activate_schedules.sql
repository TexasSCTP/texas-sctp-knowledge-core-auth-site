-- ON THE RANGE: schedule both photo-sharing channels and retention cleanup.
-- RUN ONLY AFTER the dedicated project, storage, Turnstile and Zapier connectors
-- are fully tested, backend secrets configured, and both channels intentionally
-- enabled. This file contains ZERO credentials.
-- Store edge_function_url and automation publisher secret securely in Supabase Vault:
--   SELECT vault.create_secret('https://YOUR-DEDICATED-PROJECT.supabase.co','gallery_project_url');
--   SELECT vault.create_secret('YOUR_GENERATED_32+_CHAR_PUBLISHER_SECRET','gallery_publish_secret');
-- Never substitute a public/anon key for the publisher secret.
-- REQUIREMENTS: pg_cron, pg_net and Vault extensions enabled in your project.

-- Both channels are independently rate-limited by memory_claim_social_outbox.
-- A failed or uncertain webhook is placed in an exception queue, never retried
-- blindly, because doing so could create duplicate Meta posts.
select cron.schedule('txsctp_gallery_facebook', '11 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='gallery_project_url') || '/functions/v1/social-publisher',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-publisher-secret',(select decrypted_secret from vault.decrypted_secrets where name='gallery_publish_secret')),
    body := '{"action":"dispatch","platform":"facebook"}'::jsonb,
    timeout_milliseconds := 25000
  )
$$);
select cron.schedule('txsctp_gallery_instagram', '41 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='gallery_project_url') || '/functions/v1/social-publisher',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-publisher-secret',(select decrypted_secret from vault.decrypted_secrets where name='gallery_publish_secret')),
    body := '{"action":"dispatch","platform":"instagram"}'::jsonb,
    timeout_milliseconds := 25000
  )
$$);
select cron.schedule('txsctp_gallery_cleanup', '25 4 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='gallery_project_url') || '/functions/v1/social-publisher',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-publisher-secret',(select decrypted_secret from vault.decrypted_secrets where name='gallery_publish_secret')),
    body := '{"action":"cleanup"}'::jsonb,
    timeout_milliseconds := 25000
  )
$$);

-- FINAL, SEPARATE, INTENTIONAL GO-LIVE ACTION ONLY AFTER SUCCESSFUL TESTS:
-- UPDATE public.memory_social_channels SET enabled = true WHERE platform IN ('facebook','instagram');
-- To pause instantly: UPDATE public.memory_social_channels SET enabled=false;
