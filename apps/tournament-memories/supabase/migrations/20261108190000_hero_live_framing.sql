-- Approved gallery photographs join the animated hero unless staff hides them.
-- Staff may independently frame desktop, mobile and gallery cards.
create or replace function memories_private.valid_hero_crop(c jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(c)='object'
   and jsonb_typeof(c->'x')='number'
   and jsonb_typeof(c->'y')='number'
   and jsonb_typeof(c->'zoom')='number'
   and (c->>'x')::numeric between 0 and 100
   and (c->>'y')::numeric between 0 and 100
   and (c->>'zoom')::numeric between 1 and 1.45
   and length(c::text)<512,false)
$$;
create table if not exists public.memory_hero_placements(
 photo_id uuid primary key references public.memory_photos(id) on delete cascade,
 enabled boolean not null default true,
 desktop jsonb not null default '{"x":50,"y":50,"zoom":1}'::jsonb,
 mobile jsonb not null default '{"x":50,"y":50,"zoom":1}'::jsonb,
 card jsonb not null default '{"x":50,"y":50,"zoom":1}'::jsonb,
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 constraint memory_hero_valid_crops check(
  memories_private.valid_hero_crop(desktop) and
  memories_private.valid_hero_crop(mobile) and
  memories_private.valid_hero_crop(card))
);
alter table public.memory_hero_placements enable row level security;
revoke all on public.memory_hero_placements from public,anon,authenticated;
grant select on public.memory_hero_placements to anon,authenticated;
grant insert(photo_id,enabled,desktop,mobile,card,updated_by,updated_at) on public.memory_hero_placements to authenticated;
grant update(enabled,desktop,mobile,card,updated_by,updated_at) on public.memory_hero_placements to authenticated;
grant execute on function memories_private.valid_hero_crop(jsonb) to authenticated;
drop policy if exists memory_hero_read on public.memory_hero_placements;
create policy memory_hero_read on public.memory_hero_placements for select to anon,authenticated
 using(exists(select 1 from public.memory_photos f
   join public.memory_posts p on p.id=f.post_id
   where f.id=photo_id and p.status='approved' and not p.privacy_hold));
drop policy if exists memory_hero_insert on public.memory_hero_placements;
create policy memory_hero_insert on public.memory_hero_placements for insert to authenticated
 with check(updated_by=(select auth.uid()) and
  exists(select 1 from public.memory_photos f
  join public.memory_posts p on p.id=f.post_id where f.id=photo_id
   and p.status='approved' and not p.privacy_hold
   and memories_private.can_moderate(p.team_id)));
drop policy if exists memory_hero_update on public.memory_hero_placements;
create policy memory_hero_update on public.memory_hero_placements for update to authenticated
 using(exists(select 1 from public.memory_photos f
  join public.memory_posts p on p.id=f.post_id where f.id=photo_id
   and p.status='approved' and not p.privacy_hold
   and memories_private.can_moderate(p.team_id)))
 with check(updated_by=(select auth.uid()) and
  exists(select 1 from public.memory_photos f
  join public.memory_posts p on p.id=f.post_id where f.id=photo_id
   and p.status='approved' and not p.privacy_hold
   and memories_private.can_moderate(p.team_id)));

create or replace function public.memory_hero_candidates(p_limit int default 24)
returns table(photo_id uuid,post_id uuid,storage_path text,photo_position smallint,
 enabled boolean,desktop jsonb,mobile jsonb,card jsonb)
language sql volatile security invoker set search_path='' as $$
 select f.id,f.post_id,f.storage_path,f.position,coalesce(h.enabled,true),
 coalesce(h.desktop,'{"x":50,"y":50,"zoom":1}'::jsonb),
 coalesce(h.mobile,'{"x":50,"y":50,"zoom":1}'::jsonb),
 coalesce(h.card,'{"x":50,"y":50,"zoom":1}'::jsonb)
 from public.memory_photos f join public.memory_posts p on p.id=f.post_id
 left join public.memory_hero_placements h on h.photo_id=f.id
 where p.status='approved' and not p.privacy_hold and coalesce(h.enabled,true)
 order by pg_catalog.random()
 limit least(greatest(coalesce(p_limit,24),1),36)
$$;
revoke all on function public.memory_hero_candidates(int) from public;
grant execute on function public.memory_hero_candidates(int) to anon,authenticated;

create or replace function public.memory_hero_editor_items(p_limit int default 400)
returns table(photo_id uuid,post_id uuid,storage_path text,photo_position smallint,
 team_name text,event_name text,enabled boolean,desktop jsonb,mobile jsonb,card jsonb)
language sql stable security invoker set search_path='' as $$
 select f.id,f.post_id,f.storage_path,f.position,t.name,
 coalesce(ev.title,p.other_tournament,'Tournament'),
 coalesce(h.enabled,true),
 coalesce(h.desktop,'{"x":50,"y":50,"zoom":1}'::jsonb),
 coalesce(h.mobile,'{"x":50,"y":50,"zoom":1}'::jsonb),
 coalesce(h.card,'{"x":50,"y":50,"zoom":1}'::jsonb)
 from public.memory_photos f join public.memory_posts p on p.id=f.post_id
 join public.memory_teams t on t.id=p.team_id
 left join public.memory_tournaments ev on ev.id=p.tournament_id
 left join public.memory_hero_placements h on h.photo_id=f.id
 where p.status='approved' and not p.privacy_hold and
  memories_private.can_moderate(p.team_id)
 order by p.created_at desc,f.position asc
 limit least(greatest(coalesce(p_limit,400),1),500)
$$;
revoke all on function public.memory_hero_editor_items(int) from public;
grant execute on function public.memory_hero_editor_items(int) to authenticated;
