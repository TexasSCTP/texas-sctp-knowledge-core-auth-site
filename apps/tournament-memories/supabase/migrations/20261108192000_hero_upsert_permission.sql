-- Fix authorized photo framing saves from Supabase/PostgREST upsert.
-- PostgREST includes the conflict key photo_id in UPDATE SET, even if unchanged.
-- Existing column grants omitted UPDATE(photo_id), causing SQLSTATE 42501
-- "permission denied for table memory_hero_placements" for staff.
-- RLS remains limited to moderators of approved, non-held photos.
grant update(photo_id) on public.memory_hero_placements to authenticated;

-- With UPDATE(photo_id) permitted for the upsert, explicitly prevent
-- an editor from reassigning an existing placement to a different photo.
create or replace function memories_private.memory_hero_lock_photo_id()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.photo_id is distinct from old.photo_id then
    raise exception 'Cannot reassign a slideshow placement to another photograph'
      using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists memory_hero_lock_photo_id_trigger on public.memory_hero_placements;
create trigger memory_hero_lock_photo_id_trigger
before update of photo_id on public.memory_hero_placements
for each row execute function memories_private.memory_hero_lock_photo_id();
