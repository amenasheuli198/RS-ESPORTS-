begin;

create or replace function rs_internal.has_competition_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', ''))
    when 'super_admin' then true
    when 'super-admin' then true
    when 'admin' then true
    when 'competition_manager' then p_permission = 'manage_competitions'
    when 'payment_reviewer' then p_permission = 'review_payments'
    when 'moderator' then p_permission = 'moderate'
    when 'support_agent' then p_permission = 'manage_support'
    else false
  end;
$$;

revoke all on function rs_internal.has_competition_permission(text) from public, anon;
grant execute on function rs_internal.has_competition_permission(text) to anon, authenticated;

create or replace function rs_internal.is_tournament_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', ''))
    in ('admin', 'super_admin', 'super-admin');
$$;

revoke all on function rs_internal.is_tournament_admin() from public, anon;
grant execute on function rs_internal.is_tournament_admin() to authenticated;

create function public.update_quick_match_schedule(
  p_competition_id uuid,
  p_registration_opens_at timestamptz,
  p_registration_closes_at timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_competition public.competitions%rowtype;
  v_timezone text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
begin
  if v_user_id is null or not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if p_registration_opens_at is null or p_registration_closes_at is null or p_starts_at is null
    or p_registration_opens_at >= p_registration_closes_at
    or p_registration_closes_at >= p_starts_at
    or (p_ends_at is not null and p_starts_at >= p_ends_at)
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception using errcode = '22023', message = 'INVALID_QUICK_MATCH_SCHEDULE';
  end if;

  select * into v_competition
  from public.competitions
  where id = p_competition_id
  for update;
  if not found or v_competition.competition_type <> 'quick_match'
    or v_competition.status in ('completed', 'cancelled') then
    raise exception using errcode = '23514', message = 'QUICK_MATCH_NOT_SCHEDULABLE';
  end if;

  update public.competitions
  set registration_opens_at = p_registration_opens_at,
      registration_closes_at = p_registration_closes_at,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      timezone = v_timezone,
      updated_at = now()
  where id = p_competition_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'quick_match_schedule_updated', 'competition', p_competition_id,
    jsonb_build_object(
      'registration_opens_at', p_registration_opens_at,
      'registration_closes_at', p_registration_closes_at,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'timezone', v_timezone
    ));
end;
$$;

revoke all on function public.update_quick_match_schedule(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.update_quick_match_schedule(uuid, timestamptz, timestamptz, timestamptz, timestamptz, text) to authenticated;

create function public.update_quick_match_schedule_time(
  p_match_id uuid,
  p_scheduled_at timestamptz,
  p_timezone text,
  p_duration_minutes smallint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
  v_timezone text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
begin
  if v_user_id is null or not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if p_scheduled_at is null
    or (p_duration_minutes is not null and p_duration_minutes not between 1 and 720)
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception using errcode = '22023', message = 'INVALID_QUICK_MATCH_TIME';
  end if;

  select * into v_match
  from public.matches
  where id = p_match_id
  for update;
  if not found or v_match.competition_id is null
    or v_match.status not in ('scheduled', 'room_ready', 'delayed')
    or not exists (
      select 1 from public.competitions
      where id = v_match.competition_id and competition_type = 'quick_match'
    ) then
    raise exception using errcode = '23514', message = 'QUICK_MATCH_NOT_RESCHEDULABLE';
  end if;

  update public.matches
  set scheduled_at = p_scheduled_at,
      timezone = v_timezone,
      duration_minutes = p_duration_minutes,
      updated_at = now()
  where id = p_match_id;

  update public.match_room_credentials
  set release_at = greatest(release_at, p_scheduled_at), updated_by = v_user_id, updated_at = now()
  where match_id = p_match_id and status = 'ready';

  insert into public.match_events (match_id, actor_id, event_type, details)
  values (p_match_id, v_user_id, 'updated', jsonb_build_object(
    'scheduled_at', p_scheduled_at,
    'timezone', v_timezone,
    'duration_minutes', p_duration_minutes
  ));
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'quick_match_time_updated', 'match', p_match_id,
    jsonb_build_object('scheduled_at', p_scheduled_at, 'timezone', v_timezone));
end;
$$;

revoke all on function public.update_quick_match_schedule_time(uuid, timestamptz, text, smallint) from public, anon, authenticated;
grant execute on function public.update_quick_match_schedule_time(uuid, timestamptz, text, smallint) to authenticated;

commit;