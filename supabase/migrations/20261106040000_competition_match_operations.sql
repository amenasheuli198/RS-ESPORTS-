begin;

alter table public.matches
  alter column tournament_id drop not null,
  add column competition_id uuid references public.competitions (id) on delete restrict,
  add column stage_id uuid,
  add column round_id uuid;

update public.matches as match
set competition_id = competition.id
from public.competitions as competition
where match.tournament_id = competition.legacy_tournament_id
  and match.competition_id is null;

alter table public.matches
  add constraint matches_competition_stage_fk
    foreign key (stage_id, competition_id) references public.competition_stages (id, competition_id) on delete restrict,
  add constraint matches_competition_round_fk
    foreign key (round_id, competition_id) references public.competition_rounds (id, competition_id) on delete restrict;

create unique index matches_competition_round_number_unique
  on public.matches (competition_id, round_name, match_number)
  where competition_id is not null;

alter table public.match_team_assignments
  alter column registration_id drop not null,
  add column entry_id uuid references public.competition_entries (id) on delete restrict,
  add constraint match_team_assignments_registration_source_check
    check ((registration_id is not null) <> (entry_id is not null));

create unique index match_team_assignments_entry_unique
  on public.match_team_assignments (match_id, entry_id)
  where entry_id is not null;

create table public.match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  entry_id uuid not null references public.competition_entries (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  assigned_by uuid not null references auth.users (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unique (match_id, entry_id),
  unique (match_id, user_id)
);

create function public.link_legacy_match_to_competition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.competition_id is null and new.tournament_id is not null then
    select competition.id into new.competition_id
    from public.competitions as competition
    where competition.legacy_tournament_id = new.tournament_id;
  end if;
  return new;
end;
$$;
revoke all on function public.link_legacy_match_to_competition() from public, anon, authenticated;

create trigger link_legacy_match_competition
  before insert or update of tournament_id on public.matches
  for each row execute function public.link_legacy_match_to_competition();

create function public.create_competition_match(
  p_competition_id uuid,
  p_name text,
  p_match_number smallint,
  p_round_name text,
  p_scheduled_at timestamptz,
  p_timezone text default 'UTC',
  p_stage_id uuid default null,
  p_round_id uuid default null,
  p_duration_minutes smallint default null,
  p_lobby_capacity smallint default 48,
  p_public_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_competition public.competitions%rowtype;
  v_match_id uuid := gen_random_uuid();
  v_name text := btrim(coalesce(p_name, ''));
  v_round text := btrim(coalesce(p_round_name, ''));
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  select * into v_competition from public.competitions where id = p_competition_id for update;
  if not found or v_competition.status in ('cancelled', 'completed') then
    raise exception using errcode = 'P0002', message = 'COMPETITION_NOT_SCHEDULABLE';
  end if;
  if char_length(v_name) not between 2 and 120 or char_length(v_round) not between 1 and 100
    or p_match_number not between 1 and 200 or p_scheduled_at is null then
    raise exception using errcode = '22023', message = 'INVALID_MATCH_SCHEDULE';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = coalesce(nullif(p_timezone, ''), 'UTC')) then
    raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
  end if;
  if coalesce(p_lobby_capacity, 48) not between 1 and 100
    or (p_duration_minutes is not null and p_duration_minutes not between 1 and 720)
    or char_length(coalesce(p_public_notes, '')) > 2000 then
    raise exception using errcode = '22023', message = 'INVALID_MATCH_CONFIGURATION';
  end if;
  if p_stage_id is not null and not exists (
    select 1 from public.competition_stages stage where stage.id = p_stage_id and stage.competition_id = p_competition_id
  ) then raise exception using errcode = '22023', message = 'STAGE_COMPETITION_MISMATCH'; end if;
  if p_round_id is not null and not exists (
    select 1 from public.competition_rounds round_record
    where round_record.id = p_round_id and round_record.competition_id = p_competition_id
      and (p_stage_id is null or round_record.stage_id = p_stage_id)
  ) then raise exception using errcode = '22023', message = 'ROUND_COMPETITION_MISMATCH'; end if;

  insert into public.matches (
    id, tournament_id, competition_id, stage_id, round_id, name, match_number,
    round_name, scheduled_at, timezone, duration_minutes, lobby_capacity,
    public_notes, created_by, status
  ) values (
    v_match_id, v_competition.legacy_tournament_id, p_competition_id,
    p_stage_id, p_round_id, v_name, p_match_number, v_round, p_scheduled_at,
    coalesce(nullif(p_timezone, ''), 'UTC'), p_duration_minutes,
    coalesce(p_lobby_capacity, 48), coalesce(p_public_notes, ''), v_user_id, 'scheduled'
  );
  insert into public.match_events (match_id, actor_id, event_type, details)
  values (v_match_id, v_user_id, 'created', jsonb_build_object('competition_id', p_competition_id));
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'competition_match_created', 'match', v_match_id,
    jsonb_build_object('competition_id', p_competition_id));
  return v_match_id;
end;
$$;

create function public.assign_competition_entry_to_match(p_match_id uuid, p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_entry public.competition_entries%rowtype;
  v_id uuid := gen_random_uuid();
  v_kind text;
  v_assigned integer;
  v_user_id uuid := (select auth.uid());
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.competition_id is null or v_match.status in ('live', 'completed', 'cancelled') then
    raise exception using errcode = '23514', message = 'MATCH_NOT_ASSIGNABLE';
  end if;
  select * into v_entry from public.competition_entries where id = p_entry_id for update;
  if not found or v_entry.competition_id <> v_match.competition_id or v_entry.status <> 'confirmed' then
    raise exception using errcode = '23514', message = 'CONFIRMED_COMPETITION_ENTRY_REQUIRED';
  end if;
  select format.participant_kind into v_kind
  from public.competitions competition
  join public.game_formats format on format.game_code = competition.game_code and format.format_code = competition.format_code
  where competition.id = v_entry.competition_id;
  select (select count(*) from public.match_team_assignments assignment where assignment.match_id = p_match_id)
    + (select count(*) from public.match_participants participant where participant.match_id = p_match_id)
  into v_assigned;
  if v_assigned >= v_match.lobby_capacity then
    raise exception using errcode = '23514', message = 'MATCH_LOBBY_FULL';
  end if;
  if v_kind = 'team' then
    if v_entry.team_id is null then raise exception using errcode = '23514', message = 'TEAM_ENTRY_REQUIRED'; end if;
    insert into public.match_team_assignments (id, match_id, registration_id, team_id, assigned_by, entry_id)
    values (v_id, p_match_id, null, v_entry.team_id, v_user_id, p_entry_id);
  else
    if v_entry.player_id is null then raise exception using errcode = '23514', message = 'INDIVIDUAL_ENTRY_REQUIRED'; end if;
    insert into public.match_participants (id, match_id, entry_id, user_id, assigned_by)
    values (v_id, p_match_id, p_entry_id, v_entry.player_id, v_user_id);
  end if;
  insert into public.match_events (match_id, actor_id, event_type, details)
  values (p_match_id, v_user_id, 'team_assigned', jsonb_build_object('entry_id', p_entry_id));
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'competition_entry_assigned', 'match', p_match_id, jsonb_build_object('entry_id', p_entry_id));
  return v_id;
end;
$$;

create function public.set_competition_match_room(
  p_match_id uuid,
  p_room_id text,
  p_room_password text,
  p_release_at timestamptz,
  p_access_instructions text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if p_release_at is null or nullif(btrim(p_room_id), '') is null
    or char_length(p_room_id) > 64 or char_length(coalesce(p_room_password, '')) > 128
    or char_length(coalesce(p_access_instructions, '')) > 2000 then
    raise exception using errcode = '22023', message = 'INVALID_ROOM_CREDENTIALS';
  end if;
  perform 1 from public.matches where id = p_match_id and competition_id is not null for update;
  if not found then raise exception using errcode = 'P0002', message = 'COMPETITION_MATCH_NOT_FOUND'; end if;
  insert into public.match_room_credentials (
    match_id, room_id, room_password, release_at, access_instructions, status, updated_by
  ) values (
    p_match_id, btrim(p_room_id), nullif(p_room_password, ''), p_release_at,
    coalesce(p_access_instructions, ''), 'ready', v_user_id
  ) on conflict (match_id) do update set
    room_id = excluded.room_id, room_password = excluded.room_password,
    release_at = excluded.release_at, access_instructions = excluded.access_instructions,
    status = 'ready', updated_by = excluded.updated_by, updated_at = now();
  update public.matches set status = 'room_ready' where id = p_match_id and status = 'scheduled';
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'competition_room_set', 'match', p_match_id, jsonb_build_object('release_at', p_release_at));
end;
$$;

create function public.get_competition_match_room(p_match_id uuid)
returns table (room_id text, room_password text, release_at timestamptz, access_instructions text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
  v_allowed boolean := false;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select * into v_match from public.matches where id = p_match_id;
  if not found or v_match.competition_id is null or v_match.status not in ('room_ready', 'live') then
    raise exception using errcode = '42501', message = 'MATCH_NOT_ELIGIBLE_FOR_ROOM_ACCESS';
  end if;
  if rs_internal.has_competition_permission('manage_competitions') then
    v_allowed := true;
  else
    select exists (
      select 1 from public.match_team_assignments assignment
      join public.competition_entries entry on entry.id = assignment.entry_id and entry.status = 'confirmed'
      join public.team_members member on member.team_id = entry.team_id and member.user_id = v_user_id and member.status = 'active'
      where assignment.match_id = p_match_id
    ) or exists (
      select 1 from public.match_participants participant
      join public.competition_entries entry on entry.id = participant.entry_id and entry.status = 'confirmed'
      where participant.match_id = p_match_id and participant.user_id = v_user_id
    ) into v_allowed;
  end if;
  if not v_allowed then raise exception using errcode = '42501', message = 'MATCH_ACCESS_DENIED'; end if;
  return query
    select room.room_id, room.room_password, room.release_at, room.access_instructions
    from public.match_room_credentials room
    where room.match_id = p_match_id and room.status = 'ready'
      and room.release_at <= clock_timestamp();
  if not found then raise exception using errcode = '42501', message = 'ROOM_NOT_RELEASED'; end if;
end;
$$;

create function public.set_competition_match_status(p_match_id uuid, p_status text, p_public_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if p_status not in ('scheduled', 'room_ready', 'live', 'completed', 'cancelled', 'delayed') then
    raise exception using errcode = '22023', message = 'INVALID_MATCH_STATUS';
  end if;
  select * into v_match from public.matches where id = p_match_id and competition_id is not null for update;
  if not found then raise exception using errcode = 'P0002', message = 'COMPETITION_MATCH_NOT_FOUND'; end if;
  if v_match.status in ('completed', 'cancelled') and p_status <> v_match.status then
    raise exception using errcode = '23514', message = 'MATCH_STATUS_TERMINAL';
  end if;
  if v_match.status = 'scheduled' and p_status not in ('scheduled', 'room_ready', 'delayed', 'cancelled') then
    raise exception using errcode = '23514', message = 'INVALID_MATCH_STATUS_TRANSITION';
  end if;
  if v_match.status = 'room_ready' and p_status not in ('room_ready', 'live', 'delayed', 'cancelled') then
    raise exception using errcode = '23514', message = 'INVALID_MATCH_STATUS_TRANSITION';
  end if;
  if v_match.status = 'live' and p_status not in ('live', 'completed', 'delayed', 'cancelled') then
    raise exception using errcode = '23514', message = 'INVALID_MATCH_STATUS_TRANSITION';
  end if;
  if p_status in ('room_ready', 'live') and not exists (
    select 1 from public.match_room_credentials room
    where room.match_id = p_match_id and room.status = 'ready' and room.room_id is not null and room.release_at is not null
  ) then raise exception using errcode = '23514', message = 'ROOM_NOT_READY'; end if;
  if p_status = 'live' and not exists (
    select 1 from public.match_room_credentials room
    where room.match_id = p_match_id and room.status = 'ready' and room.release_at <= clock_timestamp()
  ) then raise exception using errcode = '23514', message = 'ROOM_RELEASE_TIME_NOT_REACHED'; end if;

  update public.matches set status = p_status, public_notes = coalesce(p_public_notes, public_notes)
  where id = p_match_id;
  if p_status in ('completed', 'cancelled') then
    update public.match_room_credentials set status = 'closed', room_id = null, room_password = null,
      updated_by = v_user_id, updated_at = now()
    where match_id = p_match_id;
  end if;
  insert into public.match_events (match_id, actor_id, event_type, details)
  values (p_match_id, v_user_id, 'status_changed', jsonb_build_object('from', v_match.status, 'to', p_status));
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'competition_match_status_changed', 'match', p_match_id,
    jsonb_build_object('from', v_match.status, 'to', p_status));
end;
$$;

create function public.cancel_competition(p_competition_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_competition public.competitions%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'CANCELLATION_REASON_REQUIRED';
  end if;
  select * into v_competition from public.competitions where id = p_competition_id for update;
  if not found or v_competition.status in ('completed', 'cancelled') then
    raise exception using errcode = 'P0002', message = 'COMPETITION_NOT_CANCELLABLE';
  end if;
  update public.competitions set status = 'cancelled', updated_at = now() where id = p_competition_id;
  update public.matches set status = 'cancelled'
  where competition_id = p_competition_id and status not in ('completed', 'cancelled');
  update public.match_room_credentials room set status = 'closed', room_id = null,
    room_password = null, updated_by = v_user_id, updated_at = now()
  from public.matches match
  where match.id = room.match_id and match.competition_id = p_competition_id and room.status <> 'closed';
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'competition_cancelled', 'competition', p_competition_id,
    jsonb_build_object('reason', v_reason));
end;
$$;

create or replace view public.matches_public
with (security_invoker = true)
as
select match.id, match.tournament_id,
  coalesce(tournament.name, competition.title) as tournament_name,
  coalesce(tournament.slug, competition.slug) as tournament_slug,
  match.name as match_name, match.match_number, match.round_name, match.scheduled_at,
  match.timezone, match.duration_minutes, match.status, match.public_notes, match.created_at,
  match.competition_id, competition.competition_type, competition.game_code
from public.matches as match
left join public.tournaments as tournament on tournament.id = match.tournament_id
left join public.competitions as competition on competition.id = match.competition_id
where tournament.publication_status = 'published'
   or competition.status in ('published', 'registration_closed', 'live', 'completed');

grant select on public.matches_public to anon, authenticated;

create policy "Public can read scheduled competition matches"
  on public.matches for select to anon, authenticated
  using (competition_id is not null and exists (
    select 1 from public.competitions competition
    where competition.id = matches.competition_id
      and competition.status in ('published', 'registration_closed', 'live', 'completed')
  ));

create policy "Players can read their competition match assignments"
  on public.match_team_assignments for select to authenticated
  using (entry_id is not null and (
    rs_internal.has_competition_permission('manage_competitions')
    or rs_internal.has_competition_permission('review_payments')
    or rs_internal.is_active_team_member(team_id)
  ));

alter table public.match_participants enable row level security;
revoke all on table public.match_participants from public, anon, authenticated;
grant select on public.match_participants to authenticated;
create policy "Participants and authorized staff can read individual match assignments"
  on public.match_participants for select to authenticated
  using (user_id = (select auth.uid()) or rs_internal.has_competition_permission('manage_competitions'));

revoke all on function public.create_competition_match(uuid, text, smallint, text, timestamptz, text, uuid, uuid, smallint, smallint, text) from public, anon;
revoke all on function public.assign_competition_entry_to_match(uuid, uuid) from public, anon;
revoke all on function public.set_competition_match_room(uuid, text, text, timestamptz, text) from public, anon;
revoke all on function public.get_competition_match_room(uuid) from public, anon;
revoke all on function public.set_competition_match_status(uuid, text, text) from public, anon;
revoke all on function public.cancel_competition(uuid, text) from public, anon;
grant execute on function public.create_competition_match(uuid, text, smallint, text, timestamptz, text, uuid, uuid, smallint, smallint, text) to authenticated;
grant execute on function public.assign_competition_entry_to_match(uuid, uuid) to authenticated;
grant execute on function public.set_competition_match_room(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.get_competition_match_room(uuid) to authenticated;
grant execute on function public.set_competition_match_status(uuid, text, text) to authenticated;
grant execute on function public.cancel_competition(uuid, text) to authenticated;

commit;
