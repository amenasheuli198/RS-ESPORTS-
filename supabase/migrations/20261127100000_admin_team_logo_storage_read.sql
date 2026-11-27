begin;

drop policy if exists "Admins can read team logos" on storage.objects;
create policy "Admins can read team logos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'team-logos'
    and rs_internal.is_tournament_admin()
  );

drop policy if exists "Members can delete their own unused team logos" on storage.objects;
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
      select 1 from public.teams as team
      where team.logo_path = objects.name
    )
  );

commit;
