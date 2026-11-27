begin;

create or replace function public.get_admin_members_directory(
  p_search text default '', p_limit integer default 50, p_offset integer default 0
)
returns table (
  user_id uuid, full_name text, email text, phone text, role text, registered_at timestamptz,
  email_confirmed_at timestamptz, profile_completed_at timestamptz, team_id uuid,
  team_name text, team_role text, total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_PAGE';
  end if;
  return query
    select account.id, profile.full_name, account.email::text, profile.phone,
      coalesce(nullif(account.raw_app_meta_data ->> 'role', ''), 'player'), account.created_at,
      account.email_confirmed_at, profile.profile_completed_at, team.id, team.name,
      member.role, count(*) over ()
    from auth.users as account
    left join public.profiles as profile on profile.id = account.id
    left join lateral (
      select active_member.team_id, active_member.role
      from public.team_members as active_member
      where active_member.user_id = account.id and active_member.status = 'active'
      order by (active_member.role = 'captain') desc, active_member.joined_at desc
      limit 1
    ) as member on true
    left join public.teams as team on team.id = member.team_id
    where v_search = ''
      or lower(coalesce(profile.full_name, '')) like '%' || v_search || '%'
      or lower(coalesce(account.email, '')) like '%' || v_search || '%'
      or coalesce(profile.phone, '') like '%' || v_search || '%'
      or lower(coalesce(team.name, '')) like '%' || v_search || '%'
      or lower(coalesce(account.raw_app_meta_data ->> 'role', 'player')) like '%' || v_search || '%'
    order by account.created_at desc
    limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_admin_teams_directory(
  p_search text default '', p_limit integer default 50, p_offset integer default 0
)
returns table (
  team_id uuid, team_name text, team_code text, logo_path text, game_code text,
  format_code text, created_at timestamptz, captain_user_id uuid, captain_name text,
  captain_email text, captain_phone text, roster jsonb, total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_PAGE';
  end if;
  return query
    select team.id, team.name, team.team_code, team.logo_path, team.game_code,
      team.format_code, team.created_at, captain.user_id, captain.full_name,
      captain.email::text, captain.phone, coalesce(roster.members, '[]'::jsonb), count(*) over ()
    from public.teams as team
    left join lateral (
      select member.user_id, profile.full_name, account.email::text, profile.phone
      from public.team_members as member
      left join public.profiles as profile on profile.id = member.user_id
      left join auth.users as account on account.id = member.user_id
      where member.team_id = team.id and member.role = 'captain' and member.status = 'active'
      order by member.joined_at limit 1
    ) as captain on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'user_id', member.user_id, 'full_name', profile.full_name, 'email', account.email,
        'phone', profile.phone, 'role', member.role, 'slot', member.slot, 'status', member.status,
        'joined_at', member.joined_at, 'ign', member.ign, 'free_fire_uid', member.free_fire_uid
      ) order by member.slot, member.joined_at) as members
      from public.team_members as member
      left join public.profiles as profile on profile.id = member.user_id
      left join auth.users as account on account.id = member.user_id
      where member.team_id = team.id and member.status = 'active'
    ) as roster on true
    where v_search = '' or lower(team.name) like '%' || v_search || '%'
      or lower(coalesce(team.team_code, '')) like '%' || v_search || '%'
      or lower(coalesce(captain.full_name, '')) like '%' || v_search || '%'
      or lower(coalesce(captain.email, '')) like '%' || v_search || '%'
    order by team.created_at desc
    limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_admin_pending_registrations(
  p_search text default '', p_limit integer default 50, p_offset integer default 0
)
returns table (
  registration_id uuid, registration_source text, event_id uuid, event_name text, event_type text,
  entry_type text, entry_fee numeric, currency text, status text, registered_at timestamptz,
  team_id uuid, team_name text, team_logo_path text, captain_name text, captain_email text,
  captain_phone text, payment_id uuid, payment_status text, sender_number text, txid text,
  amount numeric, payment_submitted_at timestamptz, roster jsonb, total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'INVALID_REGISTRATION_PAGE';
  end if;
  return query
    with all_pending as (
      select entry.id as registration_id, 'competition'::text as registration_source,
        competition.id as event_id, competition.title as event_name,
        competition.competition_type as event_type, competition.entry_type, competition.entry_fee,
        competition.currency, entry.status, entry.registered_at, team.id as team_id,
        team.name as team_name, team.logo_path as team_logo_path, captain.full_name as captain_name,
        captain.email::text as captain_email, captain.phone as captain_phone,
        payment.id as payment_id, payment.status as payment_status,
        payment.sender_number, payment.txid, payment.amount,
        payment.created_at as payment_submitted_at, coalesce(roster.members, '[]'::jsonb) as roster
      from public.competition_entries as entry
      join public.competitions as competition on competition.id = entry.competition_id
      left join public.teams as team on team.id = entry.team_id
      left join lateral (
        select profile.full_name, account.email::text, profile.phone
        from public.team_members as member
        left join public.profiles as profile on profile.id = member.user_id
        left join auth.users as account on account.id = member.user_id
        where member.team_id = entry.team_id and member.role = 'captain' and member.status = 'active'
        order by member.joined_at limit 1
      ) as captain on true
      left join lateral (
        select submitted_payment.id, submitted_payment.status, submitted_payment.sender_number,
          submitted_payment.txid, submitted_payment.amount, submitted_payment.created_at
        from public.payments as submitted_payment
        where submitted_payment.entry_id = entry.id
        order by submitted_payment.created_at desc limit 1
      ) as payment on true
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'name', coalesce(snapshot.member_name, profile.full_name, snapshot.in_game_name_snapshot),
          'email', coalesce(snapshot.member_email, account.email), 'phone', coalesce(snapshot.member_phone, profile.phone),
          'role', snapshot.role_snapshot, 'slot', snapshot.slot, 'ign', snapshot.in_game_name_snapshot,
          'external_id', snapshot.external_id_snapshot
        ) order by snapshot.slot) as members
        from public.competition_entry_members as snapshot
        left join public.profiles as profile on profile.id = snapshot.user_id
        left join auth.users as account on account.id = snapshot.user_id
        where snapshot.entry_id = entry.id
      ) as roster on true
      where entry.status in ('pending_payment', 'payment_rejected', 'pending_review')
        and (v_search = '' or lower(competition.title) like '%' || v_search || '%'
          or lower(coalesce(team.name, '')) like '%' || v_search || '%'
          or lower(coalesce(captain.full_name, '')) like '%' || v_search || '%'
          or lower(coalesce(payment.txid, '')) like '%' || v_search || '%'
          or coalesce(payment.sender_number, '') like '%' || v_search || '%')
      union all
      select registration.id, 'legacy_tournament'::text, tournament.id, tournament.name,
        'tournament'::text, tournament.entry_type, tournament.entry_fee, 'BDT'::text,
        registration.status, registration.registered_at, team.id, team.name, team.logo_path,
        captain.full_name, captain.email::text, captain.phone, null::uuid, null::text,
        null::text, null::text, null::numeric, null::timestamptz,
        coalesce(roster.members, '[]'::jsonb)
      from public.tournament_registrations as registration
      join public.tournaments as tournament on tournament.id = registration.tournament_id
      join public.teams as team on team.id = registration.team_id
      left join lateral (
        select profile.full_name, account.email::text, profile.phone
        from public.team_members as member
        left join public.profiles as profile on profile.id = member.user_id
        left join auth.users as account on account.id = member.user_id
        where member.team_id = team.id and member.role = 'captain' and member.status = 'active'
        order by member.joined_at limit 1
      ) as captain on true
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'name', profile.full_name, 'email', account.email, 'phone', profile.phone,
          'role', member.role, 'slot', member.slot, 'ign', member.ign, 'external_id', member.free_fire_uid
        ) order by member.slot) as members
        from public.team_members as member
        left join public.profiles as profile on profile.id = member.user_id
        left join auth.users as account on account.id = member.user_id
        where member.team_id = team.id and member.status = 'active'
      ) as roster on true
      where registration.status = 'pending'
        and (v_search = '' or lower(tournament.name) like '%' || v_search || '%'
          or lower(team.name) like '%' || v_search || '%'
          or lower(coalesce(captain.full_name, '')) like '%' || v_search || '%')
    )
    select all_pending.*, count(*) over () from all_pending
    order by registered_at desc limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_admin_bkash_payment_queue_v2()
returns table (
  payment_id uuid, entry_id uuid, competition_id uuid, competition_name text,
  competition_type text, game_name text, team_id uuid, team_name text,
  participant_name text, participant_email text, participant_phone text,
  sender_number text, txid text, amount numeric, currency text, status text,
  submitted_at timestamptz, rejection_reason text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not rs_internal.has_competition_permission('review_payments') then
    raise exception using errcode = '42501', message = 'PAYMENT_REVIEWER_REQUIRED';
  end if;
  return query
    select payment.id, payment.entry_id, competition.id, competition.title,
      competition.competition_type, game.display_name, entry.team_id, team.name,
      coalesce(profile.full_name, 'Player'), account.email::text, profile.phone,
      payment.sender_number, payment.txid, payment.amount, payment.currency,
      payment.status, payment.created_at, payment.rejection_reason
    from public.payments as payment
    join public.competition_entries as entry on entry.id = payment.entry_id
    join public.competitions as competition on competition.id = entry.competition_id
    join public.games as game on game.game_code = competition.game_code
    join auth.users as account on account.id = payment.submitted_by
    left join public.profiles as profile on profile.id = payment.submitted_by
    left join public.teams as team on team.id = entry.team_id
    order by case when payment.status = 'pending' then 0 else 1 end, payment.created_at desc;
end;
$$;

commit;
