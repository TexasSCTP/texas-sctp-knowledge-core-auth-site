-- Texas SCTP seasons begin September 1 and end August 31.
-- Tournament/photo date determines the season, not submission time.
create or replace function public.memory_gallery_seasons()
returns table(season_start_year integer,season_label text)
language sql stable security invoker set search_path='' as $$
  with years as (
    select distinct
      (extract(year from p.photo_date)::integer
      - case when extract(month from p.photo_date)<9 then 1 else 0 end) as starting_year
    from public.memory_posts p where p.status='approved' and not p.privacy_hold
  )
  select starting_year,
    starting_year::text||'-'||(starting_year+1)::text from years
  order by starting_year desc
$$;
revoke all on function public.memory_gallery_seasons() from public;
grant execute on function public.memory_gallery_seasons() to anon,authenticated;
