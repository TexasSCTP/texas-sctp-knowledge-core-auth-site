-- Fix nested RLS photo/comment/reaction access for approved gallery posts.
-- Anonymous SELECT of privacy_hold only applies to records already readable
-- through memory_posts RLS (approved and not on privacy hold).
grant select(privacy_hold) on public.memory_posts to anon;
