begin;

alter table public.team_members
drop constraint if exists team_members_slot_check;

alter table public.team_members
  add constraint team_members_slot_check
  check (
    (role = 'captain' and slot = 1)
    or (role in ('starting_player', 'substitute') and slot >= 2)
  ) not valid;

create or replace function public.create_team_join_code(
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

  insert into public.team_join_codes (
    join_code, team_id, player_name, player_email, player_phone, role, created_by, expires_at
  ) values (
    v_code, p_team_id, v_name, v_email, v_phone, p_role, v_user_id, v_expires_at
  );
  return query select v_code, v_expires_at;
end;
$$;

create or replace function public.invite_team_member(p_team_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invited_user_id uuid;
  v_invitation_id uuid := gen_random_uuid();
begin
  perform 1 from public.teams where id = p_team_id for update;
  if not found or not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_ACCESS_DENIED';
  end if;
  if p_email is null or char_length(btrim(p_email)) > 254 or position('@' in btrim(p_email)) < 2 then
    raise exception using errcode = '22023', message = 'INVALID_EMAIL';
  end if;
  if p_role is null or p_role not in ('starting_player', 'substitute') then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_ROLE';
  end if;

  select account.id into v_invited_user_id
  from auth.users as account
  where lower(account.email) = lower(btrim(p_email))
    and account.email_confirmed_at is not null;
  if v_invited_user_id is null then
    raise exception using errcode = 'P0002', message = 'PLAYER_NOT_FOUND';
  end if;
  if v_invited_user_id = (select auth.uid()) then
    raise exception using errcode = '22023', message = 'CANNOT_INVITE_SELF';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = v_invited_user_id and profile.full_name is not null
  ) then
    raise exception using errcode = 'P0002', message = 'PLAYER_PROFILE_INCOMPLETE';
  end if;
  if exists (
    select 1 from public.team_members as member
    where member.user_id = v_invited_user_id and member.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'PLAYER_ALREADY_ON_ACTIVE_TEAM';
  end if;
  if exists (
    select 1 from public.team_invitations as invitation
    where invitation.team_id = p_team_id
      and invitation.invited_user_id = v_invited_user_id
      and invitation.status = 'pending'
  ) then
    raise exception using errcode = '23505', message = 'INVITATION_ALREADY_PENDING';
  end if;

  insert into public.team_invitations (id, team_id, invited_user_id, invited_by, role)
  values (v_invitation_id, p_team_id, v_invited_user_id, (select auth.uid()), p_role);
  return v_invitation_id;
end;
$$;

create or replace function public.respond_to_team_invitation(
  p_invitation_id uuid,
  p_accept boolean,
  p_ign text default null,
  p_free_fire_uid text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_role text;
  v_slot smallint;
begin
  select invitation.team_id into v_team_id
  from public.team_invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.invited_user_id = (select auth.uid())
    and invitation.status = 'pending';
  if v_team_id is null then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;
  if p_accept is null then
    raise exception using errcode = '22023', message = 'INVALID_INVITATION_RESPONSE';
  end if;

  perform 1 from public.teams where id = v_team_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;

  select invitation.role into v_role
  from public.team_invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.invited_user_id = (select auth.uid())
    and invitation.status = 'pending'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;

  if not p_accept then
    update public.team_invitations
    set status = 'rejected', responded_at = now()
    where id = p_invitation_id;
    return;
  end if;

  if p_ign is null or char_length(btrim(p_ign)) not between 2 and 32 or p_ign ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_IGN';
  end if;
  if p_free_fire_uid is null or p_free_fire_uid !~ '^[0-9]{5,20}$' then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;
  if exists (
    select 1 from public.team_members as member
    where member.user_id = (select auth.uid()) and member.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'PLAYER_ALREADY_ON_ACTIVE_TEAM';
  end if;

  select coalesce(max(member.slot), 1) + 1::smallint into v_slot
  from public.team_members as member
  where member.team_id = v_team_id and member.status = 'active';

  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team_id, (select auth.uid()), btrim(p_ign), p_free_fire_uid, v_role, v_slot);

  update public.team_invitations
  set status = 'accepted', responded_at = now()
  where id = p_invitation_id;
end;
$$;

create or replace function public.join_team_with_code(
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

  select coalesce(max(member.slot), 1) + 1::smallint into v_slot
  from public.team_members as member
  where member.team_id = v_team.id and member.status = 'active';

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

create or replace function public.join_team_by_code(p_team_code text, p_ign text, p_free_fire_uid text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_team public.teams%rowtype;
  v_code text := upper(btrim(coalesce(p_team_code, '')));
  v_ign text := nullif(btrim(coalesce(p_ign, '')), '');
  v_uid text := nullif(btrim(coalesce(p_free_fire_uid, '')), '');
  v_role text;
  v_slot smallint;
begin
  if v_user_id is null or not rs_internal.is_player_ready() then
    raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED';
  end if;
  if v_code !~ '^[A-F0-9]{16}$' then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_CODE';
  end if;
  select * into v_team from public.teams team where team.team_code = v_code for update;
  if not found then raise exception using errcode = 'P0002', message = 'TEAM_CODE_NOT_FOUND'; end if;
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

  v_role := 'starting_player';
  select coalesce(max(member.slot), 1) + 1::smallint into v_slot
  from public.team_members member
  where member.team_id = v_team.id and member.status = 'active';

  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team.id, v_user_id, v_ign, v_uid, v_role, v_slot);
  insert into public.player_game_identities (user_id, game_code, in_game_name, external_id)
  values (v_user_id, v_team.game_code, v_ign, v_uid)
  on conflict (user_id, game_code) do update set
    in_game_name = excluded.in_game_name, external_id = excluded.external_id, updated_at = now();
  return v_team.id;
end;
$$;

revoke all on function public.create_team_join_code(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.invite_team_member(uuid, text, text) from public, anon, authenticated;
revoke all on function public.respond_to_team_invitation(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.join_team_with_code(uuid, text, text) from public, anon, authenticated;
revoke all on function public.join_team_by_code(text, text, text) from public, anon, authenticated;

grant execute on function public.create_team_join_code(uuid, text, text, text, text) to authenticated;
grant execute on function public.invite_team_member(uuid, text, text) to authenticated;
grant execute on function public.respond_to_team_invitation(uuid, boolean, text, text) to authenticated;
grant execute on function public.join_team_with_code(uuid, text, text) to authenticated;
grant execute on function public.join_team_by_code(text, text, text) to authenticated;

commit;
