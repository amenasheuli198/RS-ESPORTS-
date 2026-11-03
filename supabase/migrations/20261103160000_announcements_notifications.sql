begin;

alter table public.tournament_registration_notifications
  add column title text not null default 'Tournament update',
  add column related_match_id uuid references public.matches (id) on delete set null,
  add column related_team_id uuid references public.teams (id) on delete set null,
  add column action_url text,
  add column event_key text not null default gen_random_uuid()::text;

alter table public.tournament_registration_notifications
  add column is_read boolean generated always as (read_at is not null) stored;

alter table public.tournament_registration_notifications
  add constraint tournament_registration_notifications_action_url_check
  check (action_url is null or (
    left(action_url, 1) = '/'
    and left(action_url, 2) <> '//'
    and action_url !~* '^(javascript|data|vbscript):'
    and char_length(action_url) <= 500
  ));

alter table public.tournament_registration_notifications
  drop constraint if exists tournament_registration_notifications_event_type_check;

alter table public.tournament_registration_notifications
  add constraint tournament_registration_notifications_event_type_check
  check (event_type in (
    'submitted', 'approved', 'rejected', 'withdrawn', 'disqualified', 'tournament_cancelled',
    'registration_submitted', 'registration_approved', 'registration_rejected', 'registration_withdrawn',
    'team_invitation', 'team_invitation_accepted', 'team_invitation_rejected',
    'match_scheduled', 'match_rescheduled', 'match_delayed', 'match_cancelled', 'room_ready',
    'room_credentials_released', 'match_started', 'match_completed', 'results_published', 'results_corrected',
    'tournament_announcement', 'maintenance_notice', 'system_alert', 'announcement_published',
    'team_invitation_cancelled'
  ));

create unique index tournament_registration_notifications_event_key_idx
  on public.tournament_registration_notifications (event_key);

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tournament_announcements boolean not null default true,
  match_updates boolean not null default true,
  team_updates boolean not null default true,
  result_updates boolean not null default true,
  system_updates boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
revoke all on table public.notification_preferences from public, anon, authenticated;
grant select on table public.notification_preferences to authenticated;

create policy "Users can read their own notification preferences"
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create function public.set_my_notification_preferences(
  p_tournament_announcements boolean,
  p_match_updates boolean,
  p_team_updates boolean,
  p_result_updates boolean,
  p_system_updates boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  insert into public.notification_preferences (
    user_id, tournament_announcements, match_updates, team_updates, result_updates, system_updates
  ) values (
    v_user_id, coalesce(p_tournament_announcements, true), coalesce(p_match_updates, true),
    coalesce(p_team_updates, true), coalesce(p_result_updates, true), true
  ) on conflict (user_id) do update set
    tournament_announcements = excluded.tournament_announcements,
    match_updates = excluded.match_updates,
    team_updates = excluded.team_updates,
    result_updates = excluded.result_updates,
    system_updates = true,
    updated_at = now();
end;
$$;

revoke all on function public.set_my_notification_preferences(boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_my_notification_preferences(boolean, boolean, boolean, boolean, boolean) to authenticated;

create function rs_internal.emit_notification(
  p_recipient_id uuid,
  p_event_key text,
  p_event_type text,
  p_title text,
  p_message text,
  p_tournament_id uuid default null,
  p_match_id uuid default null,
  p_team_id uuid default null,
  p_announcement_id uuid default null,
  p_registration_id uuid default null,
  p_action_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := true;
begin
  select case
    when p_event_type in ('tournament_announcement', 'announcement_published', 'tournament_cancelled') then preferences.tournament_announcements
    when p_event_type in ('team_invitation', 'team_invitation_accepted', 'team_invitation_rejected', 'team_invitation_cancelled', 'registration_submitted', 'registration_approved', 'registration_rejected', 'registration_withdrawn', 'submitted', 'approved', 'rejected', 'withdrawn', 'disqualified') then preferences.team_updates
    when p_event_type in ('results_published', 'results_corrected') then preferences.result_updates
    when p_event_type in ('maintenance_notice', 'system_alert') then preferences.system_updates
    else preferences.match_updates
  end into v_enabled
  from public.notification_preferences as preferences
  where preferences.user_id = p_recipient_id;

  if not coalesce(v_enabled, true) then
    return;
  end if;
  if p_action_url is not null and (
    left(p_action_url, 1) <> '/' or left(p_action_url, 2) = '//'
    or p_action_url ~* '^(javascript|data|vbscript):'
  ) then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_ACTION_URL';
  end if;

  insert into public.tournament_registration_notifications (
    recipient_id, event_type, title, message, tournament_id, related_match_id,
    related_team_id, related_announcement_id, registration_id, action_url, event_key
  ) values (
    p_recipient_id, p_event_type, left(p_title, 180), left(p_message, 500), p_tournament_id,
    p_match_id, p_team_id, p_announcement_id, p_registration_id, p_action_url, p_event_key
  ) on conflict (event_key) do nothing;
end;
$$;

revoke all on function rs_internal.emit_notification(uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

create function public.notify_due_match_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_count integer := 0;
  v_row record;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  for v_row in
    select match.id as match_id, match.name as match_name, match.match_number,
      match.tournament_id, tournament.name as tournament_name, member.user_id,
      assignment.team_id
    from public.matches as match
    join public.tournaments as tournament on tournament.id = match.tournament_id
    join public.match_room_credentials as room on room.match_id = match.id
    join public.match_team_assignments as assignment on assignment.match_id = match.id
    join public.tournament_registrations as registration
      on registration.id = assignment.registration_id and registration.status = 'approved'
    join public.team_members as member
      on member.team_id = assignment.team_id and member.status = 'active'
    where room.status = 'ready'
      and room.release_at <= clock_timestamp()
      and match.status in ('room_ready', 'live')
      and tournament.publication_status = 'published'
      and tournament.lifecycle_status <> 'completed'
      and member.user_id = v_user_id
  loop
    perform rs_internal.emit_notification(
      v_row.user_id,
      'room-release:' || v_row.match_id::text || ':' || v_row.user_id::text,
      'room_credentials_released',
      'Room credentials are available',
      'Room credentials for Match ' || v_row.match_number || ' of ' || v_row.tournament_name || ' are ready to view securely.',
      v_row.tournament_id, v_row.match_id, v_row.team_id, null, null,
      '/dashboard/team/matches'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.notify_due_match_rooms() from public, anon;
grant execute on function public.notify_due_match_rooms() to authenticated;

create function public.notify_announcement_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient record;
  v_event_type text;
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published')
    or (new.expires_at is not null and new.expires_at <= now()) then
    return new;
  end if;

  v_event_type := case
    when new.announcement_type = 'maintenance_notice' then 'maintenance_notice'
    when new.announcement_type = 'important_alert' then 'system_alert'
    else 'announcement_published'
  end;

  for v_recipient in
    select account.id as user_id, null::uuid as team_id
    from auth.users as account
    where new.audience_type in ('public', 'authenticated')
    union
    select distinct member.user_id, registration.team_id
    from public.tournament_registrations as registration
    join public.team_members as member on member.team_id = registration.team_id and member.status = 'active'
    where new.audience_type = 'tournament_participants'
      and registration.tournament_id = new.tournament_id and registration.status = 'approved'
    union
    select distinct member.user_id, assignment.team_id
    from public.match_team_assignments as assignment
    join public.tournament_registrations as registration
      on registration.id = assignment.registration_id and registration.status = 'approved'
    join public.team_members as member on member.team_id = assignment.team_id and member.status = 'active'
    where new.audience_type = 'match_participants' and assignment.match_id = new.match_id
    union
    select member.user_id, member.team_id
    from public.team_members as member
    where new.audience_type = 'team_members' and member.team_id = new.team_id and member.status = 'active'
  loop
    perform rs_internal.emit_notification(
      v_recipient.user_id,
      'announcement:' || new.id::text || ':' || v_recipient.user_id::text,
      v_event_type,
      new.title,
      'A new announcement is available: ' || new.title,
      new.tournament_id,
      new.match_id,
      coalesce(v_recipient.team_id, new.team_id),
      new.id,
      null,
      '/announcements/' || new.id::text
    );
  end loop;
  return new;
end;
$$;

create trigger announcement_published_notifications
  after insert or update of status on public.announcements
  for each row execute function public.notify_announcement_publication();

revoke all on function public.notify_announcement_publication() from public, anon, authenticated;

create function public.notify_match_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_event_key text;
  v_row record;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'match_scheduled';
  elsif new.status is distinct from old.status then
    v_event_type := case new.status
      when 'delayed' then 'match_delayed'
      when 'cancelled' then 'match_cancelled'
      when 'live' then 'match_started'
      when 'completed' then 'match_completed'
      else null
    end;
  elsif new.scheduled_at is distinct from old.scheduled_at or new.timezone is distinct from old.timezone then
    v_event_type := 'match_rescheduled';
  else
    return new;
  end if;
  if v_event_type is null then return new; end if;
  v_event_key := 'match:' || new.id::text || ':' || v_event_type || ':' || new.updated_at::text;

  for v_row in
    select distinct member.user_id, assignment.team_id, match.tournament_id,
      tournament.name as tournament_name
    from public.match_team_assignments as assignment
    join public.tournament_registrations as registration
      on registration.id = assignment.registration_id and registration.status = 'approved'
    join public.team_members as member on member.team_id = assignment.team_id and member.status = 'active'
    join public.matches as match on match.id = assignment.match_id
    join public.tournaments as tournament on tournament.id = match.tournament_id
    where assignment.match_id = new.id
  loop
    perform rs_internal.emit_notification(
      v_row.user_id, v_event_key || ':' || v_row.user_id::text, v_event_type,
      case v_event_type
        when 'match_scheduled' then 'Match scheduled'
        when 'match_rescheduled' then 'Match rescheduled'
        when 'match_delayed' then 'Match delayed'
        when 'match_cancelled' then 'Match cancelled'
        when 'match_started' then 'Match started'
        else 'Match completed'
      end,
      'Match ' || new.match_number || ' (' || new.round_name || ') for ' || v_row.tournament_name || ' was updated.',
      v_row.tournament_id, new.id, v_row.team_id, null, null,
      '/dashboard/team/matches'
    );
  end loop;
  return new;
end;
$$;

create trigger match_event_notifications
  after insert or update of scheduled_at, timezone, status on public.matches
  for each row execute function public.notify_match_event();

revoke all on function public.notify_match_event() from public, anon, authenticated;

create function public.notify_match_room_ready()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if new.status <> 'ready' or new.release_at > clock_timestamp()
    or (tg_op = 'UPDATE' and old.status = 'ready' and old.release_at = new.release_at) then
    return new;
  end if;
  for v_row in
    select distinct member.user_id, assignment.team_id, match.tournament_id, match.match_number
    from public.match_team_assignments as assignment
    join public.tournament_registrations as registration
      on registration.id = assignment.registration_id and registration.status = 'approved'
    join public.team_members as member on member.team_id = assignment.team_id and member.status = 'active'
    join public.matches as match on match.id = assignment.match_id
    where assignment.match_id = new.match_id
  loop
    perform rs_internal.emit_notification(
      v_row.user_id, 'room-release:' || new.match_id::text || ':' || v_row.user_id::text,
      'room_credentials_released', 'Room credentials are available',
      'Room credentials for Match ' || v_row.match_number || ' are ready to view securely.',
      v_row.tournament_id, new.match_id, v_row.team_id, null, null, '/dashboard/team/matches'
    );
  end loop;
  return new;
end;
$$;

create trigger match_room_ready_notifications
  after insert or update of status, release_at on public.match_room_credentials
  for each row execute function public.notify_match_room_ready();

revoke all on function public.notify_match_room_ready() from public, anon, authenticated;

create function public.notify_team_invitation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_name text;
  v_invitee_name text;
  v_event_type text;
  v_title text;
  v_message text;
begin
  select team.name into v_team_name from public.teams as team where team.id = new.team_id;
  if tg_op = 'INSERT' then
    v_event_type := 'team_invitation';
    v_title := 'Team invitation received';
    v_message := 'You have been invited to join ' || coalesce(v_team_name, 'a team') || '.';
    perform rs_internal.emit_notification(
      new.invited_user_id, 'team-invitation:' || new.id::text || ':received', v_event_type,
      v_title, v_message, null, null, new.team_id, null, null, '/dashboard/team/invitations'
    );
  elsif new.status is distinct from old.status and new.status in ('accepted', 'rejected', 'cancelled') then
    select profile.full_name into v_invitee_name from public.profiles as profile where profile.id = new.invited_user_id;
    v_event_type := case new.status
      when 'accepted' then 'team_invitation_accepted'
      when 'rejected' then 'team_invitation_rejected'
      else 'team_invitation_cancelled'
    end;
    v_title := case new.status when 'accepted' then 'Team invitation accepted' when 'rejected' then 'Team invitation declined' else 'Team invitation cancelled' end;
    v_message := coalesce(v_invitee_name, 'A player') || ' ' || case new.status when 'accepted' then 'accepted' when 'rejected' then 'declined' else 'had their invitation cancelled' end || ' the invitation to ' || coalesce(v_team_name, 'your team') || '.';
    perform rs_internal.emit_notification(
      new.invited_by, 'team-invitation:' || new.id::text || ':' || new.status, v_event_type,
      v_title, v_message, null, null, new.team_id, null, null,
      case when new.status = 'accepted' then '/dashboard/team/members' else '/dashboard/team/invitations' end
    );
  end if;
  return new;
end;
$$;

create trigger team_invitation_notifications
  after insert or update of status on public.team_invitations
  for each row execute function public.notify_team_invitation_event();

revoke all on function public.notify_team_invitation_event() from public, anon, authenticated;

create function public.notify_result_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_tournament_name text;
  v_event_type text;
  v_row record;
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then
    if not (tg_op = 'UPDATE' and old.status = 'published' and new.status = 'corrected') then
      return new;
    end if;
  end if;
  select match.tournament_id, tournament.name into v_tournament_id, v_tournament_name
  from public.matches as match join public.tournaments as tournament on tournament.id = match.tournament_id
  where match.id = new.match_id;
  v_event_type := case when new.status = 'corrected' then 'results_corrected' else 'results_published' end;
  for v_row in
    select distinct member.user_id
    from public.team_members as member where member.team_id = new.team_id and member.status = 'active'
  loop
    perform rs_internal.emit_notification(
      v_row.user_id,
      'match-result:' || new.id::text || ':' || v_event_type || ':' || new.updated_at::text || ':' || v_row.user_id::text,
      v_event_type,
      case when v_event_type = 'results_corrected' then 'Published result corrected' else 'Match results published' end,
      'A result update is available for ' || coalesce(v_tournament_name, 'your tournament') || '.',
      v_tournament_id, new.match_id, new.team_id, null, null,
      '/matches/' || new.match_id::text || '/results'
    );
  end loop;
  return new;
end;
$$;

create trigger match_result_publication_notifications
  after insert or update of status on public.match_results
  for each row execute function public.notify_result_publication();

revoke all on function public.notify_result_publication() from public, anon, authenticated;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  announcement_type text not null check (announcement_type in (
    'general', 'tournament_update', 'registration_notice', 'match_schedule_update',
    'room_information', 'result_announcement', 'maintenance_notice', 'important_alert'
  )),
  audience_type text not null check (audience_type in (
    'public', 'authenticated', 'tournament_participants', 'match_participants', 'team_members'
  )),
  tournament_id uuid references public.tournaments (id) on delete cascade,
  match_id uuid references public.matches (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or published_at is null or expires_at > published_at),
  check ((audience_type = 'tournament_participants' and tournament_id is not null)
    or audience_type <> 'tournament_participants'),
  check ((audience_type = 'match_participants' and match_id is not null)
    or audience_type <> 'match_participants'),
  check ((audience_type = 'team_members' and team_id is not null)
    or audience_type <> 'team_members')
);

create index announcements_publication_idx
  on public.announcements (status, published_at desc, expires_at);

create index announcements_tournament_idx
  on public.announcements (tournament_id, status, published_at desc);

create index announcements_match_idx
  on public.announcements (match_id, status, published_at desc);

create index announcements_team_idx
  on public.announcements (team_id, status, published_at desc);

alter table public.announcements enable row level security;
revoke all on table public.announcements from public, anon, authenticated;
grant select on table public.announcements to anon, authenticated;

create policy "Readers can view announcements intended for them"
  on public.announcements
  for select
  to anon, authenticated
  using (
    rs_internal.is_tournament_admin()
    or (
      status = 'published'
      and (expires_at is null or expires_at > now())
      and (
        audience_type = 'public'
        or (auth.uid() is not null and audience_type = 'authenticated')
        or (audience_type = 'tournament_participants' and exists (
          select 1 from public.tournament_registrations as registration
          join public.team_members as member on member.team_id = registration.team_id
          where registration.tournament_id = announcements.tournament_id
            and registration.status = 'approved'
            and member.user_id = (select auth.uid())
            and member.status = 'active'
        ))
        or (audience_type = 'match_participants' and exists (
          select 1 from public.match_team_assignments as assignment
          join public.tournament_registrations as registration on registration.id = assignment.registration_id
          join public.team_members as member on member.team_id = assignment.team_id
          where assignment.match_id = announcements.match_id
            and registration.status = 'approved'
            and member.user_id = (select auth.uid())
            and member.status = 'active'
        ))
        or (audience_type = 'team_members' and rs_internal.is_active_team_member(team_id))
      )
    )
  );

create function public.set_announcement_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_announcement_updated_at();

revoke all on function public.set_announcement_updated_at() from public, anon, authenticated;

create function public.save_announcement(p_announcement jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_announcement ->> 'id', '')::uuid;
  v_user_id uuid := (select auth.uid());
  v_audience text := p_announcement ->> 'audience_type';
  v_tournament_id uuid := nullif(p_announcement ->> 'tournament_id', '')::uuid;
  v_match_id uuid := nullif(p_announcement ->> 'match_id', '')::uuid;
  v_team_id uuid := nullif(p_announcement ->> 'team_id', '')::uuid;
  v_title text := btrim(coalesce(p_announcement ->> 'title', ''));
  v_content text := btrim(coalesce(p_announcement ->> 'content', ''));
  v_type text := p_announcement ->> 'announcement_type';
  v_expires_at timestamptz := nullif(p_announcement ->> 'expires_at', '')::timestamptz;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if v_user_id is null or jsonb_typeof(p_announcement) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_ANNOUNCEMENT_PAYLOAD';
  end if;
  if char_length(v_title) not between 3 and 180 or char_length(v_content) not between 1 and 20000 then
    raise exception using errcode = '22023', message = 'INVALID_ANNOUNCEMENT_CONTENT';
  end if;
  if v_type not in ('general', 'tournament_update', 'registration_notice', 'match_schedule_update', 'room_information', 'result_announcement', 'maintenance_notice', 'important_alert') then
    raise exception using errcode = '22023', message = 'INVALID_ANNOUNCEMENT_TYPE';
  end if;
  if v_audience not in ('public', 'authenticated', 'tournament_participants', 'match_participants', 'team_members') then
    raise exception using errcode = '22023', message = 'INVALID_ANNOUNCEMENT_AUDIENCE';
  end if;
  if v_audience = 'tournament_participants' and (v_tournament_id is null or not exists (
    select 1 from public.tournaments where id = v_tournament_id
  )) then
    raise exception using errcode = '22023', message = 'TOURNAMENT_TARGET_REQUIRED';
  end if;
  if v_audience = 'match_participants' and (v_match_id is null or not exists (
    select 1 from public.matches as match
    where match.id = v_match_id and (v_tournament_id is null or match.tournament_id = v_tournament_id)
  )) then
    raise exception using errcode = '22023', message = 'MATCH_TARGET_INVALID';
  end if;
  if v_audience = 'team_members' and (v_team_id is null or not exists (
    select 1 from public.teams where id = v_team_id
  )) then
    raise exception using errcode = '22023', message = 'TEAM_TARGET_REQUIRED';
  end if;
  if v_expires_at is not null and v_expires_at <= now() then
    raise exception using errcode = '22023', message = 'ANNOUNCEMENT_EXPIRY_MUST_BE_FUTURE';
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.announcements (
      id, title, content, announcement_type, audience_type, tournament_id,
      match_id, team_id, expires_at, created_by
    ) values (
      v_id, v_title, v_content, v_type, v_audience, v_tournament_id,
      v_match_id, v_team_id, v_expires_at, v_user_id
    );
  else
    perform 1 from public.announcements where id = v_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'ANNOUNCEMENT_NOT_FOUND';
    end if;
    update public.announcements set
      title = v_title,
      content = v_content,
      announcement_type = v_type,
      audience_type = v_audience,
      tournament_id = v_tournament_id,
      match_id = v_match_id,
      team_id = v_team_id,
      expires_at = v_expires_at
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create function public.set_announcement_status(p_announcement_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_announcement public.announcements%rowtype;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception using errcode = '22023', message = 'INVALID_ANNOUNCEMENT_STATUS';
  end if;
  select * into v_announcement from public.announcements where id = p_announcement_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ANNOUNCEMENT_NOT_FOUND';
  end if;
  if p_status = 'published' and v_announcement.expires_at is not null and v_announcement.expires_at <= now() then
    raise exception using errcode = '23514', message = 'ANNOUNCEMENT_EXPIRED';
  end if;
  update public.announcements set
    status = p_status,
    published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
  where id = p_announcement_id;
end;
$$;

create or replace view public.announcements_public
with (security_invoker = true)
as
select announcement.id, announcement.title, announcement.content,
  announcement.announcement_type, announcement.published_at,
  announcement.expires_at, announcement.tournament_id,
  tournament.name as tournament_name, tournament.slug as tournament_slug,
  announcement.match_id, match.match_number, match.round_name
from public.announcements as announcement
left join public.tournaments as tournament on tournament.id = announcement.tournament_id
left join public.matches as match on match.id = announcement.match_id
where announcement.status = 'published'
  and announcement.audience_type = 'public'
  and (announcement.expires_at is null or announcement.expires_at > now());

grant select on public.announcements_public to anon, authenticated;