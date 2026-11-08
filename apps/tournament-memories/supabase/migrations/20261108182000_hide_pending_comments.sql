-- Prevent public exposure of unapproved comments on approved posts.
-- Inside the correlated subquery, unqualified status referred to the post.
drop policy if exists memory_comments_read on public.memory_comments;
create policy memory_comments_read on public.memory_comments
for select to anon,authenticated using (
  exists (
    select 1 from public.memory_posts m
    where m.id = public.memory_comments.post_id
      and (
        (m.status='approved' and not m.privacy_hold
          and public.memory_comments.status='approved')
        or memories_private.can_moderate(m.team_id)
      )
  )
);
