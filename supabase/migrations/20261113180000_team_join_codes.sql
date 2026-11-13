begin;

create table public.team_join_codes (
  id uuid primary key default gen_random_uuid(),
  join_code uuid not null unique default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  player_name text not null check (char_length(btrim(player_name)) between 2 and 100),
  player_email text check (player_email is null or player_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  player_phone text check (player_phone is null or player_phone ~ '^\+?[1-9][0-9]{6,14}$'),
  role text not null check (role in ('starting_player', 'substitute')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  check ((accepted_by is null) = (accepted_at is null)),
  check (expires_at > created_at)
);

create index team_join_codes_team_pending_idx
  on public.team_join_codes (team_id, expires_at)
  where accepted_at is null and cancelled_at is null;

alter table public.team_join_codes enable row level security;
revoke all on table public.team_join_codes from public, anon, authenticated;

create function public.create_team_join_code(
  p_team_id uuid,
  p_player_name text,
  p_email text default null,
  p_phone text default null,
  p_role text default 'starting_player'
)
returns table (join_code uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_team public.teams%rowtype;
  v_name text := nullif(btrim(coalesce(p_player_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(btrim(coalesce(p_phone, '')), '[[:space:]()-]', '', 'g'), '');
  v_code uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '7 days';
  v_active_total integer;
  v_pending_invites integer;
  v_pending_codes integer;
  v_active_role_count integer;
  v_pending_role_count integer;
begin
  if v_user_id is null or not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_CAPTAIN_REQUIRED';
  end if;
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_NAME';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$') then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_EMAIL';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[1-9][0-9]{6,14}$' then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_PHONE';
  end if;
  if p_role is null or p_role not in ('starting_player', 'substitute') then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_ROLE';
  end if;

  select count(*) into v_active_total
  from public.team_members member
  where member.team_id = p_team_id and member.status = 'active';
  select count(*) into v_pending_invites
  from public.team_invitations invitation
  where invitation.team_id = p_team_id and invitation.status = 'pending';
  select count(*) into v_pending_codes
  from public.team_join_codes code
  where code.team_id = p_team_id and code.accepted_at is null
    and code.cancelled_at is null and code.expires_at > now();
  if v_active_total + v_pending_invites + v_pending_codes >= 5 then
    raise exception using errcode = '23514', message = 'TEAM_ROSTER_FULL';
  end if;

  if p_role = 'starting_player' then
    select count(*) into v_active_role_count from public.team_members member
    where member.team_id = p_team_id and member.status = 'active'
      and member.role in ('captain', 'starting_player');
    select count(*) into v_pending_role_count from public.team_invitations invitation
    where invitation.team_id = p_team_id and invitation.status = 'pending'
      and invitation.role = 'starting_player';
    select v_pending_role_count + count(*) into v_pending_role_count from public.team_join_codes code
    where code.team_id = p_team_id and code.role = 'starting_player'
      and code.accepted_at is null and code.cancelled_at is null and code.expires_at > now();
    if v_active_role_count + v_pending_role_count >= 4 then
      raise exception using errcode = '23514', message = 'STARTING_LINEUP_FULL';
    end if;
  else
    select count(*) into v_active_role_count from public.team_members member
    where member.team_id = p_team_id and member.status = 'active' and member.role = 'substitute';
    select count(*) into v_pending_role_count from public.team_invitations invitation
    where invitation.team_id = p_team_id and invitation.status = 'pending'
      and invitation.role = 'substitute';
    select v_pending_role_count + count(*) into v_pending_role_count from public.team_join_codes code
    where code.team_id = p_team_id and code.role = 'substitute'
      and code.accepted_at is null and code.cancelled_at is null and code.expires_at > now();
    if v_active_role_count + v_pending_role_count >= 1 then
      raise exception using errcode = '23514', message = 'SUBSTITUTE_SLOT_FULL';
    end if;
  end if;

  insert into public.team_join_codes (
    join_code, team_id, player_name, player_email, player_phone, role, created_by, expires_at
  ) values (
    v_code, p_team_id, v_name, v_email, v_phone, p_role, v_user_id, v_expires_at
  );
  return query select v_code, v_expires_at;
end;
$$;

create function public.get_team_join_codes(p_team_id uuid)
returns table (
  id uuid,
  player_name text,
  player_email text,
  player_phone text,
  role text,
  join_code uuid,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_CAPTAIN_REQUIRED';
  end if;
  return query
    select code.id, code.player_name, code.player_email, code.player_phone,
      code.role, code.join_code, code.created_at, code.expires_at
    from public.team_join_codes code
    where code.team_id = p_team_id and code.accepted_at is null
      and code.cancelled_at is null and code.expires_at > now()
    order by code.created_at desc;
end;
$$;

create function public.cancel_team_join_code(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  select code.team_id into v_team_id
  from public.team_join_codes code
  where code.id = p_code_id and code.accepted_at is null and code.cancelled_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TEAM_CODE_UNAVAILABLE';
  end if;
  if not rs_internal.is_active_team_captain(v_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_CAPTAIN_REQUIRED';
  end if;
  update public.team_join_codes set cancelled_at = now() where id = p_code_id;
end;
$$;

create function public.join_team_with_code(
  p_join_code uuid,
  p_ign text,
  p_free_fire_uid text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_code public.team_join_codes%rowtype;
  v_team public.teams%rowtype;
  v_slot smallint;
  v_ign text := nullif(btrim(coalesce(p_ign, '')), '');
  v_uid text := nullif(btrim(coalesce(p_free_fire_uid, '')), '');
begin
  if v_user_id is null or not rs_internal.is_player_ready() then
    raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED';
  end if;
  if p_join_code is null then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_CODE';
  end if;
  select * into v_code from public.team_join_codes code
  where code.join_code = p_join_code and code.accepted_at is null
    and code.cancelled_at is null and code.expires_at > now()
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TEAM_CODE_UNAVAILABLE';
  end if;
  select * into v_team from public.teams where id = v_code.team_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND';
  end if;
  if v_code.player_email is not null and not exists (
    select 1 from auth.users account
    where account.id = v_user_id and account.email_confirmed_at is not null
      and lower(account.email) = v_code.player_email
  ) then
    raise exception using errcode = '42501', message = 'TEAM_CODE_EMAIL_MISMATCH';
  end if;
  if exists (
    select 1 from public.team_members member
    where member.user_id = v_user_id and member.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'PLAYER_ALREADY_ON_ACTIVE_TEAM';
  end if;
  if v_ign is null or char_length(v_ign) not between 2 and 32 or v_ign ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_IGN';
  end if;
  if v_uid is null or v_uid !~ '^[0-9]{5,20}$' then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;

  if v_code.role = 'starting_player' then
    select slot.slot_number::smallint into v_slot
    from generate_series(2, 4) as slot(slot_number)
    where not exists (
      select 1 from public.team_members member
      where member.team_id = v_team.id and member.status = 'active' and member.slot = slot.slot_number
    )
    order by slot.slot_number limit 1;
  else
    select 5::smallint into v_slot
    where not exists (
      select 1 from public.team_members member
      where member.team_id = v_team.id and member.status = 'active' and member.slot = 5
    );
  end if;
  if v_slot is null then
    raise exception using errcode = '23514', message = 'TEAM_ROSTER_FULL';
  end if;

  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team.id, v_user_id, v_ign, v_uid, v_code.role, v_slot);
  insert into public.player_game_identities (user_id, game_code, in_game_name, external_id)
  values (v_user_id, v_team.game_code, v_ign, v_uid)
  on conflict (user_id, game_code) do update set
    in_game_name = excluded.in_game_name, external_id = excluded.external_id, updated_at = now();
  update public.team_join_codes set accepted_by = v_user_id, accepted_at = now() where id = v_code.id;
  return v_team.id;
end;
$$;

revoke all on function public.create_team_join_code(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_team_join_codes(uuid) from public, anon, authenticated;
revoke all on function public.cancel_team_join_code(uuid) from public, anon, authenticated;
revoke all on function public.join_team_with_code(uuid, text, text) from public, anon, authenticated;
revoke all on function public.invite_team_member(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_team_join_code(uuid, text, text, text, text) to authenticated;
grant execute on function public.get_team_join_codes(uuid) to authenticated;
grant execute on function public.cancel_team_join_code(uuid) to authenticated;
grant execute on function public.join_team_with_code(uuid, text, text) to authenticated;

commit;