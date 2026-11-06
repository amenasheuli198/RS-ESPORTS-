begin;

create table public.games (
  game_code text primary key check (game_code ~ '^[a-z0-9_]{2,40}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.game_formats (
  game_code text not null references public.games (game_code) on delete restrict,
  format_code text not null check (format_code ~ '^[a-z0-9_]{2,60}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 100),
  participant_kind text not null check (participant_kind in ('team', 'individual')),
  min_team_size smallint not null default 1 check (min_team_size between 1 and 32),
  max_team_size smallint not null default 1 check (max_team_size between min_team_size and 32),
  max_substitutes smallint not null default 0 check (max_substitutes between 0 and 16),
  scoring_code text not null check (scoring_code in ('battle_royale', 'chess_points')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (game_code, format_code)
);

insert into public.games (game_code, display_name) values
  ('free_fire', 'Garena Free Fire'), ('pubg', 'PUBG'), ('chess', 'Chess')
on conflict (game_code) do nothing;

insert into public.game_formats (
  game_code, format_code, display_name, participant_kind,
  min_team_size, max_team_size, max_substitutes, scoring_code
) values
  ('free_fire', 'squad', 'Battle Royale Squad', 'team', 4, 4, 1, 'battle_royale'),
  ('pubg', 'squad', 'Squad', 'team', 1, 4, 1, 'battle_royale'),
  ('pubg', 'duo', 'Duo', 'team', 2, 2, 0, 'battle_royale'),
  ('pubg', 'solo', 'Solo', 'individual', 1, 1, 0, 'battle_royale'),
  ('chess', 'rapid_individual', 'Rapid Individual', 'individual', 1, 1, 0, 'chess_points'),
  ('chess', 'blitz_individual', 'Blitz Individual', 'individual', 1, 1, 0, 'chess_points'),
  ('chess', 'swiss_individual', 'Swiss Individual', 'individual', 1, 1, 0, 'chess_points')
on conflict (game_code, format_code) do nothing;

alter table public.team_members
  alter column free_fire_uid drop not null,
  drop constraint if exists team_members_slot_check,
  add constraint team_members_slot_check check (
    (role = 'captain' and slot = 1)
    or (role = 'starting_player' and slot between 2 and 32)
    or (role = 'substitute' and slot between 5 and 48)
  );

create table public.player_game_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_code text not null references public.games (game_code) on delete restrict,
  in_game_name text not null check (char_length(btrim(in_game_name)) between 2 and 64),
  external_id text check (external_id is null or char_length(btrim(external_id)) between 2 and 80),
  rating_value numeric(10, 2) check (rating_value is null or rating_value >= 0),
  rating_source text check (rating_source is null or char_length(rating_source) <= 80),
  updated_at timestamptz not null default now(),
  unique (user_id, game_code)
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  competition_type text not null check (competition_type in ('quick_match', 'tournament')),
  legacy_tournament_id uuid unique references public.tournaments (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 140),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  description text not null default '' check (char_length(description) <= 5000),
  game_code text not null,
  format_code text not null,
  entry_type text not null default 'free' check (entry_type in ('free', 'paid')),
  entry_fee numeric(12, 2) not null default 0 check (entry_fee >= 0 and entry_fee < 'Infinity'::numeric),
  currency text not null default 'BDT' check (currency ~ '^[A-Z]{3}$'),
  payment_provider text not null default 'bkash' check (payment_provider = 'bkash'),
  payment_account text not null default '01845278579' check (payment_account ~ '^[0-9]{11}$'),
  capacity integer not null check (capacity between 1 and 10000),
  min_team_size smallint not null default 1 check (min_team_size between 1 and 32),
  max_team_size smallint not null default 1 check (max_team_size between min_team_size and 32),
  max_substitutes smallint not null default 0 check (max_substitutes between 0 and 16),
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'UTC',
  status text not null default 'draft' check (status in ('draft', 'published', 'registration_closed', 'live', 'completed', 'cancelled')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_type, slug),
  foreign key (game_code, format_code) references public.game_formats (game_code, format_code) on delete restrict,
  check (registration_opens_at < registration_closes_at),
  check (registration_closes_at < starts_at),
  check (ends_at is null or starts_at < ends_at),
  check ((entry_type = 'free' and entry_fee = 0) or (entry_type = 'paid' and entry_fee > 0))
);

create index competitions_public_schedule_idx on public.competitions (status, starts_at);
create index competitions_game_format_idx on public.competitions (game_code, format_code, starts_at);

create table public.competition_stages (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  stage_order smallint not null check (stage_order between 1 and 64),
  stage_name text not null check (char_length(btrim(stage_name)) between 2 and 100),
  stage_type text not null check (stage_type in ('group', 'qualifier', 'round', 'quarterfinal', 'semifinal', 'final', 'custom')),
  qualification_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(qualification_rules) = 'object'),
  created_at timestamptz not null default now(),
  unique (competition_id, stage_order),
  unique (id, competition_id)
);

create table public.competition_rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  stage_id uuid not null,
  round_order smallint not null check (round_order between 1 and 256),
  round_name text not null check (char_length(btrim(round_name)) between 1 and 100),
  scheduled_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  advancement_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(advancement_rules) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (stage_id, competition_id) references public.competition_stages (id, competition_id) on delete cascade,
  unique (stage_id, round_order),
  unique (id, competition_id)
);

create table public.competition_entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete restrict,
  team_id uuid references public.teams (id) on delete restrict,
  player_id uuid references auth.users (id) on delete restrict,
  registered_by uuid not null references auth.users (id) on delete restrict,
  status text not null check (status in ('pending_payment', 'payment_rejected', 'pending_review', 'confirmed', 'rejected', 'withdrawn', 'disqualified')),
  registered_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(btrim(rejection_reason)) between 1 and 2000),
  check ((team_id is not null and player_id is null) or (team_id is null and player_id is not null)),
  check (status not in ('rejected', 'disqualified') or rejection_reason is not null)
);

create unique index competition_entries_active_team_unique
  on public.competition_entries (competition_id, team_id)
  where team_id is not null and status in ('pending_payment', 'payment_rejected', 'pending_review', 'confirmed');
create unique index competition_entries_active_player_unique
  on public.competition_entries (competition_id, player_id)
  where player_id is not null and status in ('pending_payment', 'payment_rejected', 'pending_review', 'confirmed');
create index competition_entries_owner_idx on public.competition_entries (registered_by, registered_at desc);

create table public.competition_entry_members (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.competition_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  role_snapshot text not null check (role_snapshot in ('captain', 'starting_player', 'substitute')),
  slot smallint not null check (slot between 1 and 48),
  in_game_name_snapshot text not null check (char_length(btrim(in_game_name_snapshot)) between 2 and 64),
  external_id_snapshot text check (external_id_snapshot is null or char_length(external_id_snapshot) <= 80),
  captured_at timestamptz not null default now(),
  unique (entry_id, user_id),
  unique (entry_id, slot)
);

create table public.competition_registration_events (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.competition_entries (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid not null references auth.users (id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 2000),
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (char_length(btrim(action)) between 2 and 120),
  entity_type text not null check (char_length(btrim(entity_type)) between 2 and 80),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index admin_audit_log_entity_idx on public.admin_audit_log (entity_type, entity_id, created_at desc);

insert into public.competitions (
  competition_type, legacy_tournament_id, title, slug, description, game_code, format_code,
  entry_type, entry_fee, currency, capacity, min_team_size, max_team_size, max_substitutes,
  registration_opens_at, registration_closes_at, starts_at, ends_at, timezone, status, created_by, created_at, updated_at
)
select
  'tournament', tournament.id, tournament.name, tournament.slug, tournament.description,
  tournament.game_code, tournament.format_code, tournament.entry_type, tournament.entry_fee,
  'USD', tournament.max_teams, tournament.starting_players_required,
  greatest(tournament.starting_players_required, game_format.max_team_size),
  case when tournament.substitute_allowed then 1 else 0 end,
  tournament.registration_opens_at, tournament.registration_closes_at, tournament.starts_at,
  tournament.ends_at, tournament.timezone,
  case
    when tournament.publication_status = 'cancelled' then 'cancelled'
    when tournament.publication_status = 'published' and tournament.lifecycle_status = 'completed' then 'completed'
    when tournament.publication_status = 'published' and tournament.lifecycle_status = 'live' then 'live'
    when tournament.publication_status = 'published' then 'published'
    else 'draft'
  end,
  tournament.created_by, tournament.created_at, tournament.updated_at
from public.tournaments as tournament
join public.game_formats as game_format
  on game_format.game_code = tournament.game_code and game_format.format_code = tournament.format_code
where not exists (
  select 1 from public.competitions as competition
  where competition.legacy_tournament_id = tournament.id
);

create function rs_internal.has_competition_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case auth.jwt() -> 'app_metadata' ->> 'role'
    when 'super_admin' then true
    when 'admin' then true
    when 'competition_manager' then p_permission = 'manage_competitions'
    when 'payment_reviewer' then p_permission = 'review_payments'
    when 'moderator' then p_permission = 'moderate'
    when 'support_agent' then p_permission = 'manage_support'
    else false
  end;
$$;

create or replace function rs_internal.is_tournament_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'super_admin'), false);
$$;

revoke all on function rs_internal.is_tournament_admin() from public, anon;
grant execute on function rs_internal.is_tournament_admin() to authenticated;

revoke all on function rs_internal.has_competition_permission(text) from public, anon;
grant execute on function rs_internal.has_competition_permission(text) to anon, authenticated;

create function public.sync_legacy_tournament_competition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_format public.game_formats%rowtype;
begin
  select * into v_format from public.game_formats
  where game_code = new.game_code and format_code = new.format_code and is_active = true;
  if not found then return new; end if;
  insert into public.competitions (
    competition_type, legacy_tournament_id, title, slug, description,
    game_code, format_code, entry_type, entry_fee, currency, capacity,
    min_team_size, max_team_size, max_substitutes, registration_opens_at,
    registration_closes_at, starts_at, ends_at, timezone, status, created_by, created_at, updated_at
  ) values (
    'tournament', new.id, new.name, new.slug, new.description,
    new.game_code, new.format_code, new.entry_type, new.entry_fee, 'USD', new.max_teams,
    new.starting_players_required, greatest(new.starting_players_required, v_format.max_team_size),
    case when new.substitute_allowed then 1 else 0 end, new.registration_opens_at,
    new.registration_closes_at, new.starts_at, new.ends_at, new.timezone,
    case
      when new.publication_status = 'cancelled' then 'cancelled'
      when new.publication_status = 'published' and new.lifecycle_status = 'completed' then 'completed'
      when new.publication_status = 'published' and new.lifecycle_status = 'live' then 'live'
      when new.publication_status = 'published' then 'published'
      else 'draft'
    end,
    new.created_by, new.created_at, new.updated_at
  ) on conflict (legacy_tournament_id) do update set
    title = excluded.title, slug = excluded.slug, description = excluded.description,
    game_code = excluded.game_code, format_code = excluded.format_code,
    entry_type = excluded.entry_type, entry_fee = excluded.entry_fee, capacity = excluded.capacity,
    min_team_size = excluded.min_team_size, max_team_size = excluded.max_team_size,
    max_substitutes = excluded.max_substitutes, registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at, starts_at = excluded.starts_at,
    ends_at = excluded.ends_at, timezone = excluded.timezone, status = excluded.status, updated_at = now();
  return new;
end;
$$;
revoke all on function public.sync_legacy_tournament_competition() from public, anon, authenticated;

create trigger sync_tournament_to_competition
  after insert or update of name, slug, description, game_code, format_code, entry_type, entry_fee,
    max_teams, starting_players_required, substitute_allowed, registration_opens_at,
    registration_closes_at, starts_at, ends_at, timezone, publication_status, lifecycle_status
  on public.tournaments for each row execute function public.sync_legacy_tournament_competition();

create function public.create_competition(p_competition jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid := gen_random_uuid();
  v_type text := coalesce(p_competition ->> 'competition_type', 'quick_match');
  v_title text := btrim(coalesce(p_competition ->> 'title', ''));
  v_slug text := lower(btrim(coalesce(p_competition ->> 'slug', '')));
  v_game_code text := lower(btrim(coalesce(p_competition ->> 'game_code', '')));
  v_format_code text := lower(btrim(coalesce(p_competition ->> 'format_code', '')));
  v_entry_type text := coalesce(p_competition ->> 'entry_type', 'free');
  v_fee numeric(12,2) := coalesce(nullif(p_competition ->> 'entry_fee', '')::numeric, 0);
  v_capacity integer := coalesce(nullif(p_competition ->> 'capacity', '')::integer, 48);
  v_opens timestamptz := nullif(p_competition ->> 'registration_opens_at', '')::timestamptz;
  v_closes timestamptz := nullif(p_competition ->> 'registration_closes_at', '')::timestamptz;
  v_starts timestamptz := nullif(p_competition ->> 'starts_at', '')::timestamptz;
  v_ends timestamptz := nullif(p_competition ->> 'ends_at', '')::timestamptz;
  v_format public.game_formats%rowtype;
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if v_user_id is null or p_competition is null or jsonb_typeof(p_competition) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_COMPETITION_PAYLOAD';
  end if;
  if v_type not in ('quick_match', 'tournament') then
    raise exception using errcode = '22023', message = 'INVALID_COMPETITION_TYPE';
  end if;
  if char_length(v_title) not between 3 and 140 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 120 then
    raise exception using errcode = '22023', message = 'INVALID_COMPETITION_IDENTITY';
  end if;
  select * into v_format from public.game_formats
  where game_code = v_game_code and format_code = v_format_code and is_active = true;
  if not found then raise exception using errcode = '22023', message = 'UNSUPPORTED_GAME_FORMAT'; end if;
  if v_entry_type not in ('free', 'paid') or v_fee < 0
    or (v_entry_type = 'free' and v_fee <> 0) or (v_entry_type = 'paid' and v_fee <= 0) then
    raise exception using errcode = '22023', message = 'INVALID_ENTRY_CONFIGURATION';
  end if;
  if v_entry_type = 'paid' and coalesce(p_competition ->> 'currency', 'BDT') <> 'BDT' then
    raise exception using errcode = '22023', message = 'BKASH_CURRENCY_MUST_BE_BDT';
  end if;
  if v_capacity not between 1 and 10000 or v_opens is null or v_closes is null or v_starts is null
    or v_opens >= v_closes or v_closes >= v_starts or (v_ends is not null and v_starts >= v_ends) then
    raise exception using errcode = '22023', message = 'INVALID_COMPETITION_DATES_OR_CAPACITY';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = coalesce(nullif(p_competition ->> 'timezone', ''), 'UTC')) then
    raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
  end if;

  insert into public.competitions (
    id, competition_type, title, slug, description, game_code, format_code,
    entry_type, entry_fee, currency, capacity, min_team_size, max_team_size,
    max_substitutes, registration_opens_at, registration_closes_at, starts_at,
    ends_at, timezone, created_by
  ) values (
    v_id, v_type, v_title, v_slug, left(coalesce(p_competition ->> 'description', ''), 5000),
    v_game_code, v_format_code, v_entry_type, v_fee,
    case when v_entry_type = 'paid' then 'BDT' else coalesce(p_competition ->> 'currency', 'BDT') end,
    v_capacity,
    coalesce(nullif(p_competition ->> 'min_team_size', '')::smallint, v_format.min_team_size),
    coalesce(nullif(p_competition ->> 'max_team_size', '')::smallint, v_format.max_team_size),
    coalesce(nullif(p_competition ->> 'max_substitutes', '')::smallint, v_format.max_substitutes),
    v_opens, v_closes, v_starts, v_ends,
    coalesce(nullif(p_competition ->> 'timezone', ''), 'UTC'), v_user_id
  );
  return v_id;
end;
$$;

create function public.publish_competition(p_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  update public.competitions set status = 'published', updated_at = now()
  where id = p_competition_id and status = 'draft'
    and registration_opens_at < registration_closes_at
    and registration_closes_at < starts_at
    and (entry_type = 'free' or (entry_fee > 0 and currency = 'BDT'));
  if not found then raise exception using errcode = '23514', message = 'COMPETITION_NOT_READY_TO_PUBLISH'; end if;
end;
$$;

create function public.create_competition_stage(
  p_competition_id uuid, p_stage_order smallint, p_stage_name text, p_stage_type text,
  p_qualification_rules jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid := gen_random_uuid();
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_qualification_rules, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_QUALIFICATION_RULES';
  end if;
  insert into public.competition_stages (id, competition_id, stage_order, stage_name, stage_type, qualification_rules)
  values (v_id, p_competition_id, p_stage_order, btrim(p_stage_name), p_stage_type, coalesce(p_qualification_rules, '{}'::jsonb));
  return v_id;
end;
$$;

create function public.create_competition_round(
  p_competition_id uuid, p_stage_id uuid, p_round_order smallint, p_round_name text,
  p_scheduled_at timestamptz, p_advancement_rules jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid := gen_random_uuid();
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_advancement_rules, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_ADVANCEMENT_RULES';
  end if;
  insert into public.competition_rounds (id, competition_id, stage_id, round_order, round_name, scheduled_at, advancement_rules)
  values (v_id, p_competition_id, p_stage_id, p_round_order, btrim(p_round_name), p_scheduled_at, coalesce(p_advancement_rules, '{}'::jsonb));
  return v_id;
end;
$$;

create function public.create_game_team(
  p_name text, p_game_code text, p_format_code text, p_in_game_name text,
  p_external_id text default null, p_description text default null, p_region text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_team_id uuid := gen_random_uuid();
  v_slug text;
  v_format public.game_formats%rowtype;
  v_external_id text := nullif(btrim(p_external_id), '');
begin
  if v_user_id is null or not rs_internal.is_player_ready() then
    raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED';
  end if;
  select * into v_format from public.game_formats
  where game_code = p_game_code and format_code = p_format_code and participant_kind = 'team' and is_active;
  if not found then raise exception using errcode = '22023', message = 'UNSUPPORTED_TEAM_FORMAT'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 40
    or char_length(btrim(coalesce(p_in_game_name, ''))) not between 2 and 64 then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_OR_PLAYER_NAME';
  end if;
  if exists (select 1 from public.team_members where user_id = v_user_id and status = 'active') then
    raise exception using errcode = '23505', message = 'ACTIVE_TEAM_EXISTS';
  end if;
  if p_game_code = 'free_fire' and (v_external_id is null or v_external_id !~ '^[0-9]{5,20}$') then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;
  if p_game_code = 'pubg' and (v_external_id is null or v_external_id !~ '^[A-Za-z0-9_-]{2,80}$') then
    raise exception using errcode = '22023', message = 'INVALID_GAME_ID';
  end if;
  if char_length(coalesce(p_description, '')) > 1000 or char_length(coalesce(p_region, '')) > 100 then
    raise exception using errcode = '22023', message = 'TEAM_DETAILS_TOO_LONG';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'team'; end if;
  v_slug := left(v_slug, 48) || '-' || left(v_team_id::text, 12);
  insert into public.teams (id, name, slug, game_code, format_code, description, region)
  values (v_team_id, btrim(p_name), v_slug, p_game_code, p_format_code, nullif(btrim(p_description), ''), nullif(btrim(p_region), ''));
  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team_id, v_user_id, btrim(p_in_game_name), case when p_game_code = 'free_fire' then v_external_id else null end, 'captain', 1);
  insert into public.player_game_identities (user_id, game_code, in_game_name, external_id)
  values (v_user_id, p_game_code, btrim(p_in_game_name), v_external_id)
  on conflict (user_id, game_code) do update set in_game_name = excluded.in_game_name, external_id = excluded.external_id, updated_at = now();
  return v_team_id;
end;
$$;

create function public.invite_game_team_member(p_team_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invited_user_id uuid;
  v_team public.teams%rowtype;
  v_format public.game_formats%rowtype;
  v_invitation_id uuid := gen_random_uuid();
  v_starters integer;
  v_substitutes integer;
begin
  if not rs_internal.is_player_ready() or not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_CAPTAIN_REQUIRED';
  end if;
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND'; end if;
  select * into v_format from public.game_formats where game_code = v_team.game_code and format_code = v_team.format_code;
  if not found or v_format.participant_kind <> 'team' then
    raise exception using errcode = '22023', message = 'TEAM_FORMAT_NOT_SUPPORTED';
  end if;
  if p_role not in ('starting_player', 'substitute') then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_ROLE';
  end if;
  select account.id into v_invited_user_id from auth.users account
  where lower(account.email) = lower(btrim(p_email)) and account.email_confirmed_at is not null;
  if v_invited_user_id is null then raise exception using errcode = 'P0002', message = 'PLAYER_NOT_FOUND'; end if;
  if v_invited_user_id = (select auth.uid()) or exists (
    select 1 from public.team_members m where m.user_id = v_invited_user_id and m.status = 'active'
  ) then raise exception using errcode = '23505', message = 'PLAYER_ALREADY_ON_ACTIVE_TEAM'; end if;
  if exists (select 1 from public.team_invitations i where i.team_id = p_team_id
    and i.invited_user_id = v_invited_user_id and i.status = 'pending') then
    raise exception using errcode = '23505', message = 'INVITATION_ALREADY_PENDING';
  end if;
  select count(*) filter (where role in ('captain', 'starting_player')),
         count(*) filter (where role = 'substitute') into v_starters, v_substitutes
  from public.team_members where team_id = p_team_id and status = 'active';
  if p_role = 'starting_player' and v_starters >= v_format.max_team_size then
    raise exception using errcode = '23514', message = 'STARTING_LINEUP_FULL';
  end if;
  if p_role = 'substitute' and v_substitutes >= v_format.max_substitutes then
    raise exception using errcode = '23514', message = 'SUBSTITUTE_SLOT_FULL';
  end if;
  insert into public.team_invitations (id, team_id, invited_user_id, invited_by, role)
  values (v_invitation_id, p_team_id, v_invited_user_id, (select auth.uid()), p_role);
  return v_invitation_id;
end;
$$;

create function public.respond_to_game_team_invitation(
  p_invitation_id uuid, p_accept boolean, p_in_game_name text default null, p_external_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.team_invitations%rowtype;
  v_team public.teams%rowtype;
  v_slot smallint;
  v_external_id text := nullif(btrim(p_external_id), '');
begin
  if v_user_id is null or not rs_internal.is_player_ready() then
    raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED';
  end if;
  select * into v_invitation from public.team_invitations
  where id = p_invitation_id and invited_user_id = v_user_id and status = 'pending' for update;
  if not found then raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE'; end if;
  perform 1 from public.teams where id = v_invitation.team_id for update;
  select * into v_team from public.teams where id = v_invitation.team_id;
  if not p_accept then
    update public.team_invitations set status = 'rejected', responded_at = now() where id = p_invitation_id;
    return;
  end if;
  if exists (select 1 from public.team_members m where m.user_id = v_user_id and m.status = 'active') then
    raise exception using errcode = '23505', message = 'PLAYER_ALREADY_ON_ACTIVE_TEAM';
  end if;
  if char_length(btrim(coalesce(p_in_game_name, ''))) not between 2 and 64 then
    raise exception using errcode = '22023', message = 'INVALID_IN_GAME_NAME';
  end if;
  if v_team.game_code = 'free_fire' and (v_external_id is null or v_external_id !~ '^[0-9]{5,20}$') then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;
  if v_team.game_code = 'pubg' and (v_external_id is null or v_external_id !~ '^[A-Za-z0-9_-]{2,80}$') then
    raise exception using errcode = '22023', message = 'INVALID_GAME_ID';
  end if;
  if v_invitation.role = 'starting_player' then
    select n::smallint into v_slot from generate_series(2, 32) n
    where not exists (select 1 from public.team_members m where m.team_id = v_team.id and m.status = 'active' and m.slot = n)
    order by n limit 1;
  else
    select n::smallint into v_slot from generate_series(33, 48) n
    where not exists (select 1 from public.team_members m where m.team_id = v_team.id and m.status = 'active' and m.slot = n)
    order by n limit 1;
  end if;
  if v_slot is null then raise exception using errcode = '23514', message = 'TEAM_ROSTER_FULL'; end if;
  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team.id, v_user_id, btrim(p_in_game_name), case when v_team.game_code = 'free_fire' then v_external_id else null end, v_invitation.role, v_slot);
  insert into public.player_game_identities (user_id, game_code, in_game_name, external_id)
  values (v_user_id, v_team.game_code, btrim(p_in_game_name), v_external_id)
  on conflict (user_id, game_code) do update set in_game_name = excluded.in_game_name, external_id = excluded.external_id, updated_at = now();
  update public.team_invitations set status = 'accepted', responded_at = now() where id = p_invitation_id;
end;
$$;

create function public.save_my_game_identity(
  p_game_code text, p_in_game_name text, p_external_id text default null,
  p_rating_value numeric default null, p_rating_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_external_id text := nullif(btrim(p_external_id), '');
begin
  if v_user_id is null or not rs_internal.is_player_ready() then
    raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED';
  end if;
  if not exists (select 1 from public.games where game_code = p_game_code and is_active) then
    raise exception using errcode = '22023', message = 'INVALID_GAME';
  end if;
  if char_length(btrim(coalesce(p_in_game_name, ''))) not between 2 and 64 then
    raise exception using errcode = '22023', message = 'INVALID_IN_GAME_NAME';
  end if;
  if p_game_code = 'free_fire' and (v_external_id is null or v_external_id !~ '^[0-9]{5,20}$') then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;
  if p_rating_value is not null and p_rating_value < 0 then
    raise exception using errcode = '22023', message = 'INVALID_RATING';
  end if;
  insert into public.player_game_identities (user_id, game_code, in_game_name, external_id, rating_value, rating_source)
  values (v_user_id, p_game_code, btrim(p_in_game_name), v_external_id, p_rating_value, nullif(btrim(p_rating_source), ''))
  on conflict (user_id, game_code) do update set
    in_game_name = excluded.in_game_name, external_id = excluded.external_id,
    rating_value = excluded.rating_value, rating_source = excluded.rating_source, updated_at = now();
end;
$$;

create function public.register_competition_team(p_competition_id uuid, p_team_id uuid)
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
    select 1 from public.team_members member
    where member.team_id = p_team_id and member.status = 'active'
      and not exists (select 1 from public.player_game_identities identity
        where identity.user_id = member.user_id and identity.game_code = v_competition.game_code)
  ) then raise exception using errcode = '23514', message = 'GAME_IDENTITY_REQUIRED_FOR_ROSTER'; end if;
  select count(*) into v_reserved from public.competition_entries entry
  where entry.competition_id = p_competition_id
    and entry.status in ('pending_payment', 'payment_rejected', 'pending_review', 'confirmed');
  if v_reserved >= v_competition.capacity then raise exception using errcode = '23514', message = 'COMPETITION_FULL'; end if;
  v_status := case when v_competition.entry_type = 'paid' then 'pending_payment' else 'pending_review' end;
  insert into public.competition_entries (id, competition_id, team_id, registered_by, status)
  values (v_entry_id, p_competition_id, p_team_id, v_user_id, v_status);
  insert into public.competition_entry_members (
    entry_id, user_id, role_snapshot, slot, in_game_name_snapshot, external_id_snapshot
  )
  select v_entry_id, member.user_id, member.role, member.slot,
    coalesce(identity.in_game_name, member.ign), coalesce(identity.external_id, member.free_fire_uid)
  from public.team_members member
  left join public.player_game_identities identity
    on identity.user_id = member.user_id and identity.game_code = v_competition.game_code
  where member.team_id = p_team_id and member.status = 'active';
  insert into public.competition_registration_events (entry_id, from_status, to_status, actor_id)
  values (v_entry_id, null, v_status, v_user_id);
  return v_entry_id;
end;
$$;

create function public.register_competition_individual(p_competition_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_competition public.competitions%rowtype;
  v_entry_id uuid := gen_random_uuid();
  v_status text;
  v_reserved integer;
begin
  if v_user_id is null or not rs_internal.is_player_ready() then
    raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED';
  end if;
  select * into v_competition from public.competitions where id = p_competition_id for update;
  if not found or v_competition.status <> 'published'
    or now() < v_competition.registration_opens_at or now() >= v_competition.registration_closes_at
    or now() >= v_competition.starts_at then
    raise exception using errcode = '23514', message = 'REGISTRATION_CLOSED';
  end if;
  if v_competition.entry_type = 'paid' and v_competition.currency <> 'BDT' then
    raise exception using errcode = '23514', message = 'PAYMENT_UNAVAILABLE_FOR_CURRENCY';
  end if;
  if not exists (select 1 from public.game_formats where game_code = v_competition.game_code
      and format_code = v_competition.format_code and participant_kind = 'individual' and is_active) then
    raise exception using errcode = '23514', message = 'INDIVIDUAL_ENTRY_NOT_SUPPORTED';
  end if;
  select count(*) into v_reserved from public.competition_entries entry
  where entry.competition_id = p_competition_id
    and entry.status in ('pending_payment', 'payment_rejected', 'pending_review', 'confirmed');
  if v_reserved >= v_competition.capacity then raise exception using errcode = '23514', message = 'COMPETITION_FULL'; end if;
  v_status := case when v_competition.entry_type = 'paid' then 'pending_payment' else 'pending_review' end;
  insert into public.competition_entries (id, competition_id, player_id, registered_by, status)
  values (v_entry_id, p_competition_id, v_user_id, v_user_id, v_status);
  insert into public.competition_registration_events (entry_id, from_status, to_status, actor_id)
  values (v_entry_id, null, v_status, v_user_id);
  return v_entry_id;
end;
$$;

create function public.review_competition_entry(p_entry_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.competition_entries%rowtype;
  v_competition public.competitions%rowtype;
  v_user_id uuid := (select auth.uid());
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not rs_internal.has_competition_permission('manage_competitions') then
    raise exception using errcode = '42501', message = 'COMPETITION_MANAGER_REQUIRED';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception using errcode = '22023', message = 'INVALID_ENTRY_DECISION';
  end if;
  select * into v_entry from public.competition_entries where id = p_entry_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ENTRY_NOT_FOUND'; end if;
  select * into v_competition from public.competitions where id = v_entry.competition_id for update;
  if v_entry.registered_by = v_user_id then raise exception using errcode = '42501', message = 'SELF_REVIEW_FORBIDDEN'; end if;
  if v_entry.status not in ('pending_review', 'pending_payment', 'payment_rejected') then
    raise exception using errcode = '23514', message = 'ENTRY_NOT_REVIEWABLE';
  end if;
  if p_decision = 'confirmed' and v_competition.entry_type = 'paid' then
    raise exception using errcode = '23514', message = 'PAID_ENTRY_REQUIRES_APPROVED_PAYMENT';
  end if;
  if p_decision = 'rejected' and v_reason is null then raise exception using errcode = '22023', message = 'REJECTION_REASON_REQUIRED'; end if;
  update public.competition_entries set status = p_decision, reviewed_by = v_user_id,
    reviewed_at = now(), rejection_reason = case when p_decision = 'rejected' then v_reason else null end
  where id = p_entry_id;
  insert into public.competition_registration_events (entry_id, from_status, to_status, actor_id, reason)
  values (p_entry_id, v_entry.status, p_decision, v_user_id, v_reason);
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'competition_entry_' || p_decision, 'competition_entry', p_entry_id, jsonb_build_object('reason', v_reason));
end;
$$;

alter table public.competitions enable row level security;
alter table public.game_formats enable row level security;
alter table public.games enable row level security;
alter table public.player_game_identities enable row level security;
alter table public.competition_stages enable row level security;
alter table public.competition_rounds enable row level security;
alter table public.competition_entries enable row level security;
alter table public.competition_entry_members enable row level security;
alter table public.competition_registration_events enable row level security;
alter table public.admin_audit_log enable row level security;
revoke all on table public.competitions, public.game_formats, public.games, public.player_game_identities,
  public.competition_stages, public.competition_rounds, public.competition_entries,
  public.competition_entry_members, public.competition_registration_events, public.admin_audit_log
from public, anon, authenticated;
grant select on public.games, public.game_formats, public.competitions, public.competition_stages, public.competition_rounds to anon, authenticated;
grant select on public.player_game_identities, public.competition_entries, public.competition_entry_members,
  public.competition_registration_events, public.admin_audit_log to authenticated;

create policy "Public can read games" on public.games for select to anon, authenticated using (is_active);
create policy "Public can read active game formats" on public.game_formats for select to anon, authenticated using (is_active);
create policy "Public can read listed competitions" on public.competitions for select to anon, authenticated
  using (status in ('published', 'registration_closed', 'live', 'completed') or rs_internal.has_competition_permission('manage_competitions'));
create policy "Public can read stages for listed competitions" on public.competition_stages for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id and c.status in ('published', 'registration_closed', 'live', 'completed'))
    or rs_internal.has_competition_permission('manage_competitions'));
create policy "Public can read rounds for listed competitions" on public.competition_rounds for select to anon, authenticated
  using (exists (select 1 from public.competitions c where c.id = competition_id and c.status in ('published', 'registration_closed', 'live', 'completed'))
    or rs_internal.has_competition_permission('manage_competitions'));
create policy "Players and authorized staff can read competition entries" on public.competition_entries for select to authenticated
  using (registered_by = (select auth.uid()) or player_id = (select auth.uid())
    or (team_id is not null and rs_internal.is_active_team_member(team_id))
    or rs_internal.has_competition_permission('manage_competitions') or rs_internal.has_competition_permission('review_payments'));
create policy "Players and authorized staff can read entry roster snapshots" on public.competition_entry_members for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.competition_entries e where e.id = entry_id
    and e.team_id is not null and rs_internal.is_active_team_member(e.team_id))
    or rs_internal.has_competition_permission('manage_competitions') or rs_internal.has_competition_permission('review_payments'));
create policy "Players and authorized staff can read entry events" on public.competition_registration_events for select to authenticated
  using (exists (select 1 from public.competition_entries e where e.id = entry_id and
    (e.registered_by = (select auth.uid()) or e.player_id = (select auth.uid())
      or (e.team_id is not null and rs_internal.is_active_team_member(e.team_id))))
    or rs_internal.has_competition_permission('manage_competitions'));
create policy "Managers can read admin audit log" on public.admin_audit_log for select to authenticated
  using (rs_internal.has_competition_permission('manage_competitions') and auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'super_admin'));
create policy "Players can read their own game identities and teammates' identities"
  on public.player_game_identities for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.team_members member
    join public.team_members self_member on self_member.team_id = member.team_id
    where member.user_id = player_game_identities.user_id
      and self_member.user_id = (select auth.uid())
      and member.status = 'active' and self_member.status = 'active'
  ) or rs_internal.has_competition_permission('manage_competitions'));

create function public.create_game_team(
  p_name text, p_game_code text, p_format_code text, p_in_game_name text,
  p_external_id text default null, p_description text default null, p_region text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_team_id uuid := gen_random_uuid();
  v_slug text;
  v_format public.game_formats%rowtype;
  v_external_id text := nullif(btrim(p_external_id), '');
begin
  if v_user_id is null or not rs_internal.is_player_ready() then raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED'; end if;
  select * into v_format from public.game_formats where game_code = p_game_code and format_code = p_format_code and participant_kind = 'team' and is_active;
  if not found then raise exception using errcode = '22023', message = 'UNSUPPORTED_TEAM_FORMAT'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 40 or char_length(btrim(coalesce(p_in_game_name, ''))) not between 2 and 64 then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_OR_PLAYER_NAME';
  end if;
  if exists (select 1 from public.team_members where user_id = v_user_id and status = 'active') then
    raise exception using errcode = '23505', message = 'ACTIVE_TEAM_EXISTS';
  end if;
  if p_game_code = 'free_fire' and (v_external_id is null or v_external_id !~ '^[0-9]{5,20}$') then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;
  if p_game_code = 'pubg' and (v_external_id is null or v_external_id !~ '^[A-Za-z0-9_-]{2,80}$') then
    raise exception using errcode = '22023', message = 'INVALID_GAME_ID';
  end if;
  if char_length(coalesce(p_description, '')) > 1000 or char_length(coalesce(p_region, '')) > 100 then
    raise exception using errcode = '22023', message = 'TEAM_DETAILS_TOO_LONG';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'team'; end if;
  v_slug := left(v_slug, 48) || '-' || left(v_team_id::text, 12);
  insert into public.teams (id, name, slug, game_code, format_code, description, region)
  values (v_team_id, btrim(p_name), v_slug, p_game_code, p_format_code, nullif(btrim(p_description), ''), nullif(btrim(p_region), ''));
  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team_id, v_user_id, btrim(p_in_game_name), case when p_game_code = 'free_fire' then v_external_id else null end, 'captain', 1);
  insert into public.player_game_identities (user_id, game_code, in_game_name, external_id)
  values (v_user_id, p_game_code, btrim(p_in_game_name), v_external_id)
  on conflict (user_id, game_code) do update set in_game_name = excluded.in_game_name, external_id = excluded.external_id, updated_at = now();
  return v_team_id;
end;
$$;

create function public.invite_game_team_member(p_team_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_team public.teams%rowtype;
  v_format public.game_formats%rowtype;
  v_invitation_id uuid := gen_random_uuid();
  v_starters integer;
  v_substitutes integer;
  v_pending_starters integer;
  v_pending_substitutes integer;
begin
  if not rs_internal.is_player_ready() or not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_CAPTAIN_REQUIRED';
  end if;
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'TEAM_NOT_FOUND'; end if;
  select * into v_format from public.game_formats where game_code = v_team.game_code and format_code = v_team.format_code;
  if not found or v_format.participant_kind <> 'team' then raise exception using errcode = '22023', message = 'TEAM_FORMAT_NOT_SUPPORTED'; end if;
  if p_role not in ('starting_player', 'substitute') then raise exception using errcode = '22023', message = 'INVALID_TEAM_ROLE'; end if;
  select account.id into v_user_id from auth.users account where lower(account.email) = lower(btrim(p_email)) and account.email_confirmed_at is not null;
  if v_user_id is null then raise exception using errcode = 'P0002', message = 'PLAYER_NOT_FOUND'; end if;
  if v_user_id = (select auth.uid()) or exists (select 1 from public.team_members m where m.user_id = v_user_id and m.status = 'active') then
    raise exception using errcode = '23505', message = 'PLAYER_ALREADY_ON_ACTIVE_TEAM';
  end if;
  if exists (select 1 from public.team_invitations i where i.team_id = p_team_id and i.invited_user_id = v_user_id and i.status = 'pending') then
    raise exception using errcode = '23505', message = 'INVITATION_ALREADY_PENDING';
  end if;
  select count(*) filter (where role in ('captain', 'starting_player')), count(*) filter (where role = 'substitute')
    into v_starters, v_substitutes from public.team_members where team_id = p_team_id and status = 'active';
  select count(*) filter (where role = 'starting_player'), count(*) filter (where role = 'substitute')
    into v_pending_starters, v_pending_substitutes
    from public.team_invitations where team_id = p_team_id and status = 'pending';
  if p_role = 'starting_player' and v_starters + v_pending_starters >= v_format.max_team_size then raise exception using errcode = '23514', message = 'STARTING_LINEUP_FULL'; end if;
  if p_role = 'substitute' and v_substitutes + v_pending_substitutes >= v_format.max_substitutes then raise exception using errcode = '23514', message = 'SUBSTITUTE_SLOT_FULL'; end if;
  insert into public.team_invitations (id, team_id, invited_user_id, invited_by, role)
  values (v_invitation_id, p_team_id, v_user_id, (select auth.uid()), p_role);
  return v_invitation_id;
end;
$$;

create function public.respond_to_game_team_invitation(
  p_invitation_id uuid, p_accept boolean, p_in_game_name text default null, p_external_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invitation public.team_invitations%rowtype;
  v_team public.teams%rowtype;
  v_format public.game_formats%rowtype;
  v_slot smallint;
  v_active_starters integer;
  v_active_substitutes integer;
  v_external_id text := nullif(btrim(p_external_id), '');
begin
  if v_user_id is null or not rs_internal.is_player_ready() then raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED'; end if;
  if p_accept is null then raise exception using errcode = '22023', message = 'INVALID_INVITATION_RESPONSE'; end if;
  select * into v_invitation from public.team_invitations where id = p_invitation_id and invited_user_id = v_user_id and status = 'pending' for update;
  if not found then raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE'; end if;
  perform 1 from public.teams where id = v_invitation.team_id for update;
  select * into v_team from public.teams where id = v_invitation.team_id;
  select * into v_format from public.game_formats
  where game_code = v_team.game_code and format_code = v_team.format_code and participant_kind = 'team';
  if not p_accept then
    update public.team_invitations set status = 'rejected', responded_at = now() where id = p_invitation_id;
    return;
  end if;
  if exists (select 1 from public.team_members m where m.user_id = v_user_id and m.status = 'active') then
    raise exception using errcode = '23505', message = 'PLAYER_ALREADY_ON_ACTIVE_TEAM';
  end if;
  select count(*) filter (where role in ('captain', 'starting_player')),
         count(*) filter (where role = 'substitute')
  into v_active_starters, v_active_substitutes
  from public.team_members where team_id = v_team.id and status = 'active';
  if char_length(btrim(coalesce(p_in_game_name, ''))) not between 2 and 64 then raise exception using errcode = '22023', message = 'INVALID_IN_GAME_NAME'; end if;
  if v_team.game_code = 'free_fire' and (v_external_id is null or v_external_id !~ '^[0-9]{5,20}$') then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;
  if v_team.game_code = 'pubg' and (v_external_id is null or v_external_id !~ '^[A-Za-z0-9_-]{2,80}$') then
    raise exception using errcode = '22023', message = 'INVALID_GAME_ID';
  end if;
  if v_invitation.role = 'starting_player' and v_active_starters >= v_format.max_team_size then
    raise exception using errcode = '23514', message = 'STARTING_LINEUP_FULL';
  end if;
  if v_invitation.role = 'substitute' and v_active_substitutes >= v_format.max_substitutes then
    raise exception using errcode = '23514', message = 'SUBSTITUTE_SLOT_FULL';
  end if;
  if v_invitation.role = 'starting_player' then
    select n::smallint into v_slot from generate_series(2, v_format.max_team_size) n
    where not exists (select 1 from public.team_members m where m.team_id = v_team.id and m.status = 'active' and m.slot = n)
    order by n limit 1;
  else
    select n::smallint into v_slot from generate_series(5, 4 + v_format.max_substitutes) n
    where not exists (select 1 from public.team_members m where m.team_id = v_team.id and m.status = 'active' and m.slot = n)
    order by n limit 1;
  end if;
  if v_slot is null then raise exception using errcode = '23514', message = 'TEAM_ROSTER_FULL'; end if;
  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team.id, v_user_id, btrim(p_in_game_name), case when v_team.game_code = 'free_fire' then v_external_id else null end, v_invitation.role, v_slot);
  insert into public.player_game_identities (user_id, game_code, in_game_name, external_id)
  values (v_user_id, v_team.game_code, btrim(p_in_game_name), v_external_id)
  on conflict (user_id, game_code) do update set in_game_name = excluded.in_game_name, external_id = excluded.external_id, updated_at = now();
  update public.team_invitations set status = 'accepted', responded_at = now() where id = p_invitation_id;
end;
$$;

create function public.save_my_game_identity(
  p_game_code text, p_in_game_name text, p_external_id text default null,
  p_rating_value numeric default null, p_rating_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_external_id text := nullif(btrim(p_external_id), '');
begin
  if v_user_id is null or not rs_internal.is_player_ready() then raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED'; end if;
  if not exists (select 1 from public.games where game_code = p_game_code and is_active) then raise exception using errcode = '22023', message = 'INVALID_GAME'; end if;
  if char_length(btrim(coalesce(p_in_game_name, ''))) not between 2 and 64 then raise exception using errcode = '22023', message = 'INVALID_IN_GAME_NAME'; end if;
  if p_game_code = 'free_fire' and (v_external_id is null or v_external_id !~ '^[0-9]{5,20}$') then raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID'; end if;
  if p_rating_value is not null and p_rating_value < 0 then raise exception using errcode = '22023', message = 'INVALID_RATING'; end if;
  insert into public.player_game_identities (user_id, game_code, in_game_name, external_id, rating_value, rating_source)
  values (v_user_id, p_game_code, btrim(p_in_game_name), v_external_id, p_rating_value, nullif(btrim(p_rating_source), ''))
  on conflict (user_id, game_code) do update set
    in_game_name = excluded.in_game_name, external_id = excluded.external_id,
    rating_value = excluded.rating_value, rating_source = excluded.rating_source, updated_at = now();
end;
$$;

revoke all on function public.sync_legacy_tournament_competition() from public, anon, authenticated;
revoke all on function public.create_competition(jsonb) from public, anon;
revoke all on function public.publish_competition(uuid) from public, anon;
revoke all on function public.create_competition_stage(uuid, smallint, text, text, jsonb) from public, anon;
revoke all on function public.create_competition_round(uuid, uuid, smallint, text, timestamptz, jsonb) from public, anon;
revoke all on function public.create_game_team(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.invite_game_team_member(uuid, text, text) from public, anon;
revoke all on function public.respond_to_game_team_invitation(uuid, boolean, text, text) from public, anon;
revoke all on function public.save_my_game_identity(text, text, text, numeric, text) from public, anon;
revoke all on function public.register_competition_team(uuid, uuid) from public, anon;
revoke all on function public.register_competition_individual(uuid) from public, anon;
revoke all on function public.review_competition_entry(uuid, text, text) from public, anon;
grant execute on function public.create_competition(jsonb) to authenticated;
grant execute on function public.publish_competition(uuid) to authenticated;
grant execute on function public.create_competition_stage(uuid, smallint, text, text, jsonb) to authenticated;
grant execute on function public.create_competition_round(uuid, uuid, smallint, text, timestamptz, jsonb) to authenticated;
grant execute on function public.create_game_team(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.invite_game_team_member(uuid, text, text) to authenticated;
grant execute on function public.respond_to_game_team_invitation(uuid, boolean, text, text) to authenticated;
grant execute on function public.save_my_game_identity(text, text, text, numeric, text) to authenticated;
grant execute on function public.register_competition_team(uuid, uuid) to authenticated;
grant execute on function public.register_competition_individual(uuid) to authenticated;
grant execute on function public.review_competition_entry(uuid, text, text) to authenticated;

commit;
