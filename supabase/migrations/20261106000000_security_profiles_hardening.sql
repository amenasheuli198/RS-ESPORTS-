begin;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists profile_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_phone_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_phone_format_check
      check (phone is null or phone ~ '^\+?[1-9][0-9]{6,14}$');
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_completion_fields_check'
  ) then
    alter table public.profiles
      add constraint profiles_completion_fields_check
      check (profile_completed_at is null or (full_name is not null and phone is not null));
  end if;
end;
$$;

create or replace function rs_internal.is_player_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as account
    join public.profiles as profile on profile.id = account.id
    where account.id = (select auth.uid())
      and account.email_confirmed_at is not null
      and profile.profile_completed_at is not null
      and profile.full_name is not null
      and profile.phone is not null
  );
$$;

revoke all on function rs_internal.is_player_ready() from public, anon;
grant usage on schema rs_internal to authenticated;
grant execute on function rs_internal.is_player_ready() to authenticated;

create function public.complete_my_profile(p_full_name text, p_phone text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_full_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_phone text := nullif(regexp_replace(btrim(coalesce(p_phone, '')), '[[:space:]()-]', '', 'g'), '');
  v_completed_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id
      and profile.profile_completed_at is not null
      and profile.phone is distinct from v_phone
  ) then
    raise exception using errcode = '42501', message = 'PHONE_CHANGE_REQUIRES_VERIFICATION';
  end if;
  if not exists (
    select 1 from auth.users as account
    where account.id = v_user_id and account.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'EMAIL_VERIFICATION_REQUIRED';
  end if;
  if v_full_name is null or char_length(v_full_name) not between 2 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_FULL_NAME';
  end if;
  if v_phone is null or v_phone !~ '^\+?[1-9][0-9]{6,14}$' then
    raise exception using errcode = '22023', message = 'INVALID_PHONE_NUMBER';
  end if;

  insert into public.profiles (id, full_name, phone, profile_completed_at)
  values (v_user_id, v_full_name, v_phone, v_completed_at)
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    profile_completed_at = coalesce(public.profiles.profile_completed_at, excluded.profile_completed_at),
    updated_at = now();

  return v_completed_at;
end;
$$;

revoke all on function public.complete_my_profile(text, text) from public, anon;
grant execute on function public.complete_my_profile(text, text) to authenticated;

create function public.get_my_profile()
returns table (
  id uuid,
  full_name text,
  display_name text,
  username text,
  avatar_url text,
  free_fire_ign text,
  free_fire_uid text,
  region text,
  bio text,
  profile_visibility text,
  uid_visibility text,
  match_history_visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  phone text,
  profile_completed_at timestamptz
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
    select profile.id, profile.full_name, profile.display_name, profile.username,
      profile.avatar_url, profile.free_fire_ign, profile.free_fire_uid, profile.region,
      profile.bio, profile.profile_visibility, profile.uid_visibility,
      profile.match_history_visibility, profile.created_at, profile.updated_at,
      profile.phone, profile.profile_completed_at
    from public.profiles as profile
    where profile.id = v_user_id;
end;
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.save_player_profile(p_profile jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_full_name text := nullif(btrim(coalesce(p_profile ->> 'full_name', '')), '');
  v_username text := nullif(btrim(coalesce(p_profile ->> 'username', '')), '');
  v_display_name text := nullif(btrim(coalesce(p_profile ->> 'display_name', '')), '');
  v_free_fire_ign text := nullif(btrim(coalesce(p_profile ->> 'free_fire_ign', '')), '');
  v_free_fire_uid text := nullif(btrim(coalesce(p_profile ->> 'free_fire_uid', '')), '');
  v_region text := nullif(btrim(coalesce(p_profile ->> 'region', '')), '');
  v_bio text := nullif(btrim(coalesce(p_profile ->> 'bio', '')), '');
  v_phone text := nullif(regexp_replace(btrim(coalesce(p_profile ->> 'phone', '')), '[[:space:]()-]', '', 'g'), '');
  v_visibility text := coalesce(p_profile ->> 'profile_visibility', 'public');
  v_uid_visibility text := coalesce(p_profile ->> 'uid_visibility', 'private');
  v_match_visibility text := coalesce(p_profile ->> 'match_history_visibility', 'public');
  v_avatar_url text := nullif(btrim(coalesce(p_profile ->> 'avatar_url', '')), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_PROFILE_PAYLOAD';
  end if;
  if p_profile ? 'full_name' and (v_full_name is null or char_length(v_full_name) not between 2 and 100) then
    raise exception using errcode = '22023', message = 'INVALID_FULL_NAME';
  end if;
  if p_profile ? 'phone' and (v_phone is null or v_phone !~ '^\+?[1-9][0-9]{6,14}$') then
    raise exception using errcode = '22023', message = 'INVALID_PHONE_NUMBER';
  end if;
  if p_profile ? 'phone' and exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id
      and profile.profile_completed_at is not null
      and profile.phone is distinct from v_phone
  ) then
    raise exception using errcode = '42501', message = 'PHONE_CHANGE_REQUIRES_VERIFICATION';
  end if;
  if v_username is not null and (char_length(v_username) not between 3 and 30 or v_username !~ '^[a-zA-Z0-9_.-]+$') then
    raise exception using errcode = '22023', message = 'INVALID_USERNAME';
  end if;
  if v_username is not null and exists (
    select 1 from public.profiles as profile
    where lower(profile.username) = lower(v_username) and profile.id <> v_user_id
  ) then
    raise exception using errcode = '23505', message = 'USERNAME_ALREADY_TAKEN';
  end if;
  if v_display_name is not null and char_length(v_display_name) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_DISPLAY_NAME';
  end if;
  if v_free_fire_ign is not null and char_length(v_free_fire_ign) not between 2 and 32 then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_IGN';
  end if;
  if v_free_fire_uid is not null and v_free_fire_uid !~ '^[0-9]{5,20}$' then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;
  if v_region is not null and char_length(v_region) not between 2 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_REGION';
  end if;
  if v_bio is not null and char_length(v_bio) not between 1 and 300 then
    raise exception using errcode = '22023', message = 'INVALID_BIO';
  end if;
  if v_avatar_url is not null and (char_length(v_avatar_url) > 2048 or v_avatar_url !~* '^https://[^[:space:]]+$') then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_URL';
  end if;
  if v_visibility not in ('public', 'private') or v_uid_visibility not in ('public', 'private')
    or v_match_visibility not in ('public', 'private') then
    raise exception using errcode = '22023', message = 'INVALID_PROFILE_VISIBILITY';
  end if;

  insert into public.profiles (
    id, full_name, username, display_name, avatar_url, free_fire_ign, free_fire_uid,
    region, bio, phone, profile_visibility, uid_visibility, match_history_visibility
  ) values (
    v_user_id, v_full_name, v_username, v_display_name, v_avatar_url, v_free_fire_ign,
    v_free_fire_uid, v_region, v_bio, v_phone, v_visibility, v_uid_visibility, v_match_visibility
  )
  on conflict (id) do update set
    full_name = coalesce(v_full_name, public.profiles.full_name),
    username = v_username,
    display_name = v_display_name,
    avatar_url = v_avatar_url,
    free_fire_ign = v_free_fire_ign,
    free_fire_uid = v_free_fire_uid,
    region = v_region,
    bio = v_bio,
    phone = coalesce(v_phone, public.profiles.phone),
    profile_visibility = v_visibility,
    uid_visibility = v_uid_visibility,
    match_history_visibility = v_match_visibility,
    updated_at = now();

  return v_user_id;
end;
$$;

revoke all on function public.save_player_profile(jsonb) from public, anon, authenticated;
grant execute on function public.save_player_profile(jsonb) to authenticated;

create or replace function public.get_private_platform_settings()
returns table (
  setting_key text,
  setting_value jsonb,
  setting_group text,
  description text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  return query
    select settings.setting_key, settings.setting_value, settings.setting_group, settings.description
    from public.platform_settings as settings
    order by settings.setting_group, settings.setting_key;
end;
$$;

revoke all on function public.get_private_platform_settings() from public, anon, authenticated;
grant execute on function public.get_private_platform_settings() to authenticated;

revoke all on function public.achievement_progress_for_user(uuid, uuid) from public, anon, authenticated;

create or replace function public.evaluate_player_achievements(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  achievement public.achievement_definitions%rowtype;
  v_progress numeric;
  v_target numeric;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER';
  end if;
  for achievement in
    select * from public.achievement_definitions where is_active = true order by display_order asc
  loop
    v_progress := public.achievement_progress_for_user(p_user_id, achievement.id);
    v_target := coalesce(nullif(achievement.criteria ->> 'target', '')::numeric, 0);
    if jsonb_typeof(achievement.criteria) = 'object' and v_progress >= v_target then
      insert into public.player_achievements (user_id, achievement_id, progress_value, manually_awarded)
      values (p_user_id, achievement.id, v_progress, false)
      on conflict (user_id, achievement_id) do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.evaluate_achievement_for_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.match_results%rowtype;
  v_user_id uuid;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  select * into v_result
  from public.match_results
  where id = p_result_id and status = 'published';
  if not found then
    raise exception using errcode = 'P0002', message = 'PUBLISHED_RESULT_NOT_FOUND';
  end if;
  for v_user_id in
    select distinct snapshot.user_id
    from public.player_match_roster_snapshots as snapshot
    where snapshot.match_id = v_result.match_id and snapshot.team_id = v_result.team_id
  loop
    perform public.evaluate_player_achievements(v_user_id);
  end loop;
end;
$$;

create or replace function public.try_award_achievement(
  p_user_id uuid,
  p_achievement_slug text,
  p_reason text default null,
  p_manual boolean default false,
  p_awarded_by uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_achievement public.achievement_definitions%rowtype;
  v_user_id uuid := (select auth.uid());
  v_progress numeric;
  v_target numeric;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_manual is distinct from true or p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = '22023', message = 'INVALID_MANUAL_AWARD';
  end if;
  if p_awarded_by is not null and p_awarded_by <> v_user_id then
    raise exception using errcode = '42501', message = 'ACTOR_MISMATCH';
  end if;
  if char_length(coalesce(p_reason, '')) > 2000 then
    raise exception using errcode = '22023', message = 'INVALID_AWARD_REASON';
  end if;
  select * into v_achievement from public.achievement_definitions
  where slug = p_achievement_slug and is_active = true;
  if not found then
    return false;
  end if;
  select progress into v_progress
  from (select public.achievement_progress_for_user(p_user_id, v_achievement.id) as progress) as computed;
  v_target := coalesce(nullif(v_achievement.criteria ->> 'target', '')::numeric, 0);
  if v_progress < v_target then
    raise exception using errcode = '23514', message = 'ACHIEVEMENT_CRITERIA_NOT_MET';
  end if;
  insert into public.player_achievements (
    user_id, achievement_id, progress_value, manually_awarded, awarded_by, award_reason
  ) values (
    p_user_id, v_achievement.id, v_progress, true, v_user_id, nullif(btrim(p_reason), '')
  ) on conflict (user_id, achievement_id) do nothing;
  return found;
end;
$$;

revoke all on function public.evaluate_player_achievements(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_achievement_for_result(uuid) from public, anon, authenticated;
revoke all on function public.try_award_achievement(uuid, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.evaluate_player_achievements(uuid) to authenticated;
grant execute on function public.evaluate_achievement_for_result(uuid) to authenticated;
grant execute on function public.try_award_achievement(uuid, text, text, boolean, uuid) to authenticated;

revoke all on function public.seed_default_achievements() from public, anon, authenticated;

alter table public.player_match_roster_snapshots enable row level security;
revoke all on table public.player_match_roster_snapshots from public, anon, authenticated;
grant execute on function public.capture_match_roster_snapshot(uuid, uuid) to authenticated;

revoke all on table public.profiles from public, anon, authenticated;
grant select (
  id, full_name, display_name, username, avatar_url, free_fire_ign, region, bio,
  profile_visibility, uid_visibility, match_history_visibility, created_at, updated_at
) on table public.profiles to anon, authenticated;
grant update (
  username, display_name, avatar_url, free_fire_ign, free_fire_uid, region, bio,
  profile_visibility, uid_visibility, match_history_visibility
) on table public.profiles to authenticated;

create policy "Admins can read player profiles"
  on public.profiles
  for select
  to authenticated
  using (rs_internal.is_tournament_admin());

create policy "Public can read active achievement definitions"
  on public.achievement_definitions
  for select
  to anon, authenticated
  using (is_active = true);

create policy "Users can read their own achievements"
  on public.player_achievements
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can read their own badge collections"
  on public.badge_collection
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace view public.player_profiles_public
with (security_barrier = true, security_invoker = false)
as
select
  profile.id,
  profile.username,
  profile.full_name,
  coalesce(profile.display_name, profile.full_name) as display_name,
  profile.avatar_url,
  profile.free_fire_ign,
  case when profile.uid_visibility = 'public' then profile.free_fire_uid else null end as free_fire_uid,
  profile.region,
  profile.bio,
  profile.profile_visibility,
  profile.uid_visibility,
  profile.match_history_visibility,
  profile.created_at,
  profile.updated_at
from public.profiles as profile
where profile.profile_visibility = 'public';

grant select on public.player_profiles_public to anon, authenticated;

create or replace view public.player_stats_public
with (security_barrier = true, security_invoker = false)
as
select
  snapshot.user_id,
  count(*) as matches_played,
  sum(result.total_kills) as total_kills,
  sum(result.total_points) as total_points,
  count(*) filter (where result.placement_rank = 1) as wins,
  count(*) filter (where result.placement_rank <= 3) as top_3_finishes,
  count(*) filter (where result.placement_rank <= 5) as top_5_finishes,
  avg(result.placement_rank) as average_placement,
  avg(result.total_kills) as average_kills_per_match,
  min(result.placement_rank) as best_placement,
  round((count(*) filter (where result.placement_rank = 1)::numeric / nullif(count(*), 0)::numeric * 100), 2) as win_rate
from public.player_match_roster_snapshots as snapshot
join public.match_results_public as result
  on result.match_id = snapshot.match_id and result.team_id = snapshot.team_id
join public.profiles as profile on profile.id = snapshot.user_id
where profile.match_history_visibility = 'public'
   or snapshot.user_id = (select auth.uid())
group by snapshot.user_id;

grant select on public.player_stats_public to anon, authenticated;

create or replace view public.player_match_history_public
with (security_barrier = true, security_invoker = false)
as
select
  snapshot.user_id,
  result.result_id,
  result.match_id,
  result.tournament_id,
  result.tournament_name,
  result.match_number,
  result.scheduled_at as match_date,
  result.team_id,
  result.team_name,
  result.placement_rank,
  result.total_kills,
  result.total_points,
  'published'::text as status,
  result.published_at,
  result.round_name,
  snapshot.role_snapshot
from public.player_match_roster_snapshots as snapshot
join public.match_results_public as result
  on result.match_id = snapshot.match_id and result.team_id = snapshot.team_id
join public.profiles as profile on profile.id = snapshot.user_id
where profile.match_history_visibility = 'public'
   or snapshot.user_id = (select auth.uid());

grant select on public.player_match_history_public to anon, authenticated;

create or replace view public.player_team_history_public
with (security_barrier = true, security_invoker = false)
as
select
  member.user_id,
  member.id as membership_id,
  team.id as team_id,
  team.name as team_name,
  member.role,
  member.joined_at,
  member.left_at,
  member.status,
  member.ign,
  case when profile.uid_visibility = 'public' then member.free_fire_uid else null end as free_fire_uid
from public.team_members as member
join public.teams as team on team.id = member.team_id
join public.profiles as profile on profile.id = member.user_id
where member.status in ('active', 'removed')
  and (profile.profile_visibility = 'public' or member.user_id = (select auth.uid()));

grant select on public.player_team_history_public to anon, authenticated;

create function public.get_player_profile(p_username text)
returns table (
  id uuid,
  username text,
  full_name text,
  display_name text,
  avatar_url text,
  free_fire_ign text,
  free_fire_uid text,
  region text,
  bio text,
  profile_visibility text,
  uid_visibility text,
  match_history_visibility text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.username, profile.full_name,
    coalesce(profile.display_name, profile.full_name), profile.avatar_url,
    profile.free_fire_ign,
    case when profile.uid_visibility = 'public' or profile.id = (select auth.uid()) then profile.free_fire_uid else null end,
    profile.region,
    case when profile.profile_visibility = 'public' or profile.id = (select auth.uid()) then profile.bio else null end,
    profile.profile_visibility, profile.uid_visibility, profile.match_history_visibility,
    profile.created_at, profile.updated_at
  from public.profiles as profile
  where lower(profile.username) = lower(btrim(p_username))
    and (profile.profile_visibility = 'public' or profile.id = (select auth.uid()));
$$;

revoke all on function public.get_player_profile(text) from public, anon;
grant execute on function public.get_player_profile(text) to anon, authenticated;

create or replace function public.set_my_notification_preferences(
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
    coalesce(p_team_updates, true), coalesce(p_result_updates, true), coalesce(p_system_updates, true)
  ) on conflict (user_id) do update set
    tournament_announcements = excluded.tournament_announcements,
    match_updates = excluded.match_updates,
    team_updates = excluded.team_updates,
    result_updates = excluded.result_updates,
    system_updates = excluded.system_updates,
    updated_at = now();
end;
$$;

revoke all on function public.set_my_notification_preferences(boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.set_my_notification_preferences(boolean, boolean, boolean, boolean, boolean) to authenticated;

create function rs_internal.enforce_player_readiness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if not rs_internal.is_player_ready() then
    raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function rs_internal.enforce_player_readiness() from public, anon, authenticated;

create trigger enforce_ready_profile_before_team_create
  before insert on public.teams
  for each row execute function rs_internal.enforce_player_readiness();

create trigger enforce_ready_profile_before_team_membership
  before insert on public.team_members
  for each row execute function rs_internal.enforce_player_readiness();

create trigger enforce_ready_profile_before_tournament_registration
  before insert on public.tournament_registrations
  for each row execute function rs_internal.enforce_player_readiness();

commit;
