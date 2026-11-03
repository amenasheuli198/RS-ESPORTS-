begin;

alter table public.profiles
  add column if not exists username text,
  add column if not exists display_name text,
  add column if not exists free_fire_ign text,
  add column if not exists free_fire_uid text,
  add column if not exists region text,
  add column if not exists bio text,
  add column if not exists profile_visibility text not null default 'public' check (profile_visibility in ('public', 'private')),
  add column if not exists uid_visibility text not null default 'private' check (uid_visibility in ('public', 'private')),
  add column if not exists match_history_visibility text not null default 'public' check (match_history_visibility in ('public', 'private'));

alter table public.profiles
  add constraint profiles_username_format_check
  check (username is null or (
    char_length(btrim(username)) between 3 and 30
    and username = btrim(username)
    and username ~ '^[a-zA-Z0-9_\.-]+$'
  ));

alter table public.profiles
  add constraint profiles_display_name_format_check
  check (display_name is null or char_length(btrim(display_name)) between 2 and 80);

alter table public.profiles
  add constraint profiles_free_fire_ign_format_check
  check (free_fire_ign is null or (
    char_length(btrim(free_fire_ign)) between 2 and 32
    and free_fire_ign = btrim(free_fire_ign)
  ));

alter table public.profiles
  add constraint profiles_free_fire_uid_format_check
  check (free_fire_uid is null or free_fire_uid ~ '^[0-9]{5,20}$');

alter table public.profiles
  add constraint profiles_region_format_check
  check (region is null or char_length(btrim(region)) between 2 and 100);

alter table public.profiles
  add constraint profiles_bio_format_check
  check (bio is null or char_length(btrim(bio)) between 1 and 300);

create unique index profiles_username_normalized_unique
  on public.profiles (lower(btrim(username)))
  where username is not null;

alter table public.team_members
  add column if not exists left_at timestamptz;

create table public.player_match_roster_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ign_snapshot text not null,
  free_fire_uid_snapshot text,
  role_snapshot text not null check (role_snapshot in ('captain', 'starting_player', 'substitute')),
  captured_at timestamptz not null default now(),
  unique (match_id, user_id)
);

create index player_match_roster_snapshots_user_idx
  on public.player_match_roster_snapshots (user_id, match_id);

create function public.capture_match_roster_snapshot(p_match_id uuid, p_team_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;

  insert into public.player_match_roster_snapshots (
    match_id, team_id, user_id, ign_snapshot, free_fire_uid_snapshot, role_snapshot
  )
  select
    assignment.match_id,
    assignment.team_id,
    member.user_id,
    member.ign,
    case when member.free_fire_uid is not null and member.free_fire_uid ~ '^[0-9]{5,20}$' then member.free_fire_uid else null end,
    member.role
  from public.match_team_assignments as assignment
  join public.team_members as member
    on member.team_id = assignment.team_id and member.status = 'active'
  where assignment.match_id = p_match_id
    and (p_team_id is null or assignment.team_id = p_team_id)
  on conflict (match_id, user_id) do update set
    team_id = excluded.team_id,
    ign_snapshot = excluded.ign_snapshot,
    free_fire_uid_snapshot = excluded.free_fire_uid_snapshot,
    role_snapshot = excluded.role_snapshot,
    captured_at = now();
end;
$$;

revoke all on function public.capture_match_roster_snapshot(uuid, uuid) from public, anon, authenticated;

create view public.player_profiles_public
with (security_invoker = true)
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
  case when profile.profile_visibility = 'public' then profile.bio else null end as bio,
  profile.profile_visibility,
  profile.uid_visibility,
  profile.match_history_visibility,
  profile.created_at,
  profile.updated_at
from public.profiles as profile
where profile.profile_visibility = 'public';

grant select on public.player_profiles_public to anon, authenticated;

create view public.player_stats_public
with (security_invoker = true)
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
join public.match_results as result
  on result.match_id = snapshot.match_id and result.team_id = snapshot.team_id
where result.status = 'published'
  and snapshot.user_id is not null
group by snapshot.user_id;

grant select on public.player_stats_public to anon, authenticated;

create view public.player_match_history_public
with (security_invoker = true)
as
select
  snapshot.user_id,
  result.id as result_id,
  result.match_id,
  tournament.id as tournament_id,
  tournament.name as tournament_name,
  match.match_number,
  match.scheduled_at as match_date,
  team.id as team_id,
  team.name as team_name,
  result.placement_rank,
  result.total_kills,
  result.total_points,
  result.status,
  result.published_at,
  match.round_name,
  snapshot.role_snapshot
from public.player_match_roster_snapshots as snapshot
join public.match_results as result
  on result.match_id = snapshot.match_id and result.team_id = snapshot.team_id
join public.matches as match
  on match.id = result.match_id
join public.tournaments as tournament
  on tournament.id = match.tournament_id
join public.teams as team
  on team.id = result.team_id
where result.status = 'published';

grant select on public.player_match_history_public to anon, authenticated;

create view public.player_team_history_public
with (security_invoker = true)
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
  member.free_fire_uid
from public.team_members as member
join public.teams as team
  on team.id = member.team_id
where member.status in ('active', 'removed');

grant select on public.player_team_history_public to anon, authenticated;

create function public.save_player_profile(p_profile jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_username text := btrim(coalesce(p_profile ->> 'username', ''));
  v_display_name text := btrim(coalesce(p_profile ->> 'display_name', ''));
  v_free_fire_ign text := btrim(coalesce(p_profile ->> 'free_fire_ign', ''));
  v_free_fire_uid text := btrim(coalesce(p_profile ->> 'free_fire_uid', ''));
  v_region text := btrim(coalesce(p_profile ->> 'region', ''));
  v_bio text := btrim(coalesce(p_profile ->> 'bio', ''));
  v_visibility text := coalesce(p_profile ->> 'profile_visibility', 'public');
  v_uid_visibility text := coalesce(p_profile ->> 'uid_visibility', 'private');
  v_match_visibility text := coalesce(p_profile ->> 'match_history_visibility', 'public');
  v_avatar_url text := nullif(btrim(coalesce(p_profile ->> 'avatar_url', '')), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if v_visibility not in ('public', 'private') or v_uid_visibility not in ('public', 'private') or v_match_visibility not in ('public', 'private') then
    raise exception using errcode = '22023', message = 'INVALID_PROFILE_VISIBILITY';
  end if;
  if v_username is not null and char_length(v_username) not between 3 and 30 then
    raise exception using errcode = '22023', message = 'INVALID_USERNAME';
  end if;
  if v_username is not null and v_username !~ '^[a-zA-Z0-9_\.-]+$' then
    raise exception using errcode = '22023', message = 'INVALID_USERNAME';
  end if;
  if v_username is not null and exists (
    select 1 from public.profiles as profile
    where profile.username = v_username and profile.id <> v_user_id
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
  if v_avatar_url is not null and char_length(v_avatar_url) > 2048 then
    raise exception using errcode = '22023', message = 'INVALID_AVATAR_URL';
  end if;

  update public.profiles set
    username = case when v_username = '' then null else v_username end,
    display_name = case when v_display_name = '' then null else v_display_name end,
    avatar_url = v_avatar_url,
    free_fire_ign = case when v_free_fire_ign = '' then null else v_free_fire_ign end,
    free_fire_uid = case when v_free_fire_uid = '' then null else v_free_fire_uid end,
    region = case when v_region = '' then null else v_region end,
    bio = case when v_bio = '' then null else v_bio end,
    profile_visibility = v_visibility,
    uid_visibility = v_uid_visibility,
    match_history_visibility = v_match_visibility,
    updated_at = now()
  where id = v_user_id;

  if not found then
    insert into public.profiles (
      id, username, display_name, avatar_url, free_fire_ign, free_fire_uid, region, bio,
      profile_visibility, uid_visibility, match_history_visibility
    ) values (
      v_user_id, case when v_username = '' then null else v_username end,
      case when v_display_name = '' then null else v_display_name end,
      v_avatar_url,
      case when v_free_fire_ign = '' then null else v_free_fire_ign end,
      case when v_free_fire_uid = '' then null else v_free_fire_uid end,
      case when v_region = '' then null else v_region end,
      case when v_bio = '' then null else v_bio end,
      v_visibility, v_uid_visibility, v_match_visibility
    );
  end if;

  return v_user_id;
end;
$$;

revoke all on function public.save_player_profile(jsonb) from public, anon, authenticated;
grant execute on function public.save_player_profile(jsonb) to authenticated;

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to anon, authenticated;

grant update (username, display_name, avatar_url, free_fire_ign, free_fire_uid, region, bio, profile_visibility, uid_visibility, match_history_visibility, updated_at) on table public.profiles to authenticated;

create policy "Public profiles are readable when public"
  on public.profiles
  for select
  to anon, authenticated
  using (profile_visibility = 'public');

create policy "Users read their own private profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();

commit;
