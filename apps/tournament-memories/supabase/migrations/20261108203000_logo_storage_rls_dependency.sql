-- Storage RLS policies refer to the logo request table even for anonymous users.
-- PostgreSQL needs column-level SELECT permission to plan that reference.
-- No anonymous SELECT RLS policy exists: anonymous users still see zero rows.
grant select(team_id,storage_path,status,upload_verified_at)
on public.memory_team_logo_requests to anon;