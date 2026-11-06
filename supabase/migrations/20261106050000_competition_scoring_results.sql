begin;

create table public.competition_scoring_configs (
  competition_id uuid primary key references public.competitions (id) on delete cascade,
  scoring_code text not null check (scoring_code in ('battle_royale', 'chess_points')),
  scoring_rules jsonb not null check (jsonb_typeof(scoring_rules) = 'object'),
  allow_shared_rank boolean not null default false,
  configured_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.competition_scoring_configs enable row level security;
revoke all on table public.competition_scoring_configs from public, anon, authenticated;
grant select on public.competition_scoring_configs to anon, authenticated;

alter table public.match_results
  alter column registration_id drop not null,
  alter column team_id drop not null,
  alter column placement_rank drop not null,
  add column competition_entry_id uuid references public.competition_entries (id) on delete restrict,
  add column score_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(score_payload) = 'object'),
  add column score_points numeric(12, 3) not null default 0 check (score_points >= 0 and score_points < 'Infinity'::numeric),
  add constraint match_results_entry_source_check check (
    (competition_entry_id is null and registration_id is not null and team_id is not null)
    or (competition_entry_id is not null and registration_id is null)
  );

create unique index match_results_competition_entry_unique
  on public.match_results (match_id, competition_entry_id)
  where competition_entry_id is not null;

alter table public.result_audit_logs
  alter column team_id drop not null,
  add column competition_entry_id uuid references public.competition_entries (id) on delete restrict;

alter table public.competition_scoring_configs enable row level security;
revoke all on table public.competition_scoring_configs from public, anon, authenticated;
grant select on public.competition_scoring_configs to anon, authenticated;
create policy "Published competition scoring rules are public"
  on public.competition_scoring_configs for select to anon, authenticated
  using (exists (
    select 1 from public.competitions competition
    where competition.id = competition_id and competition.status in ('published', 'registration_closed', 'live', 'completed')
  ) or rs_internal.has_competition_permission('manage_competitions'));

create function public.set_competition_scoring_config(p_competition_id uuid, p_scoring_rules jsonb, p_allow_shared_rank boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_scoring_code text;
  v_key text;
  v_value jsonb;
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if jsonb_typeof(p_scoring_rules) <> 'object' or p_allow_shared_rank is null then
    raise exception using errcode = '22023', message = 'INVALID_SCORING_RULES';
  end if;
  select format.scoring_code into v_scoring_code
  from public.competitions competition
  join public.game_formats format
    on format.game_code = competition.game_code and format.format_code = competition.format_code
  where competition.id = p_competition_id for update of competition;
  if not found then raise exception using errcode = 'P0002', message = 'COMPETITION_NOT_FOUND'; end if;
  if exists (select 1 from public.matches match
    join public.match_results result on result.match_id = match.id
    where match.competition_id = p_competition_id) then
    raise exception using errcode = '23514', message = 'SCORING_LOCKED_AFTER_RESULTS';
  end if;
  if v_scoring_code = 'battle_royale' then
    if jsonb_typeof(p_scoring_rules -> 'placement_points') <> 'object'
      or coalesce((p_scoring_rules ->> 'max_placement_rank')::integer, 0) not between 1 and 256
      or coalesce((p_scoring_rules ->> 'points_per_kill')::numeric, -1) < 0 then
      raise exception using errcode = '22023', message = 'INVALID_BATTLE_ROYALE_SCORING';
    end if;
    for v_key, v_value in select key, value from jsonb_each(p_scoring_rules -> 'placement_points') loop
      if v_key !~ '^[1-9][0-9]{0,2}$' or v_key::integer > (p_scoring_rules ->> 'max_placement_rank')::integer
        or jsonb_typeof(v_value) <> 'number' or v_value::text::numeric < 0 then
        raise exception using errcode = '22023', message = 'INVALID_PLACEMENT_POINTS';
      end if;
    end loop;
  elsif v_scoring_code = 'chess_points' then
    if jsonb_typeof(p_scoring_rules -> 'win') <> 'number'
      or jsonb_typeof(p_scoring_rules -> 'draw') <> 'number'
      or jsonb_typeof(p_scoring_rules -> 'loss') <> 'number'
      or (p_scoring_rules ->> 'win')::numeric < 0
      or (p_scoring_rules ->> 'draw')::numeric < 0
      or (p_scoring_rules ->> 'loss')::numeric < 0 then
      raise exception using errcode = '22023', message = 'INVALID_CHESS_SCORING';
    end if;
  end if;

  insert into public.competition_scoring_configs (competition_id, scoring_code, scoring_rules, allow_shared_rank, configured_by)
  values (p_competition_id, v_scoring_code, p_scoring_rules, p_allow_shared_rank, v_user_id)
  on conflict (competition_id) do update set
    scoring_code = excluded.scoring_code,
    scoring_rules = excluded.scoring_rules,
    allow_shared_rank = excluded.allow_shared_rank,
    configured_by = excluded.configured_by,
    updated_at = now();
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'competition_scoring_configured', 'competition', p_competition_id,
    jsonb_build_object('scoring_code', v_scoring_code, 'rules', p_scoring_rules));
end;
$$;

create function rs_internal.calculate_competition_score(p_competition_id uuid, p_score jsonb)
returns table (placement_rank smallint, total_kills integer, placement_points numeric, kill_points numeric, total_points numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_config public.competition_scoring_configs%rowtype;
  v_rank smallint;
  v_kills integer;
  v_result text;
  v_points numeric(12,3);
begin
  if jsonb_typeof(p_score) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_SCORE_PAYLOAD';
  end if;
  select * into v_config from public.competition_scoring_configs where competition_id = p_competition_id;
  if not found then raise exception using errcode = '23514', message = 'SCORING_NOT_CONFIGURED'; end if;

  if v_config.scoring_code = 'battle_royale' then
    v_rank := (p_score ->> 'placement_rank')::smallint;
    v_kills := (p_score ->> 'total_kills')::integer;
    if v_rank is null or v_rank < 1 or v_rank > (v_config.scoring_rules ->> 'max_placement_rank')::integer
      or v_kills is null or v_kills not between 0 and 1000 then
      raise exception using errcode = '22023', message = 'INVALID_BATTLE_ROYALE_SCORE';
    end if;
    v_points := coalesce(nullif(v_config.scoring_rules -> 'placement_points' ->> v_rank::text, '')::numeric, 0);
    return query select v_rank, v_kills, v_points,
      v_kills * (v_config.scoring_rules ->> 'points_per_kill')::numeric,
      v_points + v_kills * (v_config.scoring_rules ->> 'points_per_kill')::numeric;
  elsif v_config.scoring_code = 'chess_points' then
    v_result := p_score ->> 'result';
    if v_result not in ('win', 'draw', 'loss') then
      raise exception using errcode = '22023', message = 'INVALID_CHESS_RESULT';
    end if;
    v_points := (v_config.scoring_rules ->> v_result)::numeric;
    if v_points is null or v_points < 0 then
      raise exception using errcode = '22023', message = 'INVALID_CHESS_SCORE';
    end if;
    return query select null::smallint, 0, 0::numeric, 0::numeric, v_points;
  else
    raise exception using errcode = '22023', message = 'UNSUPPORTED_SCORING_CODE';
  end if;
end;
$$;
revoke all on function rs_internal.calculate_competition_score(uuid, jsonb) from public, anon, authenticated;

create function public.save_competition_match_result(p_match_id uuid, p_entry_id uuid, p_score jsonb, p_admin_notes text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
  v_entry public.competition_entries%rowtype;
  v_result public.match_results%rowtype;
  v_result_id uuid := gen_random_uuid();
  v_rank smallint;
  v_kills integer;
  v_placement numeric;
  v_kill numeric;
  v_points numeric;
  v_allow_shared boolean;
  v_previous jsonb;
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.competition_id is null or v_match.status = 'cancelled' then
    raise exception using errcode = '23514', message = 'COMPETITION_MATCH_NOT_ELIGIBLE_FOR_RESULTS';
  end if;
  select * into v_entry from public.competition_entries where id = p_entry_id for update;
  if not found or v_entry.competition_id <> v_match.competition_id or v_entry.status <> 'confirmed' then
    raise exception using errcode = '23514', message = 'CONFIRMED_MATCH_ENTRY_REQUIRED';
  end if;
  if not (
    exists (select 1 from public.match_team_assignments assignment where assignment.match_id = p_match_id and assignment.entry_id = p_entry_id)
    or exists (select 1 from public.match_participants participant where participant.match_id = p_match_id and participant.entry_id = p_entry_id)
  ) then raise exception using errcode = '42501', message = 'ENTRY_NOT_ASSIGNED_TO_MATCH'; end if;
  select calculated.placement_rank, calculated.total_kills, calculated.placement_points, calculated.kill_points, calculated.total_points
  into v_rank, v_kills, v_placement, v_kill, v_points
  from rs_internal.calculate_competition_score(v_match.competition_id, p_score) as calculated;
  select allow_shared_rank into v_allow_shared from public.competition_scoring_configs where competition_id = v_match.competition_id;
  if v_rank is not null and not v_allow_shared and exists (
    select 1 from public.match_results result where result.match_id = p_match_id
      and result.competition_entry_id <> p_entry_id and result.placement_rank = v_rank and result.status <> 'disputed'
  ) then raise exception using errcode = '23505', message = 'DUPLICATE_PLACEMENT_RANK'; end if;

  select * into v_result from public.match_results where match_id = p_match_id and competition_entry_id = p_entry_id for update;
  if found then
    if v_result.status not in ('draft', 'disputed') then raise exception using errcode = '23514', message = 'RESULT_NOT_EDITABLE'; end if;
    v_result_id := v_result.id;
    v_previous := jsonb_build_object('score_payload', v_result.score_payload, 'score_points', v_result.score_points, 'status', v_result.status);
    update public.match_results set placement_rank = v_rank, total_kills = v_kills,
      placement_points = v_placement, kill_points = v_kill, total_points = v_points,
      score_points = v_points, score_payload = p_score, admin_notes = left(coalesce(p_admin_notes, ''), 3000),
      status = 'draft', submitted_by = null, verified_by = null, verified_at = null, published_by = null, published_at = null
    where id = v_result_id;
  else
    insert into public.match_results (
      id, match_id, registration_id, competition_entry_id, team_id, placement_rank, total_kills,
      placement_points, kill_points, total_points, score_points, score_payload, admin_notes, created_by
    ) values (
      v_result_id, p_match_id, null, p_entry_id, v_entry.team_id, v_rank, v_kills,
      v_placement, v_kill, v_points, v_points, p_score, left(coalesce(p_admin_notes, ''), 3000), v_user_id
    );
  end if;
  insert into public.result_audit_logs (
    result_id, match_id, team_id, competition_entry_id, action, previous_values, new_values, actor_id
  ) values (
    v_result_id, p_match_id, v_entry.team_id, p_entry_id, 'draft_saved', v_previous,
    jsonb_build_object('score_payload', p_score, 'score_points', v_points), v_user_id
  );
  return v_result_id;
end;
$$;

create function public.submit_competition_match_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_result public.match_results%rowtype;
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  select * into v_result from public.match_results where id = p_result_id and competition_entry_id is not null for update;
  if not found then raise exception using errcode = 'P0002', message = 'COMPETITION_RESULT_NOT_FOUND'; end if;
  if not exists (select 1 from public.matches where id = v_result.match_id and status = 'completed') then
    raise exception using errcode = '23514', message = 'MATCH_MUST_BE_COMPLETED';
  end if;
  if v_result.status not in ('draft', 'corrected') then raise exception using errcode = '23514', message = 'RESULT_NOT_SUBMITTABLE'; end if;
  update public.match_results set status = 'submitted', submitted_by = v_user_id where id = p_result_id;
  insert into public.result_audit_logs (result_id, match_id, team_id, competition_entry_id, action, previous_values, new_values, actor_id)
  values (p_result_id, v_result.match_id, v_result.team_id, v_result.competition_entry_id, 'submitted',
    jsonb_build_object('status', v_result.status), jsonb_build_object('status', 'submitted'), v_user_id);
end;
$$;

create function public.review_competition_match_result(p_result_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_result public.match_results%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if p_decision not in ('verified', 'disputed') then raise exception using errcode = '22023', message = 'INVALID_RESULT_DECISION'; end if;
  if p_decision = 'disputed' and v_reason is null then raise exception using errcode = '22023', message = 'DISPUTE_REASON_REQUIRED'; end if;
  select * into v_result from public.match_results where id = p_result_id and competition_entry_id is not null for update;
  if not found or v_result.status <> 'submitted' then raise exception using errcode = '23514', message = 'RESULT_NOT_REVIEWABLE'; end if;
  if v_result.submitted_by = v_user_id then raise exception using errcode = '42501', message = 'SELF_APPROVAL_FORBIDDEN'; end if;
  update public.match_results set status = p_decision,
    verified_by = case when p_decision = 'verified' then v_user_id else null end,
    verified_at = case when p_decision = 'verified' then now() else null end
  where id = p_result_id;
  insert into public.result_audit_logs (result_id, match_id, team_id, competition_entry_id, action, previous_values, new_values, correction_reason, actor_id)
  values (p_result_id, v_result.match_id, v_result.team_id, v_result.competition_entry_id, p_decision,
    jsonb_build_object('status', v_result.status), jsonb_build_object('status', p_decision), v_reason, v_user_id);
end;
$$;

create function public.publish_competition_match_results(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match public.matches%rowtype;
  v_assigned integer;
  v_verified integer;
  v_result public.match_results%rowtype;
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.competition_id is null or v_match.status <> 'completed' then
    raise exception using errcode = '23514', message = 'MATCH_MUST_BE_COMPLETED';
  end if;
  select (select count(*) from public.match_team_assignments a where a.match_id = p_match_id and a.entry_id is not null)
       + (select count(*) from public.match_participants p where p.match_id = p_match_id)
  into v_assigned;
  select count(*) into v_verified from public.match_results r
  where r.match_id = p_match_id and r.competition_entry_id is not null and r.status in ('verified', 'published');
  if v_assigned = 0 or v_assigned <> v_verified then
    raise exception using errcode = '23514', message = 'ALL_ASSIGNED_RESULTS_MUST_BE_VERIFIED';
  end if;
  for v_result in select * from public.match_results where match_id = p_match_id and competition_entry_id is not null and status = 'verified' for update loop
    update public.match_results set status = 'published', published_by = v_user_id, published_at = now() where id = v_result.id;
    insert into public.result_audit_logs (result_id, match_id, team_id, competition_entry_id, action, previous_values, new_values, actor_id)
    values (v_result.id, p_match_id, v_result.team_id, v_result.competition_entry_id, 'published',
      jsonb_build_object('status', 'verified'), jsonb_build_object('status', 'published'), v_user_id);
  end loop;
end;
$$;

create function public.correct_competition_match_result(
  p_result_id uuid,
  p_score jsonb,
  p_correction_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_result public.match_results%rowtype;
  v_match public.matches%rowtype;
  v_reason text := nullif(btrim(p_correction_reason), '');
  v_rank smallint;
  v_kills integer;
  v_placement numeric;
  v_kill numeric;
  v_points numeric;
  v_allow_shared boolean;
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'CORRECTION_REASON_REQUIRED';
  end if;
  select * into v_result from public.match_results
  where id = p_result_id and competition_entry_id is not null for update;
  if not found or v_result.status <> 'published' then
    raise exception using errcode = '23514', message = 'ONLY_PUBLISHED_RESULTS_CAN_BE_CORRECTED';
  end if;
  select * into v_match from public.matches where id = v_result.match_id for update;
  if not found or v_match.status <> 'completed' then
    raise exception using errcode = '23514', message = 'MATCH_MUST_BE_COMPLETED';
  end if;
  select calculated.placement_rank, calculated.total_kills, calculated.placement_points,
    calculated.kill_points, calculated.total_points
  into v_rank, v_kills, v_placement, v_kill, v_points
  from rs_internal.calculate_competition_score(v_match.competition_id, p_score) as calculated;
  select allow_shared_rank into v_allow_shared from public.competition_scoring_configs
  where competition_id = v_match.competition_id;
  if v_rank is not null and not v_allow_shared and exists (
    select 1 from public.match_results other_result
    where other_result.match_id = v_result.match_id
      and other_result.competition_entry_id <> v_result.competition_entry_id
      and other_result.placement_rank = v_rank and other_result.status <> 'disputed'
  ) then raise exception using errcode = '23505', message = 'DUPLICATE_PLACEMENT_RANK'; end if;

  update public.match_results set
    placement_rank = v_rank, total_kills = v_kills,
    placement_points = v_placement, kill_points = v_kill, total_points = v_points,
    score_points = v_points, score_payload = p_score, status = 'corrected',
    submitted_by = v_user_id, verified_by = null, verified_at = null,
    published_by = null, published_at = null
  where id = p_result_id;
  insert into public.result_audit_logs (
    result_id, match_id, team_id, competition_entry_id, action,
    previous_values, new_values, correction_reason, actor_id
  ) values (
    p_result_id, v_result.match_id, v_result.team_id, v_result.competition_entry_id, 'corrected',
    jsonb_build_object('score_payload', v_result.score_payload, 'score_points', v_result.score_points, 'status', v_result.status),
    jsonb_build_object('score_payload', p_score, 'score_points', v_points, 'status', 'corrected'),
    v_reason, v_user_id
  );
end;
$$;

create or replace function rs_internal.match_results_are_public(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches match
    join public.tournaments tournament on tournament.id = match.tournament_id
    where match.id = p_match_id and match.competition_id is null
      and match.status = 'completed' and tournament.publication_status = 'published'
      and exists (select 1 from public.match_team_assignments assignment where assignment.match_id = match.id)
      and not exists (
        select 1 from public.match_team_assignments assignment
        left join public.match_results result on result.match_id = assignment.match_id and result.registration_id = assignment.registration_id
        where assignment.match_id = match.id and (result.id is null or result.status <> 'published')
      )
  ) or exists (
    select 1 from public.matches match
    join public.competitions competition on competition.id = match.competition_id
    where match.id = p_match_id and match.status = 'completed'
      and competition.status in ('published', 'registration_closed', 'live', 'completed')
      and (
        select count(*) from (
          select assignment.entry_id from public.match_team_assignments assignment
          where assignment.match_id = match.id and assignment.entry_id is not null
          union all
          select participant.entry_id from public.match_participants participant where participant.match_id = match.id
        ) assigned
      ) > 0
      and not exists (
        select 1 from (
          select assignment.entry_id from public.match_team_assignments assignment
          where assignment.match_id = match.id and assignment.entry_id is not null
          union all
          select participant.entry_id from public.match_participants participant where participant.match_id = match.id
        ) assigned
        left join public.match_results result on result.match_id = match.id and result.competition_entry_id = assigned.entry_id
        where result.id is null or result.status <> 'published'
      )
  );
$$;

create or replace view public.match_results_public
with (security_barrier = true, security_invoker = false)
as
select result.id as result_id, result.match_id, match.match_number, match.round_name,
  match.scheduled_at, match.timezone, coalesce(tournament.id, competition.legacy_tournament_id) as tournament_id,
  coalesce(tournament.name, competition.title) as tournament_name,
  coalesce(tournament.slug, competition.slug) as tournament_slug,
  result.team_id,
  coalesce(team.name, case when profile.profile_visibility = 'public' then coalesce(profile.display_name, profile.full_name) else 'Participant' end) as team_name,
  result.placement_rank, result.total_kills, result.placement_points,
  result.kill_points, result.total_points, result.published_at,
  match.competition_id, result.competition_entry_id, format.participant_kind,
  result.score_payload, result.score_points
from public.match_results result
join public.matches match on match.id = result.match_id
left join public.tournaments tournament on tournament.id = match.tournament_id
left join public.competitions competition on competition.id = match.competition_id
left join public.teams team on team.id = result.team_id
left join public.competition_entries entry on entry.id = result.competition_entry_id
left join public.profiles profile on profile.id = entry.player_id
left join public.game_formats format on format.game_code = competition.game_code and format.format_code = competition.format_code
where result.status = 'published' and rs_internal.match_results_are_public(match.id);

grant select on public.match_results_public to anon, authenticated;

create view public.competition_leaderboard
with (security_barrier = true, security_invoker = false)
as
with totals as (
  select result.competition_id, competition.game_code, competition.format_code,
    result.competition_entry_id, entry.team_id, entry.player_id,
    coalesce(team.name, case when profile.profile_visibility = 'public' then coalesce(profile.display_name, profile.full_name) else 'Participant' end) as participant_name,
    count(distinct result.match_id) as matches_played,
    sum(result.score_points)::numeric(14,3) as total_points,
    count(*) filter (where result.score_payload ->> 'result' = 'win') as wins,
    sum(coalesce(result.total_kills, 0))::bigint as total_kills
  from public.match_results_public result
  join public.competitions competition on competition.id = result.competition_id
  join public.competition_entries entry on entry.id = result.competition_entry_id
  left join public.teams team on team.id = entry.team_id
  left join public.profiles profile on profile.id = entry.player_id
  where result.competition_id is not null
  group by result.competition_id, competition.game_code, competition.format_code,
    result.competition_entry_id, entry.team_id, entry.player_id, team.name,
    profile.profile_visibility, profile.display_name, profile.full_name
)
select totals.*,
  rank() over (partition by competition_id order by total_points desc, wins desc, total_kills desc, participant_name asc) as rank
from totals;

grant select on public.competition_leaderboard to anon, authenticated;

create or replace view public.global_leaderboard
with (security_invoker = true)
as
with totals as (
  select result.team_id, result.team_name,
    count(distinct result.tournament_id) as tournaments_played,
    count(distinct result.match_id) as matches_played,
    count(*) filter (where result.placement_rank = 1) as first_place_finishes,
    sum(result.total_kills)::bigint as total_kills,
    sum(result.placement_points)::numeric(14, 3) as placement_points,
    sum(result.kill_points)::numeric(14, 3) as kill_points,
    sum(result.total_points)::numeric(14, 3) as total_points,
    array_agg(distinct result.tournament_name order by result.tournament_name) as tournaments
  from public.match_results_public as result
  where result.competition_entry_id is null
  group by result.team_id, result.team_name
)
select totals.*,
  rank() over (order by total_points desc, first_place_finishes desc, total_kills desc, team_name asc) as rank
from totals;

grant select on public.global_leaderboard to anon, authenticated;

create policy "Competition staff can inspect unpublished competition results"
  on public.match_results for select to authenticated
  using (competition_entry_id is not null and rs_internal.has_competition_permission('manage_competitions'));

create policy "Competition staff can inspect competition result audit logs"
  on public.result_audit_logs for select to authenticated
  using (competition_entry_id is not null and rs_internal.has_competition_permission('manage_competitions'));

revoke all on function rs_internal.calculate_competition_score(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_competition_scoring_config(uuid, jsonb, boolean) from public, anon;
revoke all on function public.save_competition_match_result(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.submit_competition_match_result(uuid) from public, anon;
revoke all on function public.review_competition_match_result(uuid, text, text) from public, anon;
revoke all on function public.publish_competition_match_results(uuid) from public, anon;
revoke all on function public.correct_competition_match_result(uuid, jsonb, text) from public, anon;
grant execute on function public.set_competition_scoring_config(uuid, jsonb, boolean) to authenticated;
grant execute on function public.save_competition_match_result(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.submit_competition_match_result(uuid) to authenticated;
grant execute on function public.review_competition_match_result(uuid, text, text) to authenticated;
grant execute on function public.publish_competition_match_results(uuid) to authenticated;
grant execute on function public.correct_competition_match_result(uuid, jsonb, text) to authenticated;

commit;
