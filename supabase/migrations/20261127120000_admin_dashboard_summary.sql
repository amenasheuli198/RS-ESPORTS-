begin;

create or replace function public.get_admin_dashboard_summary()
returns table (
  registered_users bigint,
  total_teams bigint,
  total_tournaments bigint,
  active_tournaments bigint,
  pending_registrations bigint,
  scheduled_matches bigint,
  live_matches bigint,
  completed_matches bigint,
  published_results bigint,
  verified_revenue numeric
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

  return query
    select (select count(*) from auth.users),
      (select count(*) from public.teams),
      (select count(*) from public.tournaments),
      (select count(*) from public.tournaments
        where publication_status = 'published' and lifecycle_status in ('scheduled', 'live')),
      (select count(*) from (
        select entry.id from public.competition_entries as entry
        where entry.status in ('pending_payment', 'payment_rejected', 'pending_review')
        union all
        select registration.id from public.tournament_registrations as registration
        where registration.status = 'pending'
      ) as pending),
      (select count(*) from public.matches where status = 'scheduled'),
      (select count(*) from public.matches where status = 'live'),
      (select count(*) from public.matches where status = 'completed'),
      (select count(*) from public.match_results where status = 'published'),
      (select coalesce(sum(payment.amount), 0)::numeric
        from public.payments as payment
        where payment.status = 'approved' and payment.currency = 'BDT');
end;
$$;

revoke all on function public.get_admin_dashboard_summary() from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_summary() to authenticated;

commit;
