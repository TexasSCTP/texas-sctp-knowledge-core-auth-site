-- Atomic staff review prevents approving a request without updating the team record.
-- SECURITY INVOKER applies the underlying team-scoped RLS checks.
create or replace function public.memory_review_team_logo_request(
 p_request_id uuid,p_approve boolean
) returns boolean language plpgsql security invoker set search_path='' as $$
declare proposal record; updated_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in as an authorized team moderator.' using errcode='42501'; end if;
  select r.id,r.team_id,r.storage_path,r.upload_verified_at
    into proposal from public.memory_team_logo_requests r
    where r.id=p_request_id and r.status='pending' for update;
  if not found or proposal.upload_verified_at is null then
    raise exception 'This logo proposal is not available for review.' using errcode='42501';
  end if;
  if not memories_private.can_moderate(proposal.team_id) then
    raise exception 'You cannot manage this team.' using errcode='42501';
  end if;
  if p_approve then
    if not exists(select 1 from storage.objects o
       where o.bucket_id='memories-team-logos' and o.name=proposal.storage_path) then
      raise exception 'The proposed team logo file is unavailable.' using errcode='42501';
    end if;
    insert into public.memory_team_logos(team_id,storage_path,source,updated_by,updated_at)
      values(proposal.team_id,proposal.storage_path,'gallery',auth.uid(),now())
    on conflict(team_id) do update set
      team_id=excluded.team_id,storage_path=excluded.storage_path,
      source=excluded.source,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;
  update public.memory_team_logo_requests set
    status=case when p_approve then 'approved' else 'rejected' end,
    moderated_by=auth.uid(),moderated_at=now()
  where id=proposal.id and status='pending';
  get diagnostics updated_count=row_count;
  if updated_count<>1 then raise exception 'Could not finish reviewing this team logo.'; end if;
  return true;
end;
$$;
revoke all on function public.memory_review_team_logo_request(uuid,boolean) from public;
grant execute on function public.memory_review_team_logo_request(uuid,boolean) to authenticated;
