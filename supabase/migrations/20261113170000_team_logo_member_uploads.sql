begin;

drop policy if exists "Active captains can upload team logos" on storage.objects;
create policy "Active team members can upload team logos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (storage.foldername(name))[3] is null
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
    and metadata ->> 'mimetype' in ('image/png', 'image/jpeg', 'image/webp')
    and coalesce((metadata ->> 'size')::bigint, 2097153) between 1 and 2097152
    and exists (
      select 1 from public.team_members as member
      where member.team_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
        and member.status = 'active'
    )
  );

drop policy if exists "Active captains can delete team logos" on storage.objects;
create policy "Members can delete their own unused team logos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (storage.foldername(name))[3] is null
    and exists (
      select 1 from public.team_members as member
      where member.team_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
        and member.status = 'active'
    )
    and not exists (
      select 1 from public.teams as team where team.logo_path = name
    )
  );

create function public.update_team_logo(p_team_id uuid, p_logo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or not exists (
    select 1 from public.team_members as member
    where member.team_id = p_team_id
      and member.user_id = v_user_id
      and member.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'ACTIVE_TEAM_MEMBER_REQUIRED';
  end if;
  if p_logo_path is null
    or (storage.foldername(p_logo_path))[1] <> p_team_id::text
    or (storage.foldername(p_logo_path))[2] <> v_user_id::text
    or (storage.foldername(p_logo_path))[3] is not null
    or lower(storage.extension(p_logo_path)) not in ('png', 'jpg', 'jpeg', 'webp')
    or not exists (
      select 1 from storage.objects as object
      where object.bucket_id = 'team-logos'
        and object.name = p_logo_path
        and object.metadata ->> 'mimetype' in ('image/png', 'image/jpeg', 'image/webp')
        and coalesce((object.metadata ->> 'size')::bigint, 2097153) between 1 and 2097152
    ) then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_LOGO_PATH';
  end if;

  update public.teams
  set logo_path = p_logo_path, updated_at = now()
  where id = p_team_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.update_team_logo(uuid, text) from public, anon, authenticated;
grant execute on function public.update_team_logo(uuid, text) to authenticated;

commit;