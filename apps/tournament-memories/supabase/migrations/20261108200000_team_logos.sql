-- Texas SCTP On the Range: one approved logo per TEAM, independent of photo posts.
-- Guest proposals are private until reviewed. Staff replacement/removal is scoped by moderator team access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('memories-team-logos','memories-team-logos',false,2097152,array['image/webp'])
on conflict(id) do nothing;

create table if not exists public.memory_team_logo_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.memory_posts(id) on delete cascade,
  team_id text not null references public.memory_teams(id),
  storage_path text not null unique check(storage_path ~ '^submissions/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  status text not null default 'draft' check(status in ('draft','pending','approved','rejected')),
  upload_verified_at timestamptz,
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id),
  constraint memory_logo_verified_review check(status not in ('pending','approved') or upload_verified_at is not null)
);
create index if not exists memory_logo_requests_pending_idx
 on public.memory_team_logo_requests(created_at) where status='pending';

create table if not exists public.memory_team_logos (
  team_id text primary key references public.memory_teams(id) on delete cascade,
  storage_path text not null unique check(
    storage_path ~ '^(team/[A-Za-z0-9_-]{1,80}/[0-9a-f-]{36}|submissions/[0-9a-f-]{36}/[0-9a-f-]{36})\.webp$'
  ),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- ID is immutable, even though PostgREST upsert requires UPDATE of conflict key.
create or replace function memories_private.lock_logo_team_id()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.team_id is distinct from old.team_id then
    raise exception 'Cannot transfer a team logo to another team' using errcode='23514';
  end if;
  return new;
end
$$;
drop trigger if exists memory_team_logo_team_lock on public.memory_team_logos;
create trigger memory_team_logo_team_lock
 before update of team_id on public.memory_team_logos
 for each row execute function memories_private.lock_logo_team_id();

alter table public.memory_team_logos enable row level security;
alter table public.memory_team_logo_requests enable row level security;

revoke all on public.memory_team_logos,public.memory_team_logo_requests from public,anon,authenticated;
grant select(team_id,storage_path,updated_at) on public.memory_team_logos to anon,authenticated;
grant select(updated_by) on public.memory_team_logos to authenticated;
grant insert(team_id,storage_path,updated_by,updated_at) on public.memory_team_logos to authenticated;
grant update(team_id,storage_path,updated_by,updated_at) on public.memory_team_logos to authenticated;
grant delete on public.memory_team_logos to authenticated;

grant select(id,post_id,team_id,storage_path,status,upload_verified_at,created_at,moderated_at,moderated_by)
 on public.memory_team_logo_requests to authenticated;
grant update(status,moderated_at,moderated_by) on public.memory_team_logo_requests to authenticated;

drop policy if exists memory_team_logos_public_read on public.memory_team_logos;
create policy memory_team_logos_public_read
 on public.memory_team_logos for select to anon,authenticated
 using(exists(select 1 from public.memory_teams t where t.id=team_id and t.active));

drop policy if exists memory_team_logos_insert on public.memory_team_logos;
create policy memory_team_logos_insert
 on public.memory_team_logos for insert to authenticated
 with check(updated_by=(select auth.uid()) and memories_private.can_moderate(team_id)
   and (
    (split_part(storage_path,'/',1)='team' and split_part(storage_path,'/',2)=team_id)
    or exists(select 1 from public.memory_team_logo_requests r
      where r.team_id=memory_team_logos.team_id and r.storage_path=memory_team_logos.storage_path
        and r.status='pending' and r.upload_verified_at is not null)
  ));
drop policy if exists memory_team_logos_update on public.memory_team_logos;
create policy memory_team_logos_update
 on public.memory_team_logos for update to authenticated
 using(memories_private.can_moderate(team_id))
 with check(updated_by=(select auth.uid()) and memories_private.can_moderate(team_id)
   and (
    (split_part(storage_path,'/',1)='team' and split_part(storage_path,'/',2)=team_id)
    or exists(select 1 from public.memory_team_logo_requests r
      where r.team_id=memory_team_logos.team_id and r.storage_path=memory_team_logos.storage_path
        and r.status in ('pending','approved') and r.upload_verified_at is not null)
  ));
drop policy if exists memory_team_logos_delete on public.memory_team_logos;
create policy memory_team_logos_delete
 on public.memory_team_logos for delete to authenticated
 using(memories_private.can_moderate(team_id));

drop policy if exists memory_logo_requests_staff_read on public.memory_team_logo_requests;
create policy memory_logo_requests_staff_read
 on public.memory_team_logo_requests for select to authenticated
 using(memories_private.can_moderate(team_id));
drop policy if exists memory_logo_requests_staff_review on public.memory_team_logo_requests;
create policy memory_logo_requests_staff_review
 on public.memory_team_logo_requests for update to authenticated
 using(memories_private.can_moderate(team_id) and status='pending')
 with check(memories_private.can_moderate(team_id)
   and status in ('approved','rejected')
   and moderated_by=(select auth.uid()) and moderated_at is not null);

-- Signed URLs may be created only for approved team logos, or pending requests
-- by authorized moderators; a pending logo must not be served to the public.
drop policy if exists memory_team_logo_download on storage.objects;
create policy memory_team_logo_download
 on storage.objects for select to anon,authenticated
 using(bucket_id='memories-team-logos' and (
    exists(select 1 from public.memory_team_logos l
      where l.storage_path=name)
    or exists(select 1 from public.memory_team_logo_requests r
      where r.storage_path=name and memories_private.can_moderate(r.team_id))
    or (split_part(name,'/',1)='team'
        and memories_private.can_moderate(split_part(name,'/',2)))
 ));

-- No guest can directly add/replace team logos. Guest presigned uploads are
-- created by the authenticated service-role Edge Function after Turnstile.
drop policy if exists memory_team_logo_staff_upload on storage.objects;
create policy memory_team_logo_staff_upload
 on storage.objects for insert to authenticated
 with check(bucket_id='memories-team-logos'
    and name ~ '^team/[A-Za-z0-9_-]{1,80}/[0-9a-f-]{36}\.webp$'
    and memories_private.can_moderate(split_part(name,'/',2)));

drop policy if exists memory_team_logo_staff_delete on storage.objects;
create policy memory_team_logo_staff_delete
 on storage.objects for delete to authenticated
 using(bucket_id='memories-team-logos' and (
    (split_part(name,'/',1)='team'
      and memories_private.can_moderate(split_part(name,'/',2)))
    or exists(select 1 from public.memory_team_logo_requests r
      where r.storage_path=name and memories_private.can_moderate(r.team_id))
  ));

-- Public team logo mappings reveal no private submission paths unless already approved.
-- Pending requests are visible to authorized moderators only.
