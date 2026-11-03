begin;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  match_number smallint not null check (match_number between 1 and 200),
  round_name text not null check (char_length(btrim(round_name)) between 1 and 100),
  scheduled_at timestamptz not null,
  timezone text not null default 'UTC',
  duration_minutes smallint check (duration_minutes is null or duration_minutes between 1 and 720),
  status text not null default 'scheduled' check (status in ('scheduled', 'room_ready', 'live', 'completed', 'cancelled', 'delayed')),
  lobby_capacity smallint not null default 48 check (lobby_capacity between 1 and 100),
  public_notes text not null default '' check (char_length(public_notes) <= 2000),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, round_name, match_number)
);

create index matches_tournament_schedule_idx
  on public.matches (tournament_id, scheduled_at, match_number);

create index matches_public_schedule_idx
  on public.matches (scheduled_at, status);

create table public.match_team_assignments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  registration_id uuid not null references public.tournament_registrations (id) on delete restrict,
  team_id uuid not null references public.teams (id) on delete restrict,
  assigned_by uuid not null references auth.users (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unique (match_id, registration_id),
  unique (match_id, team_id)
);

create index match_team_assignments_team_idx
  on public.match_team_assignments (team_id, match_id);

create index match_team_assignments_registration_idx
  on public.match_team_assignments (registration_id, match_id);

create table public.match_room_credentials (
  match_id uuid primary key references public.matches (id) on delete cascade,
  room_id text check (room_id is null or char_length(btrim(room_id)) between 1 and 64),
  room_password text check (room_password is null or char_length(room_password) <= 128),
  release_at timestamptz,
  access_instructions text not null default '' check (char_length(access_instructions) <= 2000),
  status text not null default 'not_ready' check (status in ('not_ready', 'ready', 'closed')),
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (status <> 'ready' or (room_id is not null and release_at is not null)),
  check (status <> 'closed' or (room_id is null and room_password is null))
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete restrict,
  event_type text not null check (event_type in ('created', 'updated', 'status_changed', 'team_assigned', 'team_removed', 'room_updated')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index match_events_match_idx
  on public.match_events (match_id, created_at desc);

alter table public.matches enable row level security;
alter table public.match_team_assignments enable row level security;
alter table public.match_room_credentials enable row level security;
alter table public.match_events enable row level security;

revoke all on table public.matches, public.match_team_assignments,
  public.match_room_credentials, public.match_events from public, anon, authenticated;
grant select on table public.matches to anon, authenticated;
grant select on table public.match_team_assignments, public.match_events to authenticated;

create policy "Public can view schedules for published tournaments"
  on public.matches
  for select
  to anon, authenticated
  using (exists (
    select 1 from public.tournaments as tournament
    where tournament.id = matches.tournament_id and tournament.publication_status = 'published'
  ));

create policy "Admins can view all matches"
  on public.matches
  for select
  to authenticated
  using (rs_internal.is_tournament_admin());

create policy "Assigned teams can view their match assignment"
  on public.match_team_assignments
  for select
  to authenticated
  using (rs_internal.is_tournament_admin() or rs_internal.is_active_team_member(team_id));

create policy "Admins can view match events"
  on public.match_events
  for select
  to authenticated
  using (rs_internal.is_tournament_admin());

create function public.set_match_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_matches_updated_at
  before update on public.matches
  for each row execute function public.set_match_updated_at();

revoke all on function public.set_match_updated_at() from public, anon, authenticated;

create function public.save_match(p_match jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_match ->> 'id', '')::uuid;
  v_tournament_id uuid := (p_match ->> 'tournament_id')::uuid;
  v_name text := btrim(coalesce(p_match ->> 'name', ''));
  v_round text := btrim(coalesce(p_match ->> 'round_name', ''));
  v_number smallint := (p_match ->> 'match_number')::smallint;
  v_scheduled_at timestamptz := (p_match ->> 'scheduled_at')::timestamptz;
  v_timezone text := coalesce(nullif(p_match ->> 'timezone', ''), 'UTC');
  v_duration smallint := nullif(p_match ->> 'duration_minutes', '')::smallint;
  v_capacity smallint := coalesce(nullif(p_match ->> 'lobby_capacity', '')::smallint, 48);
  v_public_notes text := coalesce(p_match ->> 'public_notes', '');
  v_user_id uuid := (select auth.uid());
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if v_user_id is null or jsonb_typeof(p_match) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_MATCH_PAYLOAD';
  end if;
  if char_length(v_name) not between 2 and 120 or char_length(v_round) not between 1 and 100
    or v_number not between 1 and 200 or v_scheduled_at is null then
    raise exception using errcode = '22023', message = 'INVALID_MATCH_SCHEDULE';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
  end if;
  if v_capacity not between 1 and 100 or char_length(v_public_notes) > 2000 then
    raise exception using errcode = '22023', message = 'INVALID_MATCH_CONFIGURATION';
  end if;
  if v_tournament_id is null or not exists (
    select 1 from public.tournaments where id = v_tournament_id and publication_status <> 'cancelled'
  ) then
    raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND_OR_CANCELLED';
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.matches (
      id, tournament_id, name, match_number, round_name, scheduled_at, timezone,
      duration_minutes, lobby_capacity, public_notes, created_by
    ) values (
      v_id, v_tournament_id, v_name, v_number, v_round, v_scheduled_at, v_timezone,
      v_duration, v_capacity, v_public_notes, v_user_id
    );
    insert into public.match_events (match_id, actor_id, event_type, details)
    values (v_id, v_user_id, 'created', jsonb_build_object('tournament_id', v_tournament_id));
  else
    perform 1 from public.matches where id = v_id and tournament_id = v_tournament_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'MATCH_NOT_FOUND';
    end if;
    if exists (
      select 1 from public.match_team_assignments as assignment
      where assignment.match_id = v_id and assignment.team_id is not null
    ) and v_capacity < (select count(*) from public.match_team_assignments where match_id = v_id) then
      raise exception using errcode = '23514', message = 'CAPACITY_BELOW_ASSIGNED_TEAMS';
    end if;
    update public.matches set
      name = v_name,
      match_number = v_number,
      round_name = v_round,
      scheduled_at = v_scheduled_at,
      timezone = v_timezone,
      duration_minutes = v_duration,
      lobby_capacity = v_capacity,
      public_notes = v_public_notes
    where id = v_id;
    insert into public.match_events (match_id, actor_id, event_type)
    values (v_id, v_user_id, 'updated');
  end if;

  return v_id;
end;
$$;

create function public.set_match_status(p_match_id uuid, p_status text, p_public_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_user_id uuid := (select auth.uid());
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if p_status is null or p_status not in ('scheduled', 'room_ready', 'live', 'completed', 'cancelled', 'delayed') then
    raise exception using errcode = '22023', message = 'INVALID_MATCH_STATUS';
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'MATCH_NOT_FOUND';
  end if;
  if v_match.status in ('completed', 'cancelled') and p_status <> v_match.status then
    raise exception using errcode = '23514', message = 'MATCH_STATUS_TERMINAL';
  end if;
  if v_match.status = 'scheduled' and p_status not in ('scheduled', 'room_ready', 'delayed', 'cancelled') then
    raise exception using errcode = '23514', message = 'INVALID_MATCH_STATUS_TRANSITION';
  end if;
  if v_match.status = 'live' and p_status not in ('live', 'completed', 'delayed', 'cancelled') then
    raise exception using errcode = '23514', message = 'INVALID_MATCH_STATUS_TRANSITION';
  end if;
  if p_status in ('room_ready', 'live') and not exists (
    select 1 from public.match_room_credentials as room
    where room.match_id = p_match_id and room.status = 'ready'
      and room.room_id is not null and room.release_at is not null
  ) then
    raise exception using errcode = '23514', message = 'ROOM_NOT_READY';
  end if;
  if p_status = 'live' and not exists (
    select 1 from public.match_room_credentials as room
    where room.match_id = p_match_id and room.status = 'ready'
      and room.release_at <= clock_timestamp()
  ) then
    raise exception using errcode = '23514', message = 'ROOM_RELEASE_TIME_NOT_REACHED';
  end if;
  update public.matches set status = p_status, public_notes = coalesce(p_public_notes, public_notes)
  where id = p_match_id;
  if p_status in ('completed', 'cancelled') then
    update public.match_room_credentials set status = 'closed', room_id = null,
      room_password = null, updated_by = v_user_id, updated_at = now()
    where match_id = p_match_id;
  end if;
  insert into public.match_events (match_id, actor_id, event_type, details)
  values (p_match_id, v_user_id, 'status_changed', jsonb_build_object('from', v_match.status, 'to', p_status));
end;
$$;

create function public.assign_approved_registration_to_match(p_match_id uuid, p_registration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_registration public.tournament_registrations%rowtype;
  v_assignment_id uuid := gen_random_uuid();
  v_assigned_count integer;
  v_user_id uuid := (select auth.uid());
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'MATCH_NOT_FOUND';
  end if;
  if v_match.status in ('live', 'completed', 'cancelled') then
    raise exception using errcode = '23514', message = 'MATCH_NOT_ASSIGNABLE';
  end if;

  select * into v_registration from public.tournament_registrations
  where id = p_registration_id for update;
  if not found or v_registration.status <> 'approved' then
    raise exception using errcode = '23514', message = 'APPROVED_REGISTRATION_REQUIRED';
  end if;
  if v_registration.tournament_id <> v_match.tournament_id then
    raise exception using errcode = '23514', message = 'CROSS_TOURNAMENT_ASSIGNMENT_FORBIDDEN';
  end if;
  if exists (
    select 1 from public.match_team_assignments as assignment
    where assignment.match_id = p_match_id and assignment.team_id = v_registration.team_id
  ) then
    raise exception using errcode = '23505', message = 'TEAM_ALREADY_ASSIGNED_TO_MATCH';
  end if;
  select count(*) into v_assigned_count from public.match_team_assignments where match_id = p_match_id;
  if v_assigned_count >= v_match.lobby_capacity then
    raise exception using errcode = '23514', message = 'MATCH_LOBBY_FULL';
  end if;

  insert into public.match_team_assignments (id, match_id, registration_id, team_id, assigned_by)
  values (v_assignment_id, p_match_id, p_registration_id, v_registration.team_id, v_user_id);
  insert into public.match_events (match_id, actor_id, event_type, details)
  values (p_match_id, v_user_id, 'team_assigned', jsonb_build_object('registration_id', p_registration_id, 'team_id', v_registration.team_id));
  return v_assignment_id;
end;
$$;

create function public.remove_match_team_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.match_team_assignments%rowtype;
  v_match_status text;
  v_user_id uuid := (select auth.uid());
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  select * into v_assignment from public.match_team_assignments where id = p_assignment_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ASSIGNMENT_NOT_FOUND';
  end if;
  select status into v_match_status from public.matches where id = v_assignment.match_id for update;
  if not found or v_match_status in ('live', 'completed', 'cancelled') then
    raise exception using errcode = '23514', message = 'ASSIGNMENT_NOT_REMOVABLE';
  end if;
  delete from public.match_team_assignments where id = p_assignment_id;
  insert into public.match_events (match_id, actor_id, event_type, details)
  values (v_assignment.match_id, v_user_id, 'team_removed', jsonb_build_object('registration_id', v_assignment.registration_id, 'team_id', v_assignment.team_id));
end;
$$;

create function public.set_match_room_credentials(
  p_match_id uuid,
  p_room_id text,
  p_room_password text,
  p_release_at timestamptz,
  p_access_instructions text,
  p_room_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match_status text;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if p_room_status is null or p_room_status not in ('not_ready', 'ready', 'closed') then
    raise exception using errcode = '22023', message = 'INVALID_ROOM_STATUS';
  end if;
  if p_room_status = 'ready' and (
    nullif(btrim(p_room_id), '') is null or p_release_at is null
    or char_length(p_room_id) > 64 or char_length(coalesce(p_room_password, '')) > 128
  ) then
    raise exception using errcode = '22023', message = 'ROOM_CREDENTIALS_REQUIRED';
  end if;
  if char_length(coalesce(p_access_instructions, '')) > 2000 then
    raise exception using errcode = '22023', message = 'ROOM_INSTRUCTIONS_TOO_LONG';
  end if;
  select status into v_match_status from public.matches where id = p_match_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'MATCH_NOT_FOUND';
  end if;
  if v_match_status in ('completed', 'cancelled') and p_room_status = 'ready' then
    raise exception using errcode = '23514', message = 'ROOM_CANNOT_BE_READIED_FOR_TERMINAL_MATCH';
  end if;

  insert into public.match_room_credentials (
    match_id, room_id, room_password, release_at, access_instructions, status, updated_by
  ) values (
    p_match_id,
    case when p_room_status = 'ready' then btrim(p_room_id) else null end,
    case when p_room_status = 'ready' then nullif(p_room_password, '') else null end,
    case when p_room_status = 'ready' then p_release_at else null end,
    coalesce(p_access_instructions, ''), p_room_status, v_user_id
  )
  on conflict (match_id) do update set
    room_id = excluded.room_id,
    room_password = excluded.room_password,
    release_at = excluded.release_at,
    access_instructions = excluded.access_instructions,
    status = excluded.status,
    updated_by = excluded.updated_by,
    updated_at = now();

  if p_room_status <> 'ready' then
    update public.matches set status = 'scheduled'
    where id = p_match_id and status = 'room_ready';
  end if;

  insert into public.match_events (match_id, actor_id, event_type, details)
  values (p_match_id, v_user_id, 'room_updated', jsonb_build_object('room_status', p_room_status));
end;
$$;

create function public.get_match_room_credentials_admin(p_match_id uuid)
returns table (room_id text, room_password text, release_at timestamptz, access_instructions text, room_status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  return query
    select room.room_id, room.room_password, room.release_at, room.access_instructions, room.status
    from public.match_room_credentials as room where room.match_id = p_match_id;
end;
$$;

create function public.get_match_room_credentials(p_match_id uuid)
returns table (room_id text, room_password text, release_at timestamptz, access_instructions text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match_status text;
  v_team_id uuid;
  v_tournament_id uuid;
  v_tournament_publication_status text;
  v_tournament_lifecycle_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select match.status, match.tournament_id, tournament.publication_status, tournament.lifecycle_status
  into v_match_status, v_tournament_id, v_tournament_publication_status, v_tournament_lifecycle_status
  from public.matches as match
  join public.tournaments as tournament on tournament.id = match.tournament_id
  where match.id = p_match_id
  for share;
  if not found or v_match_status in ('cancelled', 'completed')
    or v_tournament_publication_status <> 'published'
    or v_tournament_lifecycle_status = 'completed' then
    raise exception using errcode = '42501', message = 'MATCH_NOT_ELIGIBLE_FOR_ROOM_ACCESS';
  end if;
  if v_match_status not in ('room_ready', 'live') then
    raise exception using errcode = '42501', message = 'MATCH_NOT_READY_FOR_ROOM_ACCESS';
  end if;

  select assignment.team_id into v_team_id
  from public.match_team_assignments as assignment
  join public.tournament_registrations as registration
    on registration.id = assignment.registration_id
  join public.team_members as member
    on member.team_id = assignment.team_id
  where assignment.match_id = p_match_id
    and registration.tournament_id = v_tournament_id
    and registration.status = 'approved'
    and member.user_id = v_user_id
    and member.status = 'active'
  limit 1
  for share of registration, member;

  if v_team_id is null then
    raise exception using errcode = '42501', message = 'MATCH_TEAM_ACCESS_DENIED';
  end if;

  return query
    select room.room_id, room.room_password, room.release_at, room.access_instructions
    from public.match_room_credentials as room
    where room.match_id = p_match_id
      and room.status = 'ready'
      and room.release_at <= clock_timestamp();

  if not found then
    raise exception using errcode = '42501', message = 'ROOM_NOT_RELEASED';
  end if;
end;
$$;

create function public.get_my_team_matches(p_team_id uuid)
returns table (
  match_id uuid,
  tournament_id uuid,
  tournament_name text,
  tournament_slug text,
  team_id uuid,
  team_name text,
  match_name text,
  match_number smallint,
  round_name text,
  scheduled_at timestamptz,
  timezone text,
  duration_minutes smallint,
  match_status text,
  room_status text,
  room_release_at timestamptz,
  public_notes text
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
    select match.id, tournament.id, tournament.name, tournament.slug,
      team.id, team.name, match.name, match.match_number, match.round_name,
      match.scheduled_at, match.timezone, match.duration_minutes, match.status,
      coalesce(room.status, 'not_ready'), room.release_at, match.public_notes
    from public.match_team_assignments as assignment
    join public.matches as match on match.id = assignment.match_id
    join public.tournaments as tournament on tournament.id = match.tournament_id
    join public.teams as team on team.id = assignment.team_id
    join public.tournament_registrations as registration
      on registration.id = assignment.registration_id and registration.status = 'approved'
    left join public.match_room_credentials as room on room.match_id = match.id
    where assignment.team_id = p_team_id
      and tournament.publication_status = 'published'
      and tournament.lifecycle_status <> 'completed'
    order by match.scheduled_at;
end;
$$;

create function public.get_tournament_matches_admin(p_tournament_id uuid)
returns table (
  match_id uuid,
  name text,
  match_number smallint,
  round_name text,
  scheduled_at timestamptz,
  timezone text,
  duration_minutes smallint,
  status text,
  lobby_capacity smallint,
  public_notes text,
  assigned_count bigint
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
    select match.id, match.name, match.match_number, match.round_name,
      match.scheduled_at, match.timezone, match.duration_minutes, match.status,
      match.lobby_capacity, match.public_notes,
      (select count(*) from public.match_team_assignments as assignment where assignment.match_id = match.id)
    from public.matches as match
    where match.tournament_id = p_tournament_id
    order by match.scheduled_at, match.match_number;
end;
$$;

create function public.get_match_assignments_admin(p_match_id uuid)
returns table (
  assignment_id uuid,
  registration_id uuid,
  team_id uuid,
  team_name text,
  captain_name text,
  assigned_at timestamptz
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
    select assignment.id, assignment.registration_id, team.id, team.name,
      coalesce(profile.full_name, 'Team captain'), assignment.assigned_at
    from public.match_team_assignments as assignment
    join public.teams as team on team.id = assignment.team_id
    left join public.team_members as captain
      on captain.team_id = team.id and captain.role = 'captain' and captain.status = 'active'
    left join public.profiles as profile on profile.id = captain.user_id
    where assignment.match_id = p_match_id
    order by team.name;
end;
$$;

create or replace view public.matches_public
with (security_invoker = true)
as
select match.id, match.tournament_id, tournament.name as tournament_name,
  tournament.slug as tournament_slug, match.name as match_name,
  match.match_number, match.round_name, match.scheduled_at,
  match.timezone, match.duration_minutes, match.status, match.public_notes,
  match.created_at
from public.matches as match
join public.tournaments as tournament on tournament.id = match.tournament_id
where tournament.publication_status = 'published';

grant select on public.matches_public to anon, authenticated;

revoke all on function public.save_match(jsonb) from public, anon;
revoke all on function public.set_match_status(uuid, text, text) from public, anon;
revoke all on function public.assign_approved_registration_to_match(uuid, uuid) from public, anon;
revoke all on function public.remove_match_team_assignment(uuid) from public, anon;
revoke all on function public.set_match_room_credentials(uuid, text, text, timestamptz, text, text) from public, anon;
revoke all on function public.get_match_room_credentials_admin(uuid) from public, anon;
revoke all on function public.get_match_room_credentials(uuid) from public, anon;
revoke all on function public.get_my_team_matches(uuid) from public, anon;
revoke all on function public.get_tournament_matches_admin(uuid) from public, anon;
revoke all on function public.get_match_assignments_admin(uuid) from public, anon;
grant execute on function public.save_match(jsonb) to authenticated;
grant execute on function public.set_match_status(uuid, text, text) to authenticated;
grant execute on function public.assign_approved_registration_to_match(uuid, uuid) to authenticated;
grant execute on function public.remove_match_team_assignment(uuid) to authenticated;
grant execute on function public.set_match_room_credentials(uuid, text, text, timestamptz, text, text) to authenticated;
grant execute on function public.get_match_room_credentials_admin(uuid) to authenticated;
grant execute on function public.get_match_room_credentials(uuid) to authenticated;
grant execute on function public.get_my_team_matches(uuid) to authenticated;
grant execute on function public.get_tournament_matches_admin(uuid) to authenticated;
grant execute on function public.get_match_assignments_admin(uuid) to authenticated;

commit;