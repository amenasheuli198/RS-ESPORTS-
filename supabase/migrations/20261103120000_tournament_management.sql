begin;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  description text not null default '' check (char_length(description) <= 5000),
  banner_path text,
  game_code text not null check (game_code ~ '^[a-z0-9_]{2,40}$'),
  mode_code text not null check (mode_code ~ '^[a-z0-9_]{2,60}$'),
  format_code text not null check (format_code ~ '^[a-z0-9_]{2,60}$'),
  max_teams smallint not null check (max_teams between 2 and 256),
  starting_players_required smallint not null check (starting_players_required between 1 and 20),
  substitute_allowed boolean not null default false,
  entry_type text not null default 'free' check (entry_type in ('free', 'paid')),
  entry_fee numeric(12, 2) not null default 0 check (entry_fee >= 0 and entry_fee < 'Infinity'::numeric),
  prize_pool numeric(12, 2) not null default 0 check (prize_pool >= 0 and prize_pool < 'Infinity'::numeric),
  prize_distribution text not null default '' check (char_length(prize_distribution) <= 2000),
  eligibility text not null default '' check (char_length(eligibility) <= 3000),
  participation_requirements text not null default '' check (char_length(participation_requirements) <= 3000),
  match_rules text not null default '' check (char_length(match_rules) <= 5000),
  scoring_system text not null default '' check (char_length(scoring_system) <= 5000),
  disqualification_rules text not null default '' check (char_length(disqualification_rules) <= 3000),
  general_instructions text not null default '' check (char_length(general_instructions) <= 5000),
  match_schedule jsonb not null default '[]'::jsonb check (jsonb_typeof(match_schedule) = 'array'),
  timezone text not null default 'UTC',
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'cancelled')),
  lifecycle_status text not null default 'scheduled' check (lifecycle_status in ('scheduled', 'live', 'completed')),
  is_featured boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_opens_at < registration_closes_at),
  check (registration_closes_at < starts_at),
  check (ends_at is null or starts_at < ends_at),
  check ((entry_type = 'free' and entry_fee = 0) or (entry_type = 'paid' and entry_fee > 0))
);

create index tournaments_public_start_idx
  on public.tournaments (starts_at)
  where publication_status = 'published';

create index tournaments_public_game_mode_idx
  on public.tournaments (game_code, mode_code)
  where publication_status = 'published';

create index tournaments_admin_status_created_idx
  on public.tournaments (publication_status, created_at desc);

create index tournaments_featured_idx
  on public.tournaments (is_featured, starts_at)
  where publication_status = 'published';

alter table public.tournaments enable row level security;
revoke all on table public.tournaments from public, anon, authenticated;
grant select on table public.tournaments to anon, authenticated;

create schema if not exists rs_internal;
revoke all on schema rs_internal from public, anon;
grant usage on schema rs_internal to authenticated;

create function rs_internal.is_tournament_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke all on function rs_internal.is_tournament_admin() from public, anon;
grant execute on function rs_internal.is_tournament_admin() to authenticated;

create policy "Public can read published tournaments"
  on public.tournaments
  for select
  to anon, authenticated
  using (publication_status = 'published');

create policy "Admins can read all tournaments"
  on public.tournaments
  for select
  to authenticated
  using (rs_internal.is_tournament_admin());

create policy "Admins can create tournaments"
  on public.tournaments
  for insert
  to authenticated
  with check (rs_internal.is_tournament_admin() and created_by = (select auth.uid()));

create policy "Admins can update tournaments"
  on public.tournaments
  for update
  to authenticated
  using (rs_internal.is_tournament_admin())
  with check (rs_internal.is_tournament_admin());

create function public.set_tournament_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_tournaments_updated_at
  before update on public.tournaments
  for each row execute function public.set_tournament_updated_at();

revoke all on function public.set_tournament_updated_at() from public, anon, authenticated;

create function public.prevent_tournament_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception using errcode = '42501', message = 'TOURNAMENT_OWNER_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger prevent_tournaments_owner_change
  before update on public.tournaments
  for each row execute function public.prevent_tournament_owner_change();

revoke all on function public.prevent_tournament_owner_change() from public, anon, authenticated;

create function rs_internal.save_tournament(p_tournament jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid := nullif(p_tournament ->> 'id', '')::uuid;
  v_name text := btrim(coalesce(p_tournament ->> 'name', ''));
  v_slug text := lower(btrim(coalesce(p_tournament ->> 'slug', '')));
  v_game_code text := lower(btrim(coalesce(p_tournament ->> 'game_code', '')));
  v_mode_code text := lower(btrim(coalesce(p_tournament ->> 'mode_code', '')));
  v_format_code text := lower(btrim(coalesce(p_tournament ->> 'format_code', '')));
  v_entry_type text := coalesce(p_tournament ->> 'entry_type', 'free');
  v_entry_fee numeric(12, 2) := coalesce(nullif(p_tournament ->> 'entry_fee', '')::numeric, 0);
  v_timezone text := coalesce(nullif(p_tournament ->> 'timezone', ''), 'UTC');
  v_schedule jsonb := coalesce(p_tournament -> 'match_schedule', '[]'::jsonb);
  v_banner_path text := nullif(p_tournament ->> 'banner_path', '');
  v_opens_at timestamptz := (p_tournament ->> 'registration_opens_at')::timestamptz;
  v_closes_at timestamptz := (p_tournament ->> 'registration_closes_at')::timestamptz;
  v_starts_at timestamptz := (p_tournament ->> 'starts_at')::timestamptz;
  v_ends_at timestamptz := nullif(p_tournament ->> 'ends_at', '')::timestamptz;
  v_schedule_item jsonb;
  v_schedule_at timestamptz;
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if v_user_id is null or jsonb_typeof(p_tournament) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_TOURNAMENT_PAYLOAD';
  end if;
  if char_length(v_name) not between 3 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_TOURNAMENT_NAME';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 100 then
    raise exception using errcode = '22023', message = 'INVALID_TOURNAMENT_SLUG';
  end if;
  if v_game_code !~ '^[a-z0-9_]{2,40}$' or v_mode_code !~ '^[a-z0-9_]{2,60}$'
    or v_format_code !~ '^[a-z0-9_]{2,60}$' then
    raise exception using errcode = '22023', message = 'INVALID_TOURNAMENT_FORMAT';
  end if;
  if v_entry_type not in ('free', 'paid') or v_entry_fee < 0
    or (v_entry_type = 'free' and v_entry_fee <> 0)
    or (v_entry_type = 'paid' and v_entry_fee <= 0) then
    raise exception using errcode = '22023', message = 'INVALID_ENTRY_CONFIGURATION';
  end if;
  if jsonb_typeof(v_schedule) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_MATCH_SCHEDULE';
  end if;
  for v_schedule_item in select value from jsonb_array_elements(v_schedule)
  loop
    if jsonb_typeof(v_schedule_item) <> 'object'
      or char_length(btrim(coalesce(v_schedule_item ->> 'title', ''))) not between 1 and 120
      or char_length(coalesce(v_schedule_item ->> 'notes', '')) > 500 then
      raise exception using errcode = '22023', message = 'INVALID_MATCH_SCHEDULE_ITEM';
    end if;
    begin
      v_schedule_at := (v_schedule_item ->> 'starts_at')::timestamptz;
    exception when others then
      raise exception using errcode = '22023', message = 'INVALID_MATCH_SCHEDULE_ITEM';
    end;
  end loop;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
  end if;
  if v_opens_at is null or v_closes_at is null or v_starts_at is null
    or v_opens_at >= v_closes_at or v_closes_at >= v_starts_at
    or (v_ends_at is not null and v_starts_at >= v_ends_at) then
    raise exception using errcode = '22023', message = 'INVALID_TOURNAMENT_DATES';
  end if;
  if v_banner_path is not null and (
    (storage.foldername(v_banner_path))[1] <> coalesce(v_id::text, '')
    or (storage.foldername(v_banner_path))[2] is not null
    or not exists (
      select 1 from storage.objects as object
      where object.bucket_id = 'tournament-banners' and object.name = v_banner_path
    )
  ) then
    raise exception using errcode = '22023', message = 'INVALID_BANNER_PATH';
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.tournaments (
      id, name, slug, description, banner_path, game_code, mode_code, format_code,
      max_teams, starting_players_required, substitute_allowed, entry_type, entry_fee,
      prize_pool, prize_distribution, eligibility, participation_requirements,
      match_rules, scoring_system, disqualification_rules, general_instructions,
      match_schedule, timezone, registration_opens_at, registration_closes_at,
      starts_at, ends_at, is_featured, created_by
    ) values (
      v_id, v_name, v_slug, coalesce(p_tournament ->> 'description', ''), v_banner_path,
      v_game_code, v_mode_code, v_format_code,
      coalesce(nullif(p_tournament ->> 'max_teams', '')::smallint, 48),
      coalesce(nullif(p_tournament ->> 'starting_players_required', '')::smallint, 4),
      coalesce((p_tournament ->> 'substitute_allowed')::boolean, false),
      v_entry_type, v_entry_fee,
      coalesce(nullif(p_tournament ->> 'prize_pool', '')::numeric, 0),
      coalesce(p_tournament ->> 'prize_distribution', ''),
      coalesce(p_tournament ->> 'eligibility', ''),
      coalesce(p_tournament ->> 'participation_requirements', ''),
      coalesce(p_tournament ->> 'match_rules', ''),
      coalesce(p_tournament ->> 'scoring_system', ''),
      coalesce(p_tournament ->> 'disqualification_rules', ''),
      coalesce(p_tournament ->> 'general_instructions', ''),
      v_schedule, v_timezone, v_opens_at, v_closes_at, v_starts_at, v_ends_at,
      coalesce((p_tournament ->> 'is_featured')::boolean, false), v_user_id
    );
  else
    perform 1 from public.tournaments where id = v_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND';
    end if;
    update public.tournaments set
      name = v_name,
      slug = v_slug,
      description = coalesce(p_tournament ->> 'description', ''),
      banner_path = coalesce(v_banner_path, banner_path),
      game_code = v_game_code,
      mode_code = v_mode_code,
      format_code = v_format_code,
      max_teams = coalesce(nullif(p_tournament ->> 'max_teams', '')::smallint, 48),
      starting_players_required = coalesce(nullif(p_tournament ->> 'starting_players_required', '')::smallint, 4),
      substitute_allowed = coalesce((p_tournament ->> 'substitute_allowed')::boolean, false),
      entry_type = v_entry_type,
      entry_fee = v_entry_fee,
      prize_pool = coalesce(nullif(p_tournament ->> 'prize_pool', '')::numeric, 0),
      prize_distribution = coalesce(p_tournament ->> 'prize_distribution', ''),
      eligibility = coalesce(p_tournament ->> 'eligibility', ''),
      participation_requirements = coalesce(p_tournament ->> 'participation_requirements', ''),
      match_rules = coalesce(p_tournament ->> 'match_rules', ''),
      scoring_system = coalesce(p_tournament ->> 'scoring_system', ''),
      disqualification_rules = coalesce(p_tournament ->> 'disqualification_rules', ''),
      general_instructions = coalesce(p_tournament ->> 'general_instructions', ''),
      match_schedule = v_schedule,
      timezone = v_timezone,
      registration_opens_at = v_opens_at,
      registration_closes_at = v_closes_at,
      starts_at = v_starts_at,
      ends_at = v_ends_at,
      is_featured = coalesce((p_tournament ->> 'is_featured')::boolean, false)
    where id = v_id;
  end if;

  return v_id;
end;
$$;

create function public.save_tournament(p_tournament jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  return rs_internal.save_tournament(p_tournament);
end;
$$;

create function public.publish_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if not exists (
    select 1 from public.tournaments as tournament
    join storage.objects as banner on banner.bucket_id = 'tournament-banners'
      and banner.name = tournament.banner_path
    where tournament.id = p_tournament_id
      and tournament.publication_status = 'draft'
      and tournament.registration_opens_at < tournament.registration_closes_at
      and tournament.registration_closes_at < tournament.starts_at
  ) then
    raise exception using errcode = '23514', message = 'TOURNAMENT_NOT_READY_TO_PUBLISH';
  end if;
  update public.tournaments set publication_status = 'published'
  where id = p_tournament_id and publication_status = 'draft';
end;
$$;

create function public.cancel_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  update public.tournaments set publication_status = 'cancelled'
  where id = p_tournament_id and publication_status <> 'cancelled';
  if not found then
    raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND_OR_CANCELLED';
  end if;
end;
$$;

create function public.set_tournament_lifecycle(p_tournament_id uuid, p_lifecycle_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'TOURNAMENT_ADMIN_REQUIRED';
  end if;
  if p_lifecycle_status not in ('scheduled', 'live', 'completed') then
    raise exception using errcode = '22023', message = 'INVALID_LIFECYCLE_STATUS';
  end if;
  update public.tournaments set lifecycle_status = p_lifecycle_status
  where id = p_tournament_id and publication_status = 'published';
  if not found then
    raise exception using errcode = 'P0002', message = 'PUBLISHED_TOURNAMENT_NOT_FOUND';
  end if;
end;
$$;

revoke all on function rs_internal.save_tournament(jsonb) from public, anon, authenticated;
revoke all on function public.save_tournament(jsonb) from public, anon;
revoke all on function public.publish_tournament(uuid) from public, anon;
revoke all on function public.cancel_tournament(uuid) from public, anon;
revoke all on function public.set_tournament_lifecycle(uuid, text) from public, anon;
grant execute on function public.save_tournament(jsonb) to authenticated;
grant execute on function public.publish_tournament(uuid) to authenticated;
grant execute on function public.cancel_tournament(uuid) to authenticated;
grant execute on function public.set_tournament_lifecycle(uuid, text) to authenticated;

create view public.tournaments_public
with (security_invoker = true)
as
select tournament.id, tournament.name, tournament.slug, tournament.description,
  tournament.banner_path, tournament.game_code, tournament.mode_code, tournament.format_code,
  tournament.max_teams, tournament.starting_players_required, tournament.substitute_allowed,
  tournament.entry_type, tournament.entry_fee, tournament.prize_pool, tournament.prize_distribution,
  tournament.eligibility, tournament.participation_requirements, tournament.match_rules,
  tournament.scoring_system, tournament.disqualification_rules, tournament.general_instructions,
  tournament.match_schedule, tournament.timezone, tournament.registration_opens_at,
  tournament.registration_closes_at, tournament.starts_at, tournament.ends_at,
  tournament.is_featured, tournament.created_at, tournament.publication_status,
  tournament.lifecycle_status,
  case
    when tournament.publication_status = 'cancelled' then 'Cancelled'
    when tournament.publication_status <> 'published' then 'Draft'
    when tournament.lifecycle_status = 'completed' or (tournament.ends_at is not null and now() >= tournament.ends_at) then 'Completed'
    when tournament.lifecycle_status = 'live' or now() >= tournament.starts_at then 'Live'
    when now() < tournament.registration_opens_at then 'Upcoming'
    when now() >= tournament.registration_closes_at then 'Registration Closed'
    when tournament.registration_closes_at <= now() + interval '48 hours' then 'Registration Closing Soon'
    else 'Registration Open'
  end as tournament_status
from public.tournaments as tournament
;

grant select on public.tournaments_public to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-banners', 'tournament-banners', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets as bucket
    where bucket.id = 'tournament-banners'
      and bucket.public = false
      and bucket.file_size_limit = 5242880
      and bucket.allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'The tournament-banners bucket already exists with unexpected settings. Review and configure it as private, 5 MB, PNG/JPEG/WEBP before applying this migration.';
  end if;
end;
$$;

create policy "Public can read published tournament banners"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'tournament-banners'
    and exists (
      select 1 from public.tournaments as tournament
      where tournament.banner_path = name
        and tournament.publication_status = 'published'
    )
  );

create policy "Admins can read tournament banners"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'tournament-banners' and rs_internal.is_tournament_admin());

create policy "Admins can upload tournament banners"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tournament-banners'
    and rs_internal.is_tournament_admin()
    and (storage.foldername(name))[2] is null
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
    and metadata ->> 'mimetype' in ('image/png', 'image/jpeg', 'image/webp')
    and coalesce((metadata ->> 'size')::bigint, 5242881) <= 5242880
    and exists (
      select 1 from public.tournaments as tournament
      where tournament.id::text = (storage.foldername(name))[1]
    )
  );

create policy "Admins can delete tournament banners"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tournament-banners'
    and rs_internal.is_tournament_admin()
    and (storage.foldername(name))[2] is null
  );

commit;