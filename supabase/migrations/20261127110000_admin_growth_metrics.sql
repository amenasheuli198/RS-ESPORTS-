begin;

create or replace function public.get_admin_growth_metrics(p_since timestamptz)
returns table (
  new_users bigint,
  new_teams bigint,
  new_tournaments bigint,
  new_registrations bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_since is null then
    raise exception using errcode = '22023', message = 'INVALID_METRIC_RANGE';
  end if;

  return query
    select (select count(*) from auth.users as account where account.created_at >= p_since),
      (select count(*) from public.teams as team where team.created_at >= p_since),
      (select count(*) from public.tournaments as tournament where tournament.created_at >= p_since),
      (select count(*) from (
        select entry.id from public.competition_entries as entry where entry.registered_at >= p_since
        union all
        select registration.id from public.tournament_registrations as registration where registration.registered_at >= p_since
      ) as registrations);
end;
$$;

revoke all on function public.get_admin_growth_metrics(timestamptz) from public, anon, authenticated;
grant execute on function public.get_admin_growth_metrics(timestamptz) to authenticated;

commit;
