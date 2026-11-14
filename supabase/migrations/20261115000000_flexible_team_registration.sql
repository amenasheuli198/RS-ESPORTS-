begin;

alter table public.competition_entry_members
  alter column user_id drop not null,
  add column if not exists member_name text,
  add column if not exists member_email text,
  add column if not exists member_phone text,
  add column if not exists is_manual boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'competition_entry_members_manual_snapshot_check'
      and conrelid = 'public.competition_entry_members'::regclass
  ) then
    alter table public.competition_entry_members
      add constraint competition_entry_members_manual_snapshot_check
      check (
        (user_id is not null and member_name is null and is_manual = false)
        or (user_id is null and member_name is not null and char_length(btrim(member_name)) between 2 and 100 and is_manual = true)
      );
  end if;
end;
$$;

create or replace function public.register_competition_team(
  p_competition_id uuid,
  p_team_id uuid,
  p_manual_members jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_competition public.competitions%rowtype;
  v_team public.teams%rowtype;
  v_entry_id uuid := gen_random_uuid();
  v_status text;
  v_reserved integer;
  v_manual_index integer;
  v_manual_entry jsonb;
  v_member_name text;
  v_member_email text;
  v_member_phone text;
begin
  if v_user_id is null or not rs_internal.is_player_ready() then
    raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED';
  end if;

  select * into v_competition from public.competitions where id = p_competition_id for update;
  if not found or v_competition.status <> 'published' then
    raise exception using errcode = 'P0002', message = 'COMPETITION_NOT_OPEN';
  end if;
  if v_competition.entry_type = 'paid' and v_competition.currency <> 'BDT' then
    raise exception using errcode = '23514', message = 'PAYMENT_UNAVAILABLE_FOR_CURRENCY';
  end if;
  if now() < v_competition.registration_opens_at or now() >= v_competition.registration_closes_at
    or now() >= v_competition.starts_at then
    raise exception using errcode = '23514', message = 'REGISTRATION_CLOSED';
  end if;
  if not exists (select 1 from public.game_formats where game_code = v_competition.game_code
      and format_code = v_competition.format_code and participant_kind = 'team' and is_active) then
    raise exception using errcode = '23514', message = 'TEAM_ENTRY_NOT_SUPPORTED';
  end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found or v_team.game_code <> v_competition.game_code then
    raise exception using errcode = '23514', message = 'TEAM_GAME_MISMATCH';
  end if;
  if not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_CAPTAIN_REQUIRED';
  end if;

  select count(*) into v_reserved from public.competition_entries entry
  where entry.competition_id = p_competition_id
    and entry.status in ('pending_payment', 'payment_rejected', 'pending_review', 'confirmed');
  if v_reserved >= v_competition.capacity then raise exception using errcode = '23514', message = 'COMPETITION_FULL'; end if;

  v_status := case when v_competition.entry_type = 'paid' then 'pending_payment' else 'pending_review' end;
  insert into public.competition_entries (id, competition_id, team_id, registered_by, status)
  values (v_entry_id, p_competition_id, p_team_id, v_user_id, v_status);

  if p_manual_members is not null and jsonb_typeof(p_manual_members) = 'array' then
    for v_manual_index in 1..jsonb_array_length(p_manual_members)
    loop
      v_manual_entry := p_manual_members -> (v_manual_index - 1);
      v_member_name := nullif(btrim(coalesce(v_manual_entry ->> 'member_name', '')), '');
      if v_member_name is null then
        continue;
      end if;
      v_member_email := nullif(btrim(coalesce(v_manual_entry ->> 'member_email', '')), '');
      v_member_phone := nullif(btrim(coalesce(v_manual_entry ->> 'member_phone', '')), '');
      insert into public.competition_entry_members (
        entry_id, user_id, member_name, member_email, member_phone, is_manual,
        role_snapshot, slot, in_game_name_snapshot, external_id_snapshot
      )
      values (
        v_entry_id, null, v_member_name, v_member_email, v_member_phone, true,
        'starting_player', v_manual_index, v_member_name, null
      );
    end loop;
  else
    insert into public.competition_entry_members (
      entry_id, user_id, role_snapshot, slot, in_game_name_snapshot, external_id_snapshot
    )
    select v_entry_id, member.user_id, member.role, member.slot,
      coalesce(identity.in_game_name, member.ign), coalesce(identity.external_id, member.free_fire_uid)
    from public.team_members member
    left join public.player_game_identities identity
      on identity.user_id = member.user_id and identity.game_code = v_competition.game_code
    where member.team_id = p_team_id and member.status = 'active';
  end if;

  insert into public.competition_registration_events (entry_id, from_status, to_status, actor_id)
  values (v_entry_id, null, v_status, v_user_id);
  return v_entry_id;
end;
$$;

revoke all on function public.register_competition_team(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.register_competition_team(uuid, uuid, jsonb) to authenticated;

commit;
