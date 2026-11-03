begin;

create table public.achievement_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null check (category in ('tournament', 'match', 'performance', 'victory', 'competitive')),
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'legendary')),
  icon_url text check (icon_url is null or char_length(icon_url) <= 2048),
  criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(criteria) = 'object'),
  is_active boolean not null default true,
  display_order integer not null default 100 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index achievement_definitions_category_order_idx
  on public.achievement_definitions (category, display_order, created_at desc);

create table public.player_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid not null references public.achievement_definitions (id) on delete restrict,
  earned_at timestamptz not null default now(),
  progress_value numeric(18, 3) default 0,
  manually_awarded boolean not null default false,
  awarded_by uuid references auth.users (id) on delete set null,
  award_reason text check (award_reason is null or char_length(award_reason) <= 2000),
  unique (user_id, achievement_id)
);

create index player_achievements_user_earned_idx
  on public.player_achievements (user_id, earned_at desc);

create table public.badge_collection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid not null references public.achievement_definitions (id) on delete restrict,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create index badge_collection_user_featured_idx
  on public.badge_collection (user_id, featured desc);

alter table public.achievement_definitions enable row level security;
alter table public.player_achievements enable row level security;
alter table public.badge_collection enable row level security;

revoke all on table public.achievement_definitions, public.player_achievements, public.badge_collection from public, anon, authenticated;
grant select on table public.achievement_definitions to anon, authenticated;
grant select on table public.player_achievements to authenticated;
grant select on table public.badge_collection to authenticated;

create function public.set_achievement_definitions_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_achievement_definitions_updated_at
  before update on public.achievement_definitions
  for each row execute function public.set_achievement_definitions_updated_at();

revoke all on function public.set_achievement_definitions_updated_at() from public, anon, authenticated;

create function public.achievement_progress_for_user(p_user_id uuid, p_achievement_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when criteria->>'metric' = 'matches_played' then coalesce((select matches_played from public.player_stats_public where user_id = p_user_id), 0)
      when criteria->>'metric' = 'total_kills' then coalesce((select total_kills from public.player_stats_public where user_id = p_user_id), 0)
      when criteria->>'metric' = 'total_points' then coalesce((select total_points from public.player_stats_public where user_id = p_user_id), 0)
      when criteria->>'metric' = 'wins' then coalesce((select wins from public.player_stats_public where user_id = p_user_id), 0)
      when criteria->>'metric' = 'top_3_finishes' then coalesce((select top_3_finishes from public.player_stats_public where user_id = p_user_id), 0)
      when criteria->>'metric' = 'tournaments_participated' then count(distinct tournament.id)
      else 0
    end::numeric
  from public.achievement_definitions as achievement
  left join public.player_match_history_public as history on history.user_id = p_user_id
  left join public.matches as match on match.id = history.match_id
  left join public.tournaments as tournament on tournament.id = match.tournament_id
  where achievement.id = p_achievement_id
  group by achievement.criteria;
$$;

revoke all on function public.achievement_progress_for_user(uuid, uuid) from public, anon, authenticated;

grant execute on function public.achievement_progress_for_user(uuid, uuid) to authenticated;

create function public.evaluate_player_achievements(p_user_id uuid)
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
  for achievement in
    select * from public.achievement_definitions where is_active = true order by display_order asc
  loop
    v_progress := public.achievement_progress_for_user(p_user_id, achievement.id);
    v_target := coalesce((achievement.criteria ->> 'target')::numeric, 0);

    if achievement.criteria is not null and jsonb_typeof(achievement.criteria) = 'object' and v_progress >= v_target then
      insert into public.player_achievements (user_id, achievement_id, progress_value, manually_awarded)
      values (p_user_id, achievement.id, v_progress, false)
      on conflict (user_id, achievement_id) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.evaluate_player_achievements(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_player_achievements(uuid) to authenticated;

create function public.evaluate_achievement_for_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.match_results%rowtype;
  v_user_id uuid;
  v_team_id uuid;
begin
  if not exists (select 1 from public.match_results where id = p_result_id and status = 'published') then
    return;
  end if;

  select * into v_result from public.match_results where id = p_result_id;

  for v_team_id in
    select distinct snapshot.team_id from public.player_match_roster_snapshots as snapshot where snapshot.match_id = v_result.match_id
  loop
    for v_user_id in
      select distinct snapshot.user_id from public.player_match_roster_snapshots as snapshot where snapshot.match_id = v_result.match_id and snapshot.team_id = v_team_id
    loop
      perform public.evaluate_player_achievements(v_user_id);
    end loop;
  end loop;
end;
$$;

revoke all on function public.evaluate_achievement_for_result(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_achievement_for_result(uuid) to authenticated;

create function public.try_award_achievement(p_user_id uuid, p_achievement_slug text, p_reason text default null, p_manual boolean default false, p_awarded_by uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_achievement_id uuid;
  v_existing_count integer;
begin
  select id into v_achievement_id from public.achievement_definitions where slug = p_achievement_slug and is_active = true;
  if v_achievement_id is null then
    return false;
  end if;

  if p_manual and (p_awarded_by is null or not rs_internal.is_tournament_admin()) then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  select count(*) into v_existing_count from public.player_achievements where user_id = p_user_id and achievement_id = v_achievement_id;
  if v_existing_count > 0 then
    return false;
  end if;

  insert into public.player_achievements (user_id, achievement_id, progress_value, manually_awarded, awarded_by, award_reason)
  values (p_user_id, v_achievement_id, 1, p_manual, p_awarded_by, p_reason)
  on conflict (user_id, achievement_id) do nothing;

  return true;
end;
$$;

revoke all on function public.try_award_achievement(uuid, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.try_award_achievement(uuid, text, text, boolean, uuid) to authenticated;

create view public.achievement_catalog_public
with (security_invoker = true)
as
select
  id,
  name,
  slug,
  description,
  category,
  tier,
  icon_url,
  criteria,
  is_active,
  display_order,
  created_at,
  updated_at
from public.achievement_definitions
where is_active = true;

grant select on public.achievement_catalog_public to anon, authenticated;

create function public.seed_default_achievements()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.achievement_definitions (name, slug, description, category, tier, criteria, display_order)
  values
    ('First Tournament', 'first-tournament', 'Complete your first tournament.', 'tournament', 'bronze', jsonb_build_object('metric', 'tournaments_participated', 'target', 1), 10),
    ('Tournament Veteran', 'tournament-veteran', 'Participate in 10 tournaments.', 'tournament', 'silver', jsonb_build_object('metric', 'tournaments_participated', 'target', 10), 20),
    ('Tournament Legend', 'tournament-legend', 'Participate in 50 tournaments.', 'tournament', 'legendary', jsonb_build_object('metric', 'tournaments_participated', 'target', 50), 30),
    ('First Match', 'first-match', 'Complete your first official match.', 'match', 'bronze', jsonb_build_object('metric', 'matches_played', 'target', 1), 40),
    ('Match Veteran', 'match-veteran', 'Complete 25 matches.', 'match', 'silver', jsonb_build_object('metric', 'matches_played', 'target', 25), 50),
    ('Match Machine', 'match-machine', 'Complete 100 matches.', 'match', 'diamond', jsonb_build_object('metric', 'matches_played', 'target', 100), 60),
    ('First Blood', 'first-blood', 'Record your first verified kill.', 'performance', 'bronze', jsonb_build_object('metric', 'total_kills', 'target', 1), 70),
    ('Sharpshooter', 'sharpshooter', 'Reach 50 verified kills.', 'performance', 'gold', jsonb_build_object('metric', 'total_kills', 'target', 50), 80),
    ('Elimination Expert', 'elimination-expert', 'Reach 100 verified kills.', 'performance', 'platinum', jsonb_build_object('metric', 'total_kills', 'target', 100), 90),
    ('Century Club', 'century-club', 'Reach 100 total verified kills.', 'performance', 'diamond', jsonb_build_object('metric', 'total_kills', 'target', 100), 100),
    ('First Victory', 'first-victory', 'Achieve your first first-place finish.', 'victory', 'bronze', jsonb_build_object('metric', 'wins', 'target', 1), 110),
    ('Champion', 'champion', 'Win 5 matches.', 'victory', 'gold', jsonb_build_object('metric', 'wins', 'target', 5), 120),
    ('Dominator', 'dominator', 'Win 10 matches.', 'victory', 'legendary', jsonb_build_object('metric', 'wins', 'target', 10), 130),
    ('Top 3 Finisher', 'top-3-finisher', 'Finish in the top three 10 times.', 'competitive', 'silver', jsonb_build_object('metric', 'top_3_finishes', 'target', 10), 140),
    ('Consistent Performer', 'consistent-performer', 'Reach an average points threshold.', 'competitive', 'gold', jsonb_build_object('metric', 'total_points', 'target', 1800), 150),
    ('Rising Star', 'rising-star', 'Reach a competitive milestone.', 'competitive', 'platinum', jsonb_build_object('metric', 'matches_played', 'target', 10), 160)
  on conflict (slug) do nothing;
end;
$$;

revoke all on function public.seed_default_achievements() from public, anon, authenticated;
grant execute on function public.seed_default_achievements() to authenticated;

create function public.admin_seed_achievements()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  perform public.seed_default_achievements();
end;
$$;

revoke all on function public.admin_seed_achievements() from public, anon, authenticated;
grant execute on function public.admin_seed_achievements() to authenticated;

commit;
