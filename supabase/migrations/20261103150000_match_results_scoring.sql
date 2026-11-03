begin;

alter table public.match_team_assignments
  add constraint match_team_assignments_match_registration_team_unique
  unique (match_id, registration_id, team_id);

create table public.tournament_scoring_configs (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  placement_points jsonb not null check (jsonb_typeof(placement_points) = 'object'),
  points_per_kill numeric(12, 3) not null check (points_per_kill >= 0 and points_per_kill < 'Infinity'::numeric),
  max_placement_rank smallint not null check (max_placement_rank between 1 and 256),
  placement_enabled boolean not null,
  kill_enabled boolean not null,
  tie_breakers text[] not null check (cardinality(tie_breakers) between 1 and 5),
  allow_shared_rank boolean not null default false,
  configured_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tie_breakers <@ array['total_points', 'first_place_finishes', 'total_kills', 'highest_placement', 'placement_points', 'kill_points', 'matches_played']::text[])
);

create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete restrict,
  registration_id uuid not null references public.tournament_registrations (id) on delete restrict,
  team_id uuid not null references public.teams (id) on delete restrict,
  placement_rank smallint not null check (placement_rank between 1 and 256),
  total_kills integer not null check (total_kills between 0 and 1000),
  placement_points numeric(12, 3) not null check (placement_points >= 0 and placement_points < 'Infinity'::numeric),
  kill_points numeric(12, 3) not null check (kill_points >= 0 and kill_points < 'Infinity'::numeric),
  total_points numeric(12, 3) not null check (total_points >= 0 and total_points < 'Infinity'::numeric),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'verified', 'published', 'disputed', 'corrected')),
  admin_notes text not null default '' check (char_length(admin_notes) <= 3000),
  created_by uuid not null references auth.users (id) on delete restrict,
  submitted_by uuid references auth.users (id) on delete restrict,
  verified_by uuid references auth.users (id) on delete restrict,
  verified_at timestamptz,
  published_by uuid references auth.users (id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, team_id),
  foreign key (match_id, registration_id, team_id)
    references public.match_team_assignments (match_id, registration_id, team_id) on delete restrict,
  check (status not in ('verified', 'published') or (verified_by is not null and verified_at is not null)),
  check (status <> 'published' or (published_by is not null and published_at is not null))
);

create index match_results_match_status_idx
  on public.match_results (match_id, status, placement_rank);

create index match_results_team_status_idx
  on public.match_results (team_id, status, created_at desc);

create index match_results_tournament_public_idx
  on public.match_results (status, match_id, team_id);

create table public.result_audit_logs (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.match_results (id) on delete restrict,
  match_id uuid not null references public.matches (id) on delete restrict,
  team_id uuid not null references public.teams (id) on delete restrict,
  action text not null check (action in ('draft_saved', 'submitted', 'verified', 'disputed', 'published', 'corrected')),
  previous_values jsonb,
  new_values jsonb not null check (jsonb_typeof(new_values) = 'object'),
  correction_reason text check (correction_reason is null or char_length(correction_reason) <= 2000),
  actor_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index result_audit_logs_result_idx
  on public.result_audit_logs (result_id, created_at desc);

alter table public.tournament_scoring_configs enable row level security;
alter table public.match_results enable row level security;
alter table public.result_audit_logs enable row level security;

revoke all on table public.tournament_scoring_configs, public.match_results, public.result_audit_logs
  from public, anon, authenticated;
grant select on table public.tournament_scoring_configs, public.match_results to anon, authenticated;
grant select on table public.result_audit_logs to authenticated;

create policy "Published tournament scoring rules are public"
  on public.tournament_scoring_configs
  for select
  to anon, authenticated
  using (exists (
    select 1 from public.tournaments as tournament
    where tournament.id = tournament_id and tournament.publication_status = 'published'
  ) or rs_internal.is_tournament_admin());

create function rs_internal.match_results_are_public(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.matches as match
    join public.tournaments as tournament on tournament.id = match.tournament_id
    where match.id = p_match_id
      and match.status = 'completed'
      and tournament.publication_status = 'published'
      and exists (select 1 from public.match_team_assignments as assignment where assignment.match_id = match.id)
      and not exists (
        select 1
        from public.match_team_assignments as assignment
        left join public.match_results as result
          on result.match_id = assignment.match_id and result.registration_id = assignment.registration_id
        where assignment.match_id = match.id
          and (result.id is null or result.status <> 'published')
      )
  );
$$;

revoke all on function rs_internal.match_results_are_public(uuid) from public;
grant execute on function rs_internal.match_results_are_public(uuid) to anon, authenticated;

create policy "Public can view only fully published match results"
  on public.match_results
  for select
  to anon, authenticated
  using (rs_internal.match_results_are_public(match_id));

create policy "Admins can inspect unpublished match results"
  on public.match_results
  for select
  to authenticated
  using (rs_internal.is_tournament_admin());

create policy "Admins can inspect result audit history"
  on public.result_audit_logs
  for select
  to authenticated
  using (rs_internal.is_tournament_admin());

create function public.set_result_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_match_results_updated_at
  before update on public.match_results
  for each row execute function public.set_result_updated_at();

create trigger set_tournament_scoring_configs_updated_at
  before update on public.tournament_scoring_configs
  for each row execute function public.set_result_updated_at();

revoke all on function public.set_result_updated_at() from public, anon, authenticated;

create function rs_internal.calculate_match_points(
  p_tournament_id uuid,
  p_placement_rank smallint,
  p_total_kills integer
)
returns table (placement_points numeric, kill_points numeric, total_points numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_config public.tournament_scoring_configs%rowtype;
  v_placement numeric(12, 3) := 0;
  v_kill numeric(12, 3) := 0;
begin
  select * into v_config
  from public.tournament_scoring_configs as config
  where config.tournament_id = p_tournament_id;
  if not found then
    raise exception using errcode = '23514', message = 'SCORING_NOT_CONFIGURED';
  end if;
  if p_placement_rank is null or p_placement_rank < 1 or p_placement_rank > v_config.max_placement_rank then
    raise exception using errcode = '22023', message = 'INVALID_PLACEMENT_RANK';
  end if;
  if p_total_kills is null or p_total_kills < 0 or p_total_kills > 1000 then
    raise exception using errcode = '22023', message = 'INVALID_KILL_COUNT';
  end if;

  if v_config.placement_enabled then
    v_placement := coalesce(nullif(v_config.placement_points ->> p_placement_rank::text, '')::numeric, 0);
  end if;
  if v_config.kill_enabled then
    v_kill := p_total_kills * v_config.points_per_kill;
  end if;

  return query select v_placement, v_kill, v_placement + v_kill;
end;
$$;

revoke all on function rs_internal.calculate_match_points(uuid, smallint, integer) from public;

create function public.set_tournament_scoring_config(
  p_tournament_id uuid,
  p_placement_points jsonb,
  p_points_per_kill numeric,
  p_max_placement_rank smallint,
  p_placement_enabled boolean,
  p_kill_enabled boolean,
  p_tie_breakers text[],
  p_allow_shared_rank boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_points jsonb;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  perform 1 from public.tournaments where id = p_tournament_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.matches as match
    join public.match_results as result on result.match_id = match.id
    where match.tournament_id = p_tournament_id
  ) then
    raise exception using errcode = '23514', message = 'SCORING_LOCKED_AFTER_RESULTS';
  end if;
  if jsonb_typeof(p_placement_points) <> 'object'
    or p_points_per_kill is null or p_points_per_kill < 0
    or p_max_placement_rank not between 1 and 256
    or p_placement_enabled is null or p_kill_enabled is null
    or p_tie_breakers is null or cardinality(p_tie_breakers) < 1
    or p_allow_shared_rank is null then
    raise exception using errcode = '22023', message = 'INVALID_SCORING_CONFIGURATION';
  end if;
  if exists (
    select 1 from unnest(p_tie_breakers) as item
    where item not in ('total_points', 'first_place_finishes', 'total_kills', 'highest_placement', 'placement_points', 'kill_points', 'matches_played')
  ) or cardinality(p_tie_breakers) <> cardinality(array(select distinct item from unnest(p_tie_breakers) as item)) then
    raise exception using errcode = '22023', message = 'INVALID_TIE_BREAKER_CONFIGURATION';
  end if;

  for v_key, v_points in select key, value from jsonb_each(p_placement_points)
  loop
    if v_key !~ '^[1-9][0-9]{0,2}$' or v_key::integer > p_max_placement_rank
      or jsonb_typeof(v_points) <> 'number' or v_points::text::numeric < 0 then
      raise exception using errcode = '22023', message = 'INVALID_PLACEMENT_POINTS';
    end if;
  end loop;

  insert into public.tournament_scoring_configs (
    tournament_id, placement_points, points_per_kill, max_placement_rank,
    placement_enabled, kill_enabled, tie_breakers, allow_shared_rank, configured_by
  ) values (
    p_tournament_id, p_placement_points, p_points_per_kill, p_max_placement_rank,
    p_placement_enabled, p_kill_enabled, p_tie_breakers, p_allow_shared_rank, (select auth.uid())
  ) on conflict (tournament_id) do update set
    placement_points = excluded.placement_points,
    points_per_kill = excluded.points_per_kill,
    max_placement_rank = excluded.max_placement_rank,
    placement_enabled = excluded.placement_enabled,
    kill_enabled = excluded.kill_enabled,
    tie_breakers = excluded.tie_breakers,
    allow_shared_rank = excluded.allow_shared_rank,
    configured_by = excluded.configured_by;
end;
$$;

create function public.save_match_result_draft(
  p_match_id uuid,
  p_registration_id uuid,
  p_placement_rank smallint,
  p_total_kills integer,
  p_admin_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_assignment public.match_team_assignments%rowtype;
  v_result public.match_results%rowtype;
  v_result_id uuid := gen_random_uuid();
  v_placement_points numeric(12, 3);
  v_kill_points numeric(12, 3);
  v_total_points numeric(12, 3);
  v_allow_ties boolean;
  v_result_exists boolean;
  v_tournament_id uuid;
  v_user_id uuid := (select auth.uid());
  v_previous jsonb;
  v_new jsonb;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  select tournament_id into v_tournament_id from public.matches where id = p_match_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'MATCH_NOT_FOUND';
  end if;
  perform 1 from public.tournaments where id = v_tournament_id for share;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.status = 'cancelled' then
    raise exception using errcode = '23514', message = 'MATCH_NOT_ELIGIBLE_FOR_RESULTS';
  end if;
  select assignment.* into v_assignment from public.match_team_assignments as assignment
  join public.tournament_registrations as registration on registration.id = assignment.registration_id
  where assignment.match_id = p_match_id and assignment.registration_id = p_registration_id
    and registration.status = 'approved'
  for update of registration;
  if not found then
    raise exception using errcode = '23514', message = 'APPROVED_MATCH_ASSIGNMENT_REQUIRED';
  end if;

  select config.allow_shared_rank into v_allow_ties
  from public.tournament_scoring_configs as config
  where config.tournament_id = v_match.tournament_id;
  if not found then
    raise exception using errcode = '23514', message = 'SCORING_NOT_CONFIGURED';
  end if;
  select calculated.placement_points, calculated.kill_points, calculated.total_points
  into v_placement_points, v_kill_points, v_total_points
  from rs_internal.calculate_match_points(v_match.tournament_id, p_placement_rank, p_total_kills) as calculated;

  if not v_allow_ties and exists (
    select 1 from public.match_results as result
    where result.match_id = p_match_id
      and result.registration_id <> p_registration_id
      and result.placement_rank = p_placement_rank
      and result.status <> 'disputed'
  ) then
    raise exception using errcode = '23505', message = 'DUPLICATE_PLACEMENT_RANK';
  end if;
  if char_length(coalesce(p_admin_notes, '')) > 3000 then
    raise exception using errcode = '22023', message = 'RESULT_NOTES_TOO_LONG';
  end if;

  select * into v_result from public.match_results as result
  where result.match_id = p_match_id and result.team_id = v_assignment.team_id
  for update;
  v_result_exists := found;

  v_new := jsonb_build_object(
    'placement_rank', p_placement_rank, 'total_kills', p_total_kills,
    'placement_points', v_placement_points, 'kill_points', v_kill_points,
    'total_points', v_total_points, 'admin_notes', coalesce(p_admin_notes, '')
  );

  if v_result_exists then
    if v_result.status not in ('draft', 'disputed') then
      raise exception using errcode = '23514', message = 'RESULT_NOT_EDITABLE';
    end if;
    v_result_id := v_result.id;
    v_previous := jsonb_build_object(
      'placement_rank', v_result.placement_rank, 'total_kills', v_result.total_kills,
      'placement_points', v_result.placement_points, 'kill_points', v_result.kill_points,
      'total_points', v_result.total_points, 'status', v_result.status, 'admin_notes', v_result.admin_notes
    );
    update public.match_results set
      placement_rank = p_placement_rank,
      total_kills = p_total_kills,
      placement_points = v_placement_points,
      kill_points = v_kill_points,
      total_points = v_total_points,
      admin_notes = coalesce(p_admin_notes, ''),
      status = 'draft',
      submitted_by = null,
      verified_by = null,
      verified_at = null,
      published_by = null,
      published_at = null
    where id = v_result_id;
  else
    insert into public.match_results (
      id, match_id, registration_id, team_id, placement_rank, total_kills,
      placement_points, kill_points, total_points, admin_notes, created_by
    ) values (
      v_result_id, p_match_id, p_registration_id, v_assignment.team_id, p_placement_rank, p_total_kills,
      v_placement_points, v_kill_points, v_total_points, coalesce(p_admin_notes, ''), v_user_id
    );
  end if;

  insert into public.result_audit_logs (
    result_id, match_id, team_id, action, previous_values, new_values, actor_id
  ) values (v_result_id, p_match_id, v_assignment.team_id, 'draft_saved', v_previous, v_new, v_user_id);
  return v_result_id;
end;
$$;

create function public.submit_match_result(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.match_results%rowtype;
  v_match_id uuid;
  v_match_status text;
  v_user_id uuid := (select auth.uid());
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  select match_id into v_match_id from public.match_results where id = p_result_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESULT_NOT_FOUND';
  end if;
  select status into v_match_status from public.matches where id = v_match_id for update;
  if not found or v_match_status <> 'completed' then
    raise exception using errcode = '23514', message = 'MATCH_MUST_BE_COMPLETED';
  end if;
  select * into v_result from public.match_results where id = p_result_id for update;
  if not found or v_result.status not in ('draft', 'corrected') then
    raise exception using errcode = '23514', message = 'RESULT_NOT_SUBMITTABLE';
  end if;

  update public.match_results set status = 'submitted', submitted_by = v_user_id
  where id = p_result_id;
  insert into public.result_audit_logs (result_id, match_id, team_id, action, previous_values, new_values, actor_id)
  values (
    p_result_id, v_result.match_id, v_result.team_id, 'submitted',
    jsonb_build_object('status', v_result.status), jsonb_build_object('status', 'submitted'), v_user_id
  );
end;
$$;

create function public.review_match_result(p_result_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.match_results%rowtype;
  v_match_id uuid;
  v_match_status text;
  v_user_id uuid := (select auth.uid());
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if p_decision is null or p_decision not in ('verified', 'disputed') then
    raise exception using errcode = '22023', message = 'INVALID_RESULT_DECISION';
  end if;
  if p_decision = 'disputed' and (v_reason is null or char_length(v_reason) > 2000) then
    raise exception using errcode = '22023', message = 'DISPUTE_REASON_REQUIRED';
  end if;
  select match_id into v_match_id from public.match_results where id = p_result_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESULT_NOT_FOUND';
  end if;
  select status into v_match_status from public.matches where id = v_match_id for update;
  if not found or v_match_status <> 'completed' then
    raise exception using errcode = '23514', message = 'MATCH_MUST_BE_COMPLETED';
  end if;
  select * into v_result from public.match_results where id = p_result_id for update;
  if not found or v_result.status <> 'submitted' then
    raise exception using errcode = '23514', message = 'RESULT_NOT_REVIEWABLE';
  end if;
  if v_result.submitted_by = v_user_id then
    raise exception using errcode = '42501', message = 'SELF_APPROVAL_FORBIDDEN';
  end if;
  update public.match_results set status = p_decision,
    verified_by = case when p_decision = 'verified' then v_user_id else null end,
    verified_at = case when p_decision = 'verified' then now() else null end
  where id = p_result_id;
  insert into public.result_audit_logs (result_id, match_id, team_id, action, previous_values, new_values, correction_reason, actor_id)
  values (
    p_result_id, v_result.match_id, v_result.team_id, p_decision, jsonb_build_object('status', v_result.status),
    jsonb_build_object('status', p_decision), v_reason, v_user_id
  );
end;
$$;

create function public.correct_published_match_result(
  p_result_id uuid,
  p_placement_rank smallint,
  p_total_kills integer,
  p_admin_notes text,
  p_correction_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result public.match_results%rowtype;
  v_match_id uuid;
  v_match public.matches%rowtype;
  v_allow_ties boolean;
  v_placement_points numeric(12, 3);
  v_kill_points numeric(12, 3);
  v_total_points numeric(12, 3);
  v_reason text := nullif(btrim(p_correction_reason), '');
  v_user_id uuid := (select auth.uid());
  v_new jsonb;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'CORRECTION_REASON_REQUIRED';
  end if;
  select match_id into v_match_id from public.match_results where id = p_result_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESULT_NOT_FOUND';
  end if;
  select * into v_match from public.matches where id = v_match_id for update;
  if not found or v_match.status <> 'completed' then
    raise exception using errcode = '23514', message = 'MATCH_MUST_BE_COMPLETED';
  end if;
  select * into v_result from public.match_results where id = p_result_id for update;
  if not found or v_result.status <> 'published' then
    raise exception using errcode = '23514', message = 'ONLY_PUBLISHED_RESULTS_CAN_BE_CORRECTED';
  end if;
  select config.allow_shared_rank into v_allow_ties
  from public.tournament_scoring_configs as config
  where config.tournament_id = v_match.tournament_id;
  select calculated.placement_points, calculated.kill_points, calculated.total_points
  into v_placement_points, v_kill_points, v_total_points
  from rs_internal.calculate_match_points(v_match.tournament_id, p_placement_rank, p_total_kills) as calculated;
  if not v_allow_ties and exists (
    select 1 from public.match_results as result
    where result.match_id = v_result.match_id and result.id <> p_result_id
      and result.placement_rank = p_placement_rank and result.status <> 'disputed'
  ) then
    raise exception using errcode = '23505', message = 'DUPLICATE_PLACEMENT_RANK';
  end if;
  if char_length(coalesce(p_admin_notes, '')) > 3000 then
    raise exception using errcode = '22023', message = 'RESULT_NOTES_TOO_LONG';
  end if;

  v_new := jsonb_build_object(
    'placement_rank', p_placement_rank, 'total_kills', p_total_kills,
    'placement_points', v_placement_points, 'kill_points', v_kill_points,
    'total_points', v_total_points, 'admin_notes', coalesce(p_admin_notes, ''), 'status', 'corrected'
  );
  update public.match_results set
    placement_rank = p_placement_rank,
    total_kills = p_total_kills,
    placement_points = v_placement_points,
    kill_points = v_kill_points,
    total_points = v_total_points,
    admin_notes = coalesce(p_admin_notes, ''),
    status = 'corrected',
    submitted_by = v_user_id,
    verified_by = null,
    verified_at = null,
    published_by = null,
    published_at = null
  where id = p_result_id;
  insert into public.result_audit_logs (
    result_id, match_id, team_id, action, previous_values, new_values, correction_reason, actor_id
  ) values (
    p_result_id, v_result.match_id, v_result.team_id, 'corrected',
    jsonb_build_object(
      'placement_rank', v_result.placement_rank, 'total_kills', v_result.total_kills,
      'placement_points', v_result.placement_points, 'kill_points', v_result.kill_points,
      'total_points', v_result.total_points, 'admin_notes', v_result.admin_notes, 'status', v_result.status
    ), v_new, v_reason, v_user_id
  );
end;
$$;

create function public.publish_match_results(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_user_id uuid := (select auth.uid());
  v_assigned_count integer;
  v_verified_count integer;
  v_shared_rank boolean;
  v_result record;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.status <> 'completed' then
    raise exception using errcode = '23514', message = 'MATCH_MUST_BE_COMPLETED';
  end if;
  select count(*) into v_assigned_count from public.match_team_assignments where match_id = p_match_id;
  select count(*) into v_verified_count from public.match_results
  where match_id = p_match_id and status in ('verified', 'published');
  if v_assigned_count = 0 or v_assigned_count <> v_verified_count then
    raise exception using errcode = '23514', message = 'ALL_ASSIGNED_RESULTS_MUST_BE_VERIFIED';
  end if;
  select config.allow_shared_rank into v_shared_rank
  from public.tournament_scoring_configs as config where config.tournament_id = v_match.tournament_id;
  if not found then
    raise exception using errcode = '23514', message = 'SCORING_NOT_CONFIGURED';
  end if;
  if not v_shared_rank and exists (
    select 1 from public.match_results as result
    where result.match_id = p_match_id and result.status in ('verified', 'published')
    group by result.placement_rank having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'DUPLICATE_PLACEMENT_RANK';
  end if;

  for v_result in select * from public.match_results
    where match_id = p_match_id and status = 'verified' for update
  loop
    update public.match_results set status = 'published', published_by = v_user_id, published_at = now()
    where id = v_result.id;
    insert into public.result_audit_logs (
      result_id, match_id, team_id, action, previous_values, new_values, actor_id
    ) values (
      v_result.id, p_match_id, v_result.team_id, 'published',
      jsonb_build_object('status', 'verified'), jsonb_build_object('status', 'published'), v_user_id
    );
  end loop;
end;
$$;

create view public.match_results_public
with (security_invoker = true)
as
select result.id as result_id, result.match_id, match.match_number, match.round_name,
  match.scheduled_at, match.timezone, tournament.id as tournament_id,
  tournament.name as tournament_name, tournament.slug as tournament_slug,
  team.id as team_id, team.name as team_name,
  result.placement_rank, result.total_kills, result.placement_points,
  result.kill_points, result.total_points, result.published_at
from public.match_results as result
join public.matches as match on match.id = result.match_id
join public.tournaments as tournament on tournament.id = match.tournament_id
join public.teams as team on team.id = result.team_id
where result.status = 'published'
  and rs_internal.match_results_are_public(match.id);

grant select on public.match_results_public to anon, authenticated;

create view public.tournament_leaderboard
with (security_invoker = true)
as
with totals as (
  select result.tournament_id, result.tournament_name, result.tournament_slug,
    result.team_id, result.team_name,
    count(distinct result.match_id) as matches_played,
    count(*) filter (where result.placement_rank = 1) as first_place_finishes,
    sum(result.total_kills)::bigint as total_kills,
    sum(result.placement_points)::numeric(14, 3) as placement_points,
    sum(result.kill_points)::numeric(14, 3) as kill_points,
    sum(result.total_points)::numeric(14, 3) as total_points,
    min(result.placement_rank) as highest_placement
  from public.match_results_public as result
  group by result.tournament_id, result.tournament_name, result.tournament_slug, result.team_id, result.team_name
), ranked_values as (
  select totals.*,
    config.allow_shared_rank,
    array(
      select case tie_breaker.key
        when 'total_points' then totals.total_points
        when 'first_place_finishes' then totals.first_place_finishes::numeric
        when 'total_kills' then totals.total_kills::numeric
        when 'highest_placement' then -totals.highest_placement::numeric
        when 'placement_points' then totals.placement_points
        when 'kill_points' then totals.kill_points
        when 'matches_played' then totals.matches_played::numeric
      end
      from unnest(config.tie_breakers) with ordinality as tie_breaker(key, sort_order)
      order by tie_breaker.sort_order
    ) as tie_break_key
  from totals
  join public.tournament_scoring_configs as config on config.tournament_id = totals.tournament_id
)
select ranked_values.*,
  rank() over (
    partition by tournament_id
    order by tie_break_key desc,
      case when allow_shared_rank then null else team_id::text end asc
  ) as rank
from ranked_values;

grant select on public.tournament_leaderboard to anon, authenticated;

create view public.global_leaderboard
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
  group by result.team_id, result.team_name
)
select totals.*,
  rank() over (order by total_points desc, first_place_finishes desc, total_kills desc, team_name asc) as rank
from totals;

grant select on public.global_leaderboard to anon, authenticated;

create view public.team_results_public
with (security_invoker = true)
as
select result.* from public.match_results_public as result;

grant select on public.team_results_public to authenticated;

revoke all on function rs_internal.calculate_match_points(uuid, smallint, integer) from public, anon, authenticated;
revoke all on function public.set_tournament_scoring_config(uuid, jsonb, numeric, smallint, boolean, boolean, text[], boolean) from public, anon;
revoke all on function public.save_match_result_draft(uuid, uuid, smallint, integer, text) from public, anon;
revoke all on function public.submit_match_result(uuid) from public, anon;
revoke all on function public.review_match_result(uuid, text, text) from public, anon;
revoke all on function public.correct_published_match_result(uuid, smallint, integer, text, text) from public, anon;
revoke all on function public.publish_match_results(uuid) from public, anon;
grant execute on function public.set_tournament_scoring_config(uuid, jsonb, numeric, smallint, boolean, boolean, text[], boolean) to authenticated;
grant execute on function public.save_match_result_draft(uuid, uuid, smallint, integer, text) to authenticated;
grant execute on function public.submit_match_result(uuid) to authenticated;
grant execute on function public.review_match_result(uuid, text, text) to authenticated;
grant execute on function public.correct_published_match_result(uuid, smallint, integer, text, text) to authenticated;
grant execute on function public.publish_match_results(uuid) to authenticated;

commit;