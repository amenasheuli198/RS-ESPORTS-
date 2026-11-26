begin;

create unique index if not exists payments_txid_trimmed_unique
  on public.payments (upper(btrim(txid)))
  where txid is not null;

create or replace function rs_internal.ensure_unique_bkash_txid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_txid text := upper(regexp_replace(btrim(coalesce(new.txid, '')), '[^[:alnum:]]', '', 'g'));
begin
  if char_length(v_normalized_txid) not between 5 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_TXID';
  end if;

  if exists (
    select 1
    from public.payments as payment
    where payment.normalized_txid = v_normalized_txid
      and payment.id is distinct from new.id
  ) then
    raise exception using errcode = '23505', message = 'TXID_ALREADY_USED';
  end if;

  new.txid := btrim(new.txid);
  new.normalized_txid := v_normalized_txid;
  return new;
end;
$$;

revoke all on function rs_internal.ensure_unique_bkash_txid() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.payments'::regclass
      and tgname = 'ensure_unique_bkash_txid'
      and not tgisinternal
      and tgfoid = 'rs_internal.ensure_unique_bkash_txid()'::regprocedure
  ) then
    execute 'drop trigger if exists ensure_unique_bkash_txid on public.payments';
    execute 'create trigger ensure_unique_bkash_txid before insert or update of txid, normalized_txid on public.payments for each row execute function rs_internal.ensure_unique_bkash_txid()';
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
  v_starters integer;
  v_substitutes integer;
  v_roster integer;
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
  if not exists (
    select 1 from public.game_formats
    where game_code = v_competition.game_code and format_code = v_competition.format_code
      and participant_kind = 'team' and is_active
  ) then
    raise exception using errcode = '23514', message = 'TEAM_ENTRY_NOT_SUPPORTED';
  end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found or v_team.game_code <> v_competition.game_code then
    raise exception using errcode = '23514', message = 'TEAM_GAME_MISMATCH';
  end if;
  if not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_CAPTAIN_REQUIRED';
  end if;

  if p_manual_members is not null then
    if jsonb_typeof(p_manual_members) <> 'array' then
      raise exception using errcode = '23514', message = 'TEAM_ROSTER_OUT_OF_RANGE';
    end if;
    if jsonb_array_length(p_manual_members) > 48 then
      raise exception using errcode = '23514', message = 'TEAM_ROSTER_OUT_OF_RANGE';
    end if;
    for v_manual_index in 1..jsonb_array_length(p_manual_members)
    loop
      v_manual_entry := p_manual_members -> (v_manual_index - 1);
      if jsonb_typeof(v_manual_entry) <> 'object' then
        raise exception using errcode = '23514', message = 'TEAM_ROSTER_OUT_OF_RANGE';
      end if;
      v_member_name := nullif(btrim(coalesce(v_manual_entry ->> 'member_name', '')), '');
      v_member_email := nullif(btrim(coalesce(v_manual_entry ->> 'member_email', '')), '');
      v_member_phone := nullif(btrim(coalesce(v_manual_entry ->> 'member_phone', '')), '');
      if v_member_name is null or char_length(v_member_name) not between 2 and 100
        or v_member_name ~ '[[:cntrl:]]'
        or (v_member_email is not null and v_member_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
        or (v_member_phone is not null and v_member_phone !~ '^[0-9+()\-\s]{7,24}$') then
        raise exception using errcode = '23514', message = 'TEAM_ROSTER_OUT_OF_RANGE';
      end if;
    end loop;
  else
    select count(*) filter (where member.role in ('captain', 'starting_player')),
           count(*) filter (where member.role = 'substitute'), count(*)
    into v_starters, v_substitutes, v_roster
    from public.team_members as member
    where member.team_id = p_team_id and member.status = 'active';
    if v_starters < v_competition.min_team_size or v_starters > v_competition.max_team_size
      or v_substitutes > v_competition.max_substitutes or v_roster <> v_starters + v_substitutes then
      raise exception using errcode = '23514', message = 'TEAM_ROSTER_OUT_OF_RANGE';
    end if;
    if v_competition.game_code <> 'free_fire' and exists (
      select 1 from public.team_members as member
      where member.team_id = p_team_id and member.status = 'active'
        and not exists (
          select 1 from public.player_game_identities as identity
          where identity.user_id = member.user_id and identity.game_code = v_competition.game_code
        )
    ) then
      raise exception using errcode = '23514', message = 'GAME_IDENTITY_REQUIRED_FOR_ROSTER';
    end if;
  end if;

  select count(*) into v_reserved from public.competition_entries as entry
  where entry.competition_id = p_competition_id
    and entry.status in ('pending_payment', 'payment_rejected', 'pending_review', 'confirmed');
  if v_reserved >= v_competition.capacity then
    raise exception using errcode = '23514', message = 'COMPETITION_FULL';
  end if;

  v_status := case when v_competition.entry_type = 'paid' then 'pending_payment' else 'pending_review' end;
  insert into public.competition_entries (id, competition_id, team_id, registered_by, status)
  values (v_entry_id, p_competition_id, p_team_id, v_user_id, v_status);

  if p_manual_members is not null then
    for v_manual_index in 1..jsonb_array_length(p_manual_members)
    loop
      v_manual_entry := p_manual_members -> (v_manual_index - 1);
      v_member_name := btrim(v_manual_entry ->> 'member_name');
      v_member_email := nullif(btrim(coalesce(v_manual_entry ->> 'member_email', '')), '');
      v_member_phone := nullif(btrim(coalesce(v_manual_entry ->> 'member_phone', '')), '');
      insert into public.competition_entry_members (
        entry_id, user_id, member_name, member_email, member_phone, is_manual,
        role_snapshot, slot, in_game_name_snapshot, external_id_snapshot
      ) values (
        v_entry_id, null, v_member_name, v_member_email, v_member_phone, true,
        'starting_player', v_manual_index, left(v_member_name, 64), null
      );
    end loop;
  else
    insert into public.competition_entry_members (
      entry_id, user_id, role_snapshot, slot, in_game_name_snapshot, external_id_snapshot
    )
    select v_entry_id, member.user_id, member.role, member.slot,
      coalesce(identity.in_game_name, member.ign), coalesce(identity.external_id, member.free_fire_uid)
    from public.team_members as member
    left join public.player_game_identities as identity
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
