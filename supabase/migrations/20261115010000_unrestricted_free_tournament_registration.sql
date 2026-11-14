begin;

create or replace function public.register_team_for_tournament(p_tournament_id uuid, p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tournament public.tournaments%rowtype;
  v_registration_id uuid := gen_random_uuid();
  v_reserved_slots integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND';
  end if;

  if v_tournament.publication_status <> 'published' then
    raise exception using errcode = '23514', message = 'TOURNAMENT_NOT_PUBLISHED';
  end if;
  if v_tournament.lifecycle_status <> 'scheduled' or now() < v_tournament.registration_opens_at
    or now() >= v_tournament.registration_closes_at or now() >= v_tournament.starts_at
    or (v_tournament.ends_at is not null and now() >= v_tournament.ends_at) then
    raise exception using errcode = '23514', message = 'REGISTRATION_CLOSED';
  end if;
  if v_tournament.entry_type <> 'free' or v_tournament.entry_fee <> 0 then
    raise exception using errcode = '23514', message = 'PAYMENT_VERIFICATION_REQUIRED';
  end if;

  perform 1 from public.teams where id = p_team_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND';
  end if;
  if not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_CAPTAIN_REQUIRED';
  end if;

  if exists (
    select 1 from public.tournament_registrations as registration
    where registration.tournament_id = p_tournament_id
      and registration.team_id = p_team_id
      and registration.status in ('pending', 'approved')
  ) then
    raise exception using errcode = '23505', message = 'TEAM_ALREADY_REGISTERED';
  end if;

  select count(*) into v_reserved_slots
  from public.tournament_registrations as registration
  where registration.tournament_id = p_tournament_id
    and registration.status in ('pending', 'approved');
  if v_reserved_slots >= v_tournament.max_teams then
    raise exception using errcode = '23514', message = 'TOURNAMENT_FULL';
  end if;

  insert into public.tournament_registrations (
    id, tournament_id, team_id, registered_by, status
  ) values (
    v_registration_id, p_tournament_id, p_team_id, v_user_id, 'pending'
  );

  insert into public.tournament_registration_events (
    registration_id, from_status, to_status, actor_id
  ) values (v_registration_id, null, 'pending', v_user_id);

  insert into public.tournament_registration_notifications (
    registration_id, tournament_id, recipient_id, event_type, message
  ) values (
    v_registration_id, p_tournament_id, v_user_id, 'submitted',
    'Your team registration for ' || v_tournament.name || ' was submitted for review.'
  );

  return v_registration_id;
end;
$$;

revoke all on function public.register_team_for_tournament(uuid, uuid) from public, anon;
grant execute on function public.register_team_for_tournament(uuid, uuid) to authenticated;

commit;