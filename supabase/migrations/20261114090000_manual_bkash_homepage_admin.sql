begin;

create or replace function public.get_homepage_competitions()
returns table (
  competition_id uuid,
  competition_type text,
  legacy_tournament_id uuid,
  title text,
  slug text,
  description text,
  game_code text,
  game_name text,
  format_code text,
  format_name text,
  entry_type text,
  entry_fee numeric,
  currency text,
  capacity integer,
  registered_count bigint,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  timezone text,
  status text,
  banner_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select competition.id,
    competition.competition_type,
    competition.legacy_tournament_id,
    competition.title,
    competition.slug,
    competition.description,
    competition.game_code,
    game.display_name,
    competition.format_code,
    format.display_name,
    competition.entry_type,
    competition.entry_fee,
    competition.currency,
    competition.capacity,
    count(entry.id) filter (where entry.status in (
      'pending_payment', 'payment_rejected', 'pending_review', 'confirmed'
    )) as registered_count,
    competition.registration_opens_at,
    competition.registration_closes_at,
    competition.starts_at,
    competition.timezone,
    competition.status,
    tournament.banner_path
  from public.competitions as competition
  join public.games as game on game.game_code = competition.game_code
  join public.game_formats as format
    on format.game_code = competition.game_code and format.format_code = competition.format_code
  left join public.tournaments as tournament on tournament.id = competition.legacy_tournament_id
  left join public.competition_entries as entry on entry.competition_id = competition.id
  where competition.status in ('published', 'registration_closed', 'live')
    and (competition.legacy_tournament_id is null or tournament.publication_status = 'published')
    and (competition.ends_at is null or competition.ends_at > now())
  group by competition.id, game.display_name, format.display_name, tournament.banner_path
  order by competition.starts_at asc;
$$;

revoke all on function public.get_homepage_competitions() from public, anon, authenticated;
grant execute on function public.get_homepage_competitions() to anon, authenticated;

create function public.get_my_competition_payment_context(p_entry_id uuid)
returns table (
  entry_id uuid,
  competition_id uuid,
  competition_title text,
  competition_type text,
  game_name text,
  format_name text,
  entry_type text,
  entry_fee numeric,
  currency text,
  entry_status text,
  payment_id uuid,
  payment_status text,
  player_name text,
  phone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  return query
    select entry.id,
      competition.id,
      competition.title,
      competition.competition_type,
      game.display_name,
      format.display_name,
      competition.entry_type,
      competition.entry_fee,
      competition.currency,
      entry.status,
      payment.id,
      payment.status,
      profile.full_name,
      profile.phone
    from public.competition_entries as entry
    join public.competitions as competition on competition.id = entry.competition_id
    join public.games as game on game.game_code = competition.game_code
    join public.game_formats as format
      on format.game_code = competition.game_code and format.format_code = competition.format_code
    join public.profiles as profile on profile.id = v_user_id
    left join public.payments as payment on payment.entry_id = entry.id
    where entry.id = p_entry_id
      and (
        entry.registered_by = v_user_id
        or entry.player_id = v_user_id
        or (entry.team_id is not null and rs_internal.is_active_team_captain(entry.team_id))
      );
  if not found then
    raise exception using errcode = '42501', message = 'PAYMENT_CONTEXT_ACCESS_DENIED';
  end if;
end;
$$;

revoke all on function public.get_my_competition_payment_context(uuid) from public, anon, authenticated;
grant execute on function public.get_my_competition_payment_context(uuid) to authenticated;

create function public.get_admin_bkash_payment_queue()
returns table (
  payment_id uuid,
  entry_id uuid,
  competition_id uuid,
  competition_name text,
  competition_type text,
  game_name text,
  participant_name text,
  participant_email text,
  participant_phone text,
  sender_number text,
  txid text,
  amount numeric,
  currency text,
  status text,
  submitted_at timestamptz,
  rejection_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not rs_internal.has_competition_permission('review_payments') then
    raise exception using errcode = '42501', message = 'PAYMENT_REVIEWER_REQUIRED';
  end if;
  return query
    select payment.id,
      payment.entry_id,
      competition.id,
      competition.title,
      competition.competition_type,
      game.display_name,
      coalesce(profile.full_name, 'Player'),
      account.email,
      profile.phone,
      payment.sender_number,
      payment.txid,
      payment.amount,
      payment.currency,
      payment.status,
      payment.created_at,
      payment.rejection_reason
    from public.payments as payment
    join public.competition_entries as entry on entry.id = payment.entry_id
    join public.competitions as competition on competition.id = entry.competition_id
    join public.games as game on game.game_code = competition.game_code
    join auth.users as account on account.id = payment.submitted_by
    left join public.profiles as profile on profile.id = payment.submitted_by
    order by case when payment.status = 'pending' then 0 else 1 end, payment.created_at desc;
end;
$$;

revoke all on function public.get_admin_bkash_payment_queue() from public, anon, authenticated;
grant execute on function public.get_admin_bkash_payment_queue() to authenticated;

create function public.get_admin_members(p_search text default '', p_limit integer default 50, p_offset integer default 0)
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  profile_completed_at timestamptz,
  team_id uuid,
  team_name text,
  team_code text,
  team_role text,
  ign text,
  game_code text,
  external_id text
)
language plpgsql
stable
security definer
set search_path = ''
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
    select account.id,
      profile.full_name,
      account.email,
      profile.phone,
      account.created_at,
      account.email_confirmed_at,
      profile.profile_completed_at,
      team.id,
      team.name,
      team.team_code,
      member.role,
      coalesce(identity.in_game_name, member.ign),
      coalesce(identity.game_code, team.game_code),
      coalesce(identity.external_id, member.free_fire_uid)
    from auth.users as account
    left join public.profiles as profile on profile.id = account.id
    left join public.team_members as member on member.user_id = account.id and member.status = 'active'
    left join public.teams as team on team.id = member.team_id
    left join public.player_game_identities as identity
      on identity.user_id = account.id and identity.game_code = team.game_code
    where v_search = ''
      or lower(coalesce(profile.full_name, '')) like '%' || v_search || '%'
      or lower(coalesce(account.email, '')) like '%' || v_search || '%'
      or coalesce(profile.phone, '') like '%' || v_search || '%'
      or lower(coalesce(team.name, '')) like '%' || v_search || '%'
    order by account.created_at desc
    limit p_limit offset p_offset;
end;
$$;

revoke all on function public.get_admin_members(text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_admin_members(text, integer, integer) to authenticated;

create function public.get_admin_member_details(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_profile public.profiles%rowtype;
  v_result jsonb;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_ID';
  end if;
  select * into v_user from auth.users where id = p_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'MEMBER_NOT_FOUND'; end if;
  select * into v_profile from public.profiles where id = p_user_id;

  select jsonb_build_object(
    'user_id', v_user.id,
    'full_name', v_profile.full_name,
    'email', v_user.email,
    'phone', v_profile.phone,
    'created_at', v_user.created_at,
    'email_confirmed_at', v_user.email_confirmed_at,
    'profile_completed_at', v_profile.profile_completed_at,
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_id', team.id, 'team_name', team.name, 'team_code', team.team_code,
        'team_logo', team.logo_path, 'game_code', team.game_code,
        'role', member.role, 'status', member.status,
        'ign', coalesce(identity.in_game_name, member.ign),
        'external_id', coalesce(identity.external_id, member.free_fire_uid)
      ) order by member.joined_at desc)
      from public.team_members as member
      join public.teams as team on team.id = member.team_id
      left join public.player_game_identities as identity
        on identity.user_id = member.user_id and identity.game_code = team.game_code
      where member.user_id = p_user_id
    ), '[]'::jsonb),
    'competition_registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id', entry.id, 'competition_id', competition.id,
        'competition_name', competition.title, 'competition_type', competition.competition_type,
        'status', entry.status, 'registered_at', entry.registered_at,
        'payment_status', payment.status, 'amount', payment.amount, 'currency', payment.currency
      ) order by entry.registered_at desc)
      from public.competition_entries as entry
      join public.competitions as competition on competition.id = entry.competition_id
      left join public.payments as payment on payment.entry_id = entry.id
      where entry.registered_by = p_user_id or entry.player_id = p_user_id
        or exists (select 1 from public.competition_entry_members member
          where member.entry_id = entry.id and member.user_id = p_user_id)
    ), '[]'::jsonb),
    'tournament_registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'registration_id', registration.id, 'tournament_id', tournament.id,
        'tournament_name', tournament.name, 'team_id', registration.team_id,
        'status', registration.status, 'registered_at', registration.registered_at
      ) order by registration.registered_at desc)
      from public.tournament_registrations as registration
      join public.tournaments as tournament on tournament.id = registration.tournament_id
      where registration.registered_by = p_user_id
        or exists (select 1 from public.team_members member
          where member.team_id = registration.team_id and member.user_id = p_user_id)
    ), '[]'::jsonb),
    'participation', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', history.match_id, 'tournament_id', history.tournament_id,
        'tournament_name', history.tournament_name, 'match_number', history.match_number,
        'match_date', history.match_date, 'team_id', history.team_id,
        'team_name', history.team_name, 'placement_rank', history.placement_rank,
        'total_kills', history.total_kills, 'total_points', history.total_points,
        'status', history.status, 'published_at', history.published_at
      ) order by history.match_date desc)
      from public.player_match_history_public as history
      where history.user_id = p_user_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_member_details(uuid) from public, anon, authenticated;
grant execute on function public.get_admin_member_details(uuid) to authenticated;

create table public.payment_email_notifications (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  payment_status text not null check (payment_status in ('approved', 'rejected')),
  delivery_status text not null default 'sending' check (delivery_status in ('sending', 'sent', 'failed')),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, payment_status)
);

alter table public.payment_email_notifications enable row level security;
revoke all on table public.payment_email_notifications from public, anon, authenticated;
grant select, insert, update on table public.payment_email_notifications to service_role;

create function public.claim_payment_email_notification(p_payment_id uuid, p_payment_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual_status text;
  v_existing_status text;
  v_rows integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_payment_status not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_STATUS';
  end if;
  select payment.status into v_actual_status
  from public.payments payment where payment.id = p_payment_id;
  if v_actual_status is distinct from p_payment_status then
    raise exception using errcode = '23514', message = 'PAYMENT_STATUS_CHANGED';
  end if;

  insert into public.payment_email_notifications (payment_id, payment_status, delivery_status)
  values (p_payment_id, p_payment_status, 'sending')
  on conflict (payment_id, payment_status) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then return true; end if;

  select notification.delivery_status into v_existing_status
  from public.payment_email_notifications notification
  where notification.payment_id = p_payment_id and notification.payment_status = p_payment_status
  for update;
  if v_existing_status <> 'failed' then return false; end if;
  update public.payment_email_notifications
  set delivery_status = 'sending', last_error = null, updated_at = now()
  where payment_id = p_payment_id and payment_status = p_payment_status;
  return true;
end;
$$;

create function public.finish_payment_email_notification(
  p_payment_id uuid,
  p_payment_status text,
  p_delivery_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_delivery_status not in ('sent', 'failed') then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_RESULT';
  end if;
  update public.payment_email_notifications
  set delivery_status = p_delivery_status,
      last_error = case when p_delivery_status = 'failed' then left(coalesce(p_error, 'Delivery failed'), 500) else null end,
      updated_at = now()
  where payment_id = p_payment_id and payment_status = p_payment_status and delivery_status = 'sending';
  if not found then raise exception using errcode = 'P0002', message = 'NOTIFICATION_CLAIM_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.claim_payment_email_notification(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_payment_email_notification(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_payment_email_notification(uuid, text) to service_role;
grant execute on function public.finish_payment_email_notification(uuid, text, text, text) to service_role;

commit;
