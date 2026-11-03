begin;

create table public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete restrict,
  team_id uuid not null references public.teams (id) on delete restrict,
  registered_by uuid not null references auth.users (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'disqualified')),
  registered_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(btrim(rejection_reason)) between 1 and 2000),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('approved', 'rejected', 'disqualified') or (reviewed_by is not null and reviewed_at is not null)),
  check (
    (status in ('rejected', 'disqualified') and rejection_reason is not null)
    or (status not in ('rejected', 'disqualified') and rejection_reason is null)
  )
);

create unique index tournament_registrations_one_active_team_per_tournament
  on public.tournament_registrations (tournament_id, team_id)
  where status in ('pending', 'approved');

create index tournament_registrations_tournament_status_idx
  on public.tournament_registrations (tournament_id, status, registered_at desc);

create index tournament_registrations_team_status_idx
  on public.tournament_registrations (team_id, status, registered_at desc);

create index tournament_registrations_captain_idx
  on public.tournament_registrations (registered_by, registered_at desc);

create table public.tournament_registration_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.tournament_registrations (id) on delete cascade,
  from_status text check (from_status is null or from_status in ('pending', 'approved', 'rejected', 'withdrawn', 'disqualified')),
  to_status text not null check (to_status in ('pending', 'approved', 'rejected', 'withdrawn', 'disqualified')),
  actor_id uuid not null references auth.users (id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 2000),
  created_at timestamptz not null default now()
);

create index tournament_registration_events_registration_idx
  on public.tournament_registration_events (registration_id, created_at desc);

create table public.tournament_registration_notifications (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references public.tournament_registrations (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('submitted', 'approved', 'rejected', 'withdrawn', 'disqualified', 'tournament_cancelled')),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index tournament_registration_notifications_recipient_idx
  on public.tournament_registration_notifications (recipient_id, created_at desc);

create function public.prevent_tournament_capacity_below_reservations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.max_teams < (
    select count(*) from public.tournament_registrations as registration
    where registration.tournament_id = old.id
      and registration.status in ('pending', 'approved')
  ) then
    raise exception using errcode = '23514', message = 'MAX_TEAMS_BELOW_RESERVED_REGISTRATIONS';
  end if;
  return new;
end;
$$;

create trigger prevent_tournament_capacity_below_reservations
  before update of max_teams on public.tournaments
  for each row execute function public.prevent_tournament_capacity_below_reservations();

revoke all on function public.prevent_tournament_capacity_below_reservations() from public, anon, authenticated;

alter table public.tournament_registrations enable row level security;
alter table public.tournament_registration_events enable row level security;
alter table public.tournament_registration_notifications enable row level security;

revoke all on table public.tournament_registrations, public.tournament_registration_events,
  public.tournament_registration_notifications from public, anon, authenticated;
grant select on table public.tournament_registrations, public.tournament_registration_events,
  public.tournament_registration_notifications to authenticated;
grant update (read_at) on table public.tournament_registration_notifications to authenticated;

create policy "Team members and admins can view registrations"
  on public.tournament_registrations
  for select
  to authenticated
  using (rs_internal.is_tournament_admin() or rs_internal.is_active_team_member(team_id));

create policy "Team members and admins can view registration history"
  on public.tournament_registration_events
  for select
  to authenticated
  using (
    rs_internal.is_tournament_admin()
    or exists (
      select 1 from public.tournament_registrations as registration
      where registration.id = registration_id
        and rs_internal.is_active_team_member(registration.team_id)
    )
  );

create policy "Users can read their own tournament notifications"
  on public.tournament_registration_notifications
  for select
  to authenticated
  using (recipient_id = (select auth.uid()));

create policy "Users can mark their own tournament notifications read"
  on public.tournament_registration_notifications
  for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create function public.set_registration_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_tournament_registrations_updated_at
  before update on public.tournament_registrations
  for each row execute function public.set_registration_updated_at();

revoke all on function public.set_registration_updated_at() from public, anon, authenticated;

create function rs_internal.public_reserved_registration_slots(p_tournament_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.tournament_registrations as registration
  join public.tournaments as tournament on tournament.id = registration.tournament_id
  where registration.tournament_id = p_tournament_id
    and registration.status in ('pending', 'approved')
    and tournament.publication_status = 'published';
$$;

revoke all on function rs_internal.public_reserved_registration_slots(uuid) from public;
grant execute on function rs_internal.public_reserved_registration_slots(uuid) to anon, authenticated;
grant usage on schema rs_internal to anon;

create or replace view public.tournaments_public
with (security_invoker = true)
as
select tournament.id, tournament.name, tournament.slug, tournament.description,
  tournament.banner_path, tournament.game_code, tournament.mode_code, tournament.format_code,
  tournament.max_teams, tournament.starting_players_required, tournament.substitute_allowed,
  tournament.entry_type, tournament.entry_fee, tournament.prize_pool, tournament.prize_distribution,
  tournament.eligibility, tournament.participation_requirements, tournament.match_rules,
  tournament.scoring_system, tournament.disqualification_rules, tournament.general_instructions,
  tournament.match_schedule, tournament.timezone, tournament.registration_opens_at,
  tournament.registration_closes_at, tournament.starts_at, tournament.ends_at,
  tournament.is_featured, tournament.created_at, tournament.publication_status,
  tournament.lifecycle_status,
  case
    when tournament.publication_status = 'cancelled' then 'Cancelled'
    when tournament.publication_status <> 'published' then 'Draft'
    when tournament.lifecycle_status = 'completed' or (tournament.ends_at is not null and now() >= tournament.ends_at) then 'Completed'
    when tournament.lifecycle_status = 'live' or now() >= tournament.starts_at then 'Live'
    when now() < tournament.registration_opens_at then 'Upcoming'
    when now() >= tournament.registration_closes_at then 'Registration Closed'
    when tournament.registration_closes_at <= now() + interval '48 hours' then 'Registration Closing Soon'
    else 'Registration Open'
  end as tournament_status,
  slots.reserved_slots,
  greatest(tournament.max_teams - slots.reserved_slots, 0) as available_slots
from public.tournaments as tournament
cross join lateral (
  select rs_internal.public_reserved_registration_slots(tournament.id) as reserved_slots
) as slots;

grant select on public.tournaments_public to anon, authenticated;

create function public.register_team_for_tournament(p_tournament_id uuid, p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tournament public.tournaments%rowtype;
  v_registration_id uuid := gen_random_uuid();
  v_starting_players integer;
  v_substitutes integer;
  v_active_players integer;
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

  select count(*) filter (where member.role in ('captain', 'starting_player')),
         count(*) filter (where member.role = 'substitute'),
         count(*)
  into v_starting_players, v_substitutes, v_active_players
  from public.team_members as member
  where member.team_id = p_team_id and member.status = 'active';

  if v_starting_players < v_tournament.starting_players_required then
    raise exception using errcode = '23514', message = 'STARTING_ROSTER_INCOMPLETE';
  end if;
  if v_tournament.game_code = 'free_fire' and v_tournament.mode_code = 'battle_royale'
    and v_tournament.format_code = 'squad' and v_starting_players < 4 then
    raise exception using errcode = '23514', message = 'FREE_FIRE_SQUAD_REQUIRES_FOUR_STARTERS';
  end if;
  if v_substitutes > 0 and not v_tournament.substitute_allowed then
    raise exception using errcode = '23514', message = 'SUBSTITUTE_NOT_ALLOWED';
  end if;
  if v_active_players > v_tournament.starting_players_required + case when v_tournament.substitute_allowed then 1 else 0 end then
    raise exception using errcode = '23514', message = 'ROSTER_EXCEEDS_TOURNAMENT_LIMIT';
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

create function public.withdraw_tournament_registration(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_team_id uuid;
  v_tournament public.tournaments%rowtype;
  v_registration public.tournament_registrations%rowtype;
begin
  select registration.tournament_id, registration.team_id
  into v_tournament_id, v_team_id
  from public.tournament_registrations as registration
  where registration.id = p_registration_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;

  select * into v_tournament from public.tournaments where id = v_tournament_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND';
  end if;
  perform 1 from public.teams where id = v_team_id for update;
  if not found or not rs_internal.is_active_team_captain(v_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_CAPTAIN_REQUIRED';
  end if;

  select * into v_registration from public.tournament_registrations
  where id = p_registration_id for update;
  if not found or v_registration.status not in ('pending', 'approved') then
    raise exception using errcode = '23514', message = 'REGISTRATION_NOT_WITHDRAWABLE';
  end if;
  if v_tournament.publication_status <> 'published' or v_tournament.lifecycle_status <> 'scheduled'
    or now() >= v_tournament.registration_closes_at or now() >= v_tournament.starts_at then
    raise exception using errcode = '23514', message = 'WITHDRAWAL_CUTOFF_PASSED';
  end if;

  update public.tournament_registrations
  set status = 'withdrawn', rejection_reason = null
  where id = p_registration_id;

  insert into public.tournament_registration_events (
    registration_id, from_status, to_status, actor_id
  ) values (p_registration_id, v_registration.status, 'withdrawn', (select auth.uid()));

  insert into public.tournament_registration_notifications (
    registration_id, tournament_id, recipient_id, event_type, message
  ) values (
    p_registration_id, v_tournament_id, v_registration.registered_by, 'withdrawn',
    'Your registration for ' || v_tournament.name || ' was withdrawn.'
  );
end;
$$;

create function public.review_tournament_registration(
  p_registration_id uuid,
  p_decision text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_team_id uuid;
  v_tournament public.tournaments%rowtype;
  v_registration public.tournament_registrations%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_starting_players integer;
  v_substitutes integer;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected', 'disqualified') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_DECISION';
  end if;
  if p_decision in ('rejected', 'disqualified') and (v_reason is null or char_length(v_reason) > 2000) then
    raise exception using errcode = '22023', message = 'REVIEW_REASON_REQUIRED';
  end if;

  select registration.tournament_id, registration.team_id
  into v_tournament_id, v_team_id
  from public.tournament_registrations as registration
  where registration.id = p_registration_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;

  select * into v_tournament from public.tournaments where id = v_tournament_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND';
  end if;
  perform 1 from public.teams where id = v_team_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND';
  end if;
  select * into v_registration from public.tournament_registrations
  where id = p_registration_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;
  if v_registration.registered_by = (select auth.uid()) then
    raise exception using errcode = '42501', message = 'SELF_REVIEW_FORBIDDEN';
  end if;

  if p_decision in ('approved', 'rejected') and v_registration.status <> 'pending' then
    raise exception using errcode = '23514', message = 'REGISTRATION_NOT_PENDING';
  end if;
  if p_decision = 'disqualified' and v_registration.status not in ('pending', 'approved') then
    raise exception using errcode = '23514', message = 'REGISTRATION_NOT_DISQUALIFIABLE';
  end if;
  if p_decision = 'approved' then
    if v_tournament.publication_status <> 'published' or v_tournament.lifecycle_status <> 'scheduled'
      or v_tournament.entry_type <> 'free' or now() >= v_tournament.starts_at then
      raise exception using errcode = '23514', message = 'REGISTRATION_NO_LONGER_APPROVABLE';
    end if;
    select count(*) filter (where member.role in ('captain', 'starting_player')),
           count(*) filter (where member.role = 'substitute')
    into v_starting_players, v_substitutes
    from public.team_members as member
    where member.team_id = v_team_id and member.status = 'active';
    if not exists (
      select 1 from public.team_members as member
      where member.team_id = v_team_id and member.role = 'captain' and member.status = 'active'
    ) or v_starting_players < v_tournament.starting_players_required
      or (v_tournament.game_code = 'free_fire' and v_tournament.mode_code = 'battle_royale'
        and v_tournament.format_code = 'squad' and v_starting_players < 4)
      or (v_substitutes > 0 and not v_tournament.substitute_allowed) then
      raise exception using errcode = '23514', message = 'TEAM_ROSTER_NO_LONGER_ELIGIBLE';
    end if;
  end if;

  update public.tournament_registrations
  set status = p_decision,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      rejection_reason = case when p_decision in ('rejected', 'disqualified') then v_reason else null end
  where id = p_registration_id;

  insert into public.tournament_registration_events (
    registration_id, from_status, to_status, actor_id, reason
  ) values (p_registration_id, v_registration.status, p_decision, (select auth.uid()), v_reason);

  insert into public.tournament_registration_notifications (
    registration_id, tournament_id, recipient_id, event_type, message
  ) values (
    p_registration_id, v_tournament_id, v_registration.registered_by, p_decision,
    case p_decision
      when 'approved' then 'Your registration for ' || v_tournament.name || ' was approved.'
      when 'rejected' then 'Your registration for ' || v_tournament.name || ' was rejected.'
      else 'Your team was disqualified from ' || v_tournament.name || '.'
    end
  );
end;
$$;

create function public.get_tournament_registrations_admin(p_tournament_id uuid)
returns table (
  registration_id uuid,
  team_id uuid,
  team_name text,
  captain_name text,
  status text,
  registered_at timestamptz,
  reviewed_at timestamptz,
  rejection_reason text,
  notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;

  return query
    select registration.id, registration.team_id, team.name,
      coalesce(profile.full_name, 'Team captain'), registration.status,
      registration.registered_at, registration.reviewed_at,
      registration.rejection_reason, registration.notes
    from public.tournament_registrations as registration
    join public.teams as team on team.id = registration.team_id
    left join public.team_members as captain
      on captain.team_id = registration.team_id and captain.role = 'captain' and captain.status = 'active'
    left join public.profiles as profile on profile.id = captain.user_id
    where registration.tournament_id = p_tournament_id
    order by registration.registered_at desc;
end;
$$;

create function public.get_tournament_registration_roster_admin(p_registration_id uuid)
returns table (
  user_id uuid,
  full_name text,
  ign text,
  free_fire_uid text,
  role text,
  slot smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  select registration.team_id into v_team_id
  from public.tournament_registrations as registration
  where registration.id = p_registration_id;
  if v_team_id is null then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;

  return query
    select member.user_id, coalesce(profile.full_name, 'Player'), member.ign,
      member.free_fire_uid, member.role, member.slot
    from public.team_members as member
    left join public.profiles as profile on profile.id = member.user_id
    where member.team_id = v_team_id and member.status = 'active'
    order by member.slot;
end;
$$;

create function public.get_my_team_registration_records(p_team_id uuid)
returns table (
  registration_id uuid,
  tournament_id uuid,
  tournament_name text,
  tournament_slug text,
  team_id uuid,
  team_name text,
  status text,
  registered_at timestamptz,
  entry_type text,
  entry_fee numeric,
  prize_pool numeric,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  timezone text,
  publication_status text,
  lifecycle_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_active_team_member(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_ACCESS_DENIED';
  end if;

  return query
    select registration.id, tournament.id, tournament.name, tournament.slug,
      team.id, team.name, registration.status, registration.registered_at,
      tournament.entry_type, tournament.entry_fee, tournament.prize_pool,
      tournament.registration_closes_at, tournament.starts_at, tournament.timezone,
      tournament.publication_status, tournament.lifecycle_status
    from public.tournament_registrations as registration
    join public.tournaments as tournament on tournament.id = registration.tournament_id
    join public.teams as team on team.id = registration.team_id
    where registration.team_id = p_team_id
    order by registration.registered_at desc;
end;
$$;

create function public.notify_tournament_registrations_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.publication_status is distinct from new.publication_status
    and new.publication_status = 'cancelled' then
    insert into public.tournament_registration_notifications (
      registration_id, tournament_id, recipient_id, event_type, message
    )
    select registration.id, new.id, registration.registered_by,
      'tournament_cancelled', 'The tournament ' || new.name || ' was cancelled.'
    from public.tournament_registrations as registration
    where registration.tournament_id = new.id
      and registration.status in ('pending', 'approved');
  end if;
  return new;
end;
$$;

create trigger notify_tournament_registration_cancellation
  after update of publication_status on public.tournaments
  for each row execute function public.notify_tournament_registrations_cancelled();

revoke all on function public.notify_tournament_registrations_cancelled() from public, anon, authenticated;

revoke all on function public.register_team_for_tournament(uuid, uuid) from public, anon;
revoke all on function public.withdraw_tournament_registration(uuid) from public, anon;
revoke all on function public.review_tournament_registration(uuid, text, text) from public, anon;
revoke all on function public.get_tournament_registrations_admin(uuid) from public, anon;
revoke all on function public.get_tournament_registration_roster_admin(uuid) from public, anon;
revoke all on function public.get_my_team_registration_records(uuid) from public, anon;
grant execute on function public.register_team_for_tournament(uuid, uuid) to authenticated;
grant execute on function public.withdraw_tournament_registration(uuid) to authenticated;
grant execute on function public.review_tournament_registration(uuid, text, text) to authenticated;
grant execute on function public.get_tournament_registrations_admin(uuid) to authenticated;
grant execute on function public.get_tournament_registration_roster_admin(uuid) to authenticated;
grant execute on function public.get_my_team_registration_records(uuid) to authenticated;

commit;