alter table public.memory_team_logos
add column if not exists source text not null default 'moderator'
check(source in ('moderator','gallery','team_accounts','external'));
grant select(source) on public.memory_team_logos to authenticated;
grant insert(source),update(source) on public.memory_team_logos to authenticated;
