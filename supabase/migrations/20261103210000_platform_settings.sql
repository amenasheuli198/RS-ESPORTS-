begin;

create table public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique check (setting_key ~ '^[a-z0-9_.-]{2,80}$'),
  setting_value jsonb not null,
  setting_group text not null check (setting_group in ('general', 'branding', 'tournament_defaults', 'registration', 'match', 'notifications', 'player_team', 'content', 'maintenance', 'security')),
  description text default '' check (char_length(description) <= 500),
  is_public boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create index platform_settings_group_idx
  on public.platform_settings (setting_group, is_public, updated_at desc);

create table public.platform_setting_audit_log (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null,
  previous_value jsonb,
  new_value jsonb,
  changed_by uuid not null references auth.users (id) on delete restrict,
  change_reason text default '' check (char_length(change_reason) <= 500),
  created_at timestamptz not null default now()
);

create index platform_setting_audit_log_key_idx
  on public.platform_setting_audit_log (setting_key, created_at desc);

alter table public.platform_settings enable row level security;
alter table public.platform_setting_audit_log enable row level security;

revoke all on table public.platform_settings, public.platform_setting_audit_log from public, anon, authenticated;
grant select on table public.platform_settings to anon, authenticated;
grant select on table public.platform_setting_audit_log to authenticated;
grant insert, update, delete on table public.platform_settings to authenticated;
grant insert on table public.platform_setting_audit_log to authenticated;

create function public.set_platform_setting(
  p_setting_key text,
  p_setting_value jsonb,
  p_setting_group text,
  p_description text default '',
  p_is_public boolean default false,
  p_change_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_previous jsonb;
  v_is_admin boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select rs_internal.is_tournament_admin() into v_is_admin;
  if not v_is_admin then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  if p_setting_key !~ '^[a-z0-9_.-]{2,80}$' then
    raise exception using errcode = '22023', message = 'INVALID_SETTING_KEY';
  end if;

  if p_setting_group not in ('general', 'branding', 'tournament_defaults', 'registration', 'match', 'notifications', 'player_team', 'content', 'maintenance', 'security') then
    raise exception using errcode = '22023', message = 'INVALID_SETTING_GROUP';
  end if;

  if jsonb_typeof(p_setting_value) not in ('object', 'array', 'string', 'number', 'boolean') then
    raise exception using errcode = '22023', message = 'INVALID_SETTING_VALUE';
  end if;

  select setting_value into v_previous from public.platform_settings where setting_key = p_setting_key for update;

  insert into public.platform_settings (setting_key, setting_value, setting_group, description, is_public, updated_by, updated_at)
  values (p_setting_key, p_setting_value, p_setting_group, p_description, p_is_public, v_user_id, now())
  on conflict (setting_key) do update set
    setting_value = excluded.setting_value,
    setting_group = excluded.setting_group,
    description = excluded.description,
    is_public = excluded.is_public,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.platform_setting_audit_log (setting_key, previous_value, new_value, changed_by, change_reason)
  values (p_setting_key, v_previous, p_setting_value, v_user_id, p_change_reason);
end;
$$;

revoke all on function public.set_platform_setting(text, jsonb, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.set_platform_setting(text, jsonb, text, text, boolean, text) to authenticated;

create function public.get_public_platform_settings()
returns table (
  setting_key text,
  setting_value jsonb,
  setting_group text,
  description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select setting_key, setting_value, setting_group, description
  from public.platform_settings
  where is_public = true
  order by setting_group, setting_key;
$$;

revoke all on function public.get_public_platform_settings() from public, anon, authenticated;
grant execute on function public.get_public_platform_settings() to anon, authenticated;

create function public.get_private_platform_settings()
returns table (
  setting_key text,
  setting_value jsonb,
  setting_group text,
  description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select setting_key, setting_value, setting_group, description
  from public.platform_settings
  order by setting_group, setting_key;
$$;

revoke all on function public.get_private_platform_settings() from public, anon, authenticated;
grant execute on function public.get_private_platform_settings() to authenticated;

create function public.seed_platform_defaults()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.platform_settings (setting_key, setting_value, setting_group, description, is_public)
  values
    ('platform.name', jsonb_build_object('value', 'RS ESPORTS'), 'general', 'Display platform name.', true),
    ('platform.description', jsonb_build_object('value', 'Competitive esports platform for RS Esports.'), 'general', 'Public platform description.', true),
    ('platform.tagline', jsonb_build_object('value', 'Built for competitive play.'), 'general', 'Short public tagline.', true),
    ('platform.support_email', jsonb_build_object('value', 'support@example.com'), 'general', 'Public contact email used only if validated.', false),
    ('platform.default_timezone', jsonb_build_object('value', 'UTC'), 'general', 'Default platform timezone.', true),
    ('platform.default_language', jsonb_build_object('value', 'en'), 'general', 'Default language code.', true),
    ('platform.public_site_status', jsonb_build_object('value', true), 'general', 'Whether the public site is open to visitors.', true),
    ('platform.maintenance_mode', jsonb_build_object('value', false, 'message', 'Scheduled maintenance in progress.', 'expected_restore_time', null), 'maintenance', 'System maintenance toggle.', true),
    ('platform.registration_enabled', jsonb_build_object('value', true), 'registration', 'Global registration toggle.', true),
    ('platform.default_team_size', jsonb_build_object('value', 5), 'player_team', 'Default maximum team roster size.', true),
    ('platform.public_news_enabled', jsonb_build_object('value', true), 'content', 'Toggle public news visibility.', true),
    ('platform.news_featured_limit', jsonb_build_object('value', 3), 'content', 'Number of featured articles to highlight.', true),
    ('platform.announcements_public', jsonb_build_object('value', true), 'content', 'Homepage announcement visibility.', true),
    ('platform.leaderboard_public', jsonb_build_object('value', true), 'content', 'Public leaderboard visibility.', true),
    ('platform.player_profiles_public', jsonb_build_object('value', true), 'content', 'Public player profile visibility.', true)
  on conflict (setting_key) do nothing;
end;
$$;

revoke all on function public.seed_platform_defaults() from public, anon, authenticated;
grant execute on function public.seed_platform_defaults() to authenticated;

create function public.admin_seed_platform_defaults()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  perform public.seed_platform_defaults();
end;
$$;

revoke all on function public.admin_seed_platform_defaults() from public, anon, authenticated;
grant execute on function public.admin_seed_platform_defaults() to authenticated;

create policy "Public users can read public settings"
  on public.platform_settings
  for select
  to anon, authenticated
  using (is_public = true);

create policy "Admins can read private settings"
  on public.platform_settings
  for select
  to authenticated
  using (rs_internal.is_tournament_admin());

create policy "Admins can manage platform settings"
  on public.platform_settings
  for all
  to authenticated
  using (rs_internal.is_tournament_admin())
  with check (rs_internal.is_tournament_admin());

create policy "Admins can read audit records"
  on public.platform_setting_audit_log
  for select
  to authenticated
  using (rs_internal.is_tournament_admin());

create policy "Admins can create audit records"
  on public.platform_setting_audit_log
  for insert
  to authenticated
  with check (rs_internal.is_tournament_admin());

commit;
