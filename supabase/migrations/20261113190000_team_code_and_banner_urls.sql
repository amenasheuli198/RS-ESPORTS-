begin;

alter table public.teams add column if not exists team_code text;
update public.teams
set team_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
where team_code is null or btrim(team_code) = '';
alter table public.teams
  alter column team_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  alter column team_code set not null;
create unique index if not exists teams_team_code_unique on public.teams (team_code);

create or replace function public.update_team_logo(p_team_id uuid, p_logo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_https_url boolean := coalesce(p_logo_path ~* '^https://[^[:space:]]+$', false);
begin
  if v_user_id is null or not exists (
    select 1 from public.team_members member
    where member.team_id = p_team_id and member.user_id = v_user_id and member.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'ACTIVE_TEAM_MEMBER_REQUIRED';
  end if;

  if v_is_https_url then
    if char_length(p_logo_path) > 2048 then
      raise exception using errcode = '22023', message = 'INVALID_TEAM_LOGO_URL';
    end if;
  elsif p_logo_path is null
    or (storage.foldername(p_logo_path))[1] <> p_team_id::text
    or (storage.foldername(p_logo_path))[2] <> v_user_id::text
    or (storage.foldername(p_logo_path))[3] is not null
    or lower(storage.extension(p_logo_path)) not in ('png', 'jpg', 'jpeg', 'webp')
    or not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'team-logos' and object.name = p_logo_path
        and object.metadata ->> 'mimetype' in ('image/png', 'image/jpeg', 'image/webp')
        and coalesce((object.metadata ->> 'size')::bigint, 2097153) between 1 and 2097152
    ) then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_LOGO_PATH';
  end if;

  update public.teams set logo_path = p_logo_path, updated_at = now() where id = p_team_id;
  if not found then raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.update_team_logo(uuid, text) from public, anon, authenticated;
grant execute on function public.update_team_logo(uuid, text) to authenticated;

create function public.join_team_by_code(p_team_code text, p_ign text, p_free_fire_uid text)
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
  v_starters integer;
  v_substitutes integer;
  v_pending_starters integer;
  v_pending_substitutes integer;
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

  select count(*) filter (where member.role in ('captain', 'starting_player')),
         count(*) filter (where member.role = 'substitute')
  into v_starters, v_substitutes
  from public.team_members member
  where member.team_id = v_team.id and member.status = 'active';
  select count(*) filter (where invitation.role = 'starting_player'),
         count(*) filter (where invitation.role = 'substitute')
  into v_pending_starters, v_pending_substitutes
  from public.team_invitations invitation
  where invitation.team_id = v_team.id and invitation.status = 'pending';
  select v_pending_starters + count(*) into v_pending_starters
  from public.team_join_codes code
  where code.team_id = v_team.id and code.role = 'starting_player'
    and code.accepted_at is null and code.cancelled_at is null and code.expires_at > now();
  select v_pending_substitutes + count(*) into v_pending_substitutes
  from public.team_join_codes code
  where code.team_id = v_team.id and code.role = 'substitute'
    and code.accepted_at is null and code.cancelled_at is null and code.expires_at > now();

  if v_starters + v_pending_starters < 4 then
    v_role := 'starting_player';
    select slot.slot_number::smallint into v_slot
    from generate_series(2, 4) slot(slot_number)
    where not exists (
      select 1 from public.team_members member
      where member.team_id = v_team.id and member.status = 'active' and member.slot = slot.slot_number
    )
    order by slot.slot_number limit 1;
  elsif v_substitutes + v_pending_substitutes < 1 then
    v_role := 'substitute';
    v_slot := 5;
  else
    raise exception using errcode = '23514', message = 'TEAM_ROSTER_FULL';
  end if;
  if v_slot is null then raise exception using errcode = '23514', message = 'TEAM_ROSTER_FULL'; end if;

  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team.id, v_user_id, v_ign, v_uid, v_role, v_slot);
  insert into public.player_game_identities (user_id, game_code, in_game_name, external_id)
  values (v_user_id, v_team.game_code, v_ign, v_uid)
  on conflict (user_id, game_code) do update set
    in_game_name = excluded.in_game_name, external_id = excluded.external_id, updated_at = now();
  return v_team.id;
end;
$$;

revoke all on function public.join_team_by_code(text, text, text) from public, anon, authenticated;
grant execute on function public.join_team_by_code(text, text, text) to authenticated;

create function public.set_tournament_banner_url(p_tournament_id uuid, p_banner_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_url text := nullif(btrim(coalesce(p_banner_url, '')), '');
begin
  if v_user_id is null or not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if v_url is null or char_length(v_url) > 2048 or v_url !~* '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'INVALID_BANNER_URL';
  end if;
  update public.tournaments set banner_path = v_url, updated_at = now()
  where id = p_tournament_id and publication_status <> 'cancelled';
  if not found then raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND_OR_CANCELLED'; end if;
end;
$$;

revoke all on function public.set_tournament_banner_url(uuid, text) from public, anon, authenticated;
grant execute on function public.set_tournament_banner_url(uuid, text) to authenticated;

create or replace function public.publish_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if not exists (
    select 1 from public.tournaments tournament
    where tournament.id = p_tournament_id
      and tournament.publication_status = 'draft'
      and tournament.registration_opens_at < tournament.registration_closes_at
      and tournament.registration_closes_at < tournament.starts_at
      and (
        tournament.banner_path ~* '^https://[^[:space:]]+$'
        or exists (
          select 1 from storage.objects object
          where object.bucket_id = 'tournament-banners' and object.name = tournament.banner_path
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'TOURNAMENT_NOT_READY_TO_PUBLISH';
  end if;
  update public.tournaments set publication_status = 'published'
  where id = p_tournament_id and publication_status = 'draft';
end;
$$;

commit;