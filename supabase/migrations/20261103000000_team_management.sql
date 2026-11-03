begin;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (
    char_length(btrim(name)) between 3 and 40
    and name = btrim(name)
    and name !~ '[[:cntrl:]]'
  ),
  slug text not null unique,
  game_code text not null default 'free_fire' check (game_code ~ '^[a-z0-9_]{2,40}$'),
  format_code text not null default 'battle_royale_squad' check (format_code ~ '^[a-z0-9_]{2,60}$'),
  logo_path text,
  description text check (description is null or char_length(description) <= 1000),
  region text check (region is null or char_length(region) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teams_name_normalized_unique
  on public.teams (lower(btrim(name)));

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ign text not null check (
    char_length(btrim(ign)) between 2 and 32
    and ign = btrim(ign)
    and ign !~ '[[:cntrl:]]'
  ),
  free_fire_uid text not null check (free_fire_uid ~ '^[0-9]{5,20}$'),
  role text not null check (role in ('captain', 'starting_player', 'substitute')),
  slot smallint not null check (
    (role = 'captain' and slot = 1)
    or (role = 'starting_player' and slot between 2 and 4)
    or (role = 'substitute' and slot = 5)
  ),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now()
);

create unique index team_members_one_active_team_per_user
  on public.team_members (user_id)
  where status = 'active';

create unique index team_members_one_active_member_per_slot
  on public.team_members (team_id, slot)
  where status = 'active';

create unique index team_members_one_active_captain_per_team
  on public.team_members (team_id)
  where role = 'captain' and status = 'active';

create index team_members_team_status_idx
  on public.team_members (team_id, status);

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  invited_user_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('starting_player', 'substitute')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check ((status = 'pending' and responded_at is null) or (status <> 'pending' and responded_at is not null))
);

create unique index team_invitations_one_pending_per_team_user
  on public.team_invitations (team_id, invited_user_id)
  where status = 'pending';

create index team_invitations_invitee_status_idx
  on public.team_invitations (invited_user_id, status);

create index team_invitations_team_status_idx
  on public.team_invitations (team_id, status);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
begin
  if char_length(v_full_name) not between 2 and 100 then
    v_full_name := null;
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, v_full_name);
  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

insert into public.profiles (id, full_name)
select account.id, case
  when char_length(btrim(coalesce(account.raw_user_meta_data ->> 'full_name', ''))) between 2 and 100
    then btrim(account.raw_user_meta_data ->> 'full_name')
  else null
end
from auth.users as account
on conflict (id) do nothing;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;

revoke all on table public.teams, public.team_members, public.team_invitations from public, anon, authenticated;
grant select on table public.teams, public.team_members, public.team_invitations to authenticated;

create schema if not exists rs_internal;
revoke all on schema rs_internal from public, anon;
grant usage on schema rs_internal to authenticated;

create function rs_internal.is_active_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members as member
    where member.team_id = p_team_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  );
$$;

create function rs_internal.is_active_team_captain(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members as member
    where member.team_id = p_team_id
      and member.user_id = (select auth.uid())
      and member.role = 'captain'
      and member.status = 'active'
  );
$$;

create function rs_internal.has_pending_team_invitation(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_invitations as invitation
    where invitation.team_id = p_team_id
      and invitation.invited_user_id = (select auth.uid())
      and invitation.status = 'pending'
  );
$$;

revoke all on function rs_internal.is_active_team_member(uuid) from public, anon;
revoke all on function rs_internal.is_active_team_captain(uuid) from public, anon;
revoke all on function rs_internal.has_pending_team_invitation(uuid) from public, anon;
grant execute on function rs_internal.is_active_team_member(uuid) to authenticated;
grant execute on function rs_internal.is_active_team_captain(uuid) to authenticated;
grant execute on function rs_internal.has_pending_team_invitation(uuid) to authenticated;

create policy "Members and invitees can view team details"
  on public.teams
  for select
  to authenticated
  using (rs_internal.is_active_team_member(id) or rs_internal.has_pending_team_invitation(id));

create policy "Users can view their own roster row and teammates"
  on public.team_members
  for select
  to authenticated
  using (user_id = (select auth.uid()) or rs_internal.is_active_team_member(team_id));

create policy "Invited users and their captain can view invitations"
  on public.team_invitations
  for select
  to authenticated
  using (
    invited_user_id = (select auth.uid())
    or (invited_by = (select auth.uid()) and rs_internal.is_active_team_captain(team_id))
  );

create function public.set_team_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_teams_updated_at
  before update on public.teams
  for each row execute function public.set_team_updated_at();

revoke all on function public.set_team_updated_at() from public, anon, authenticated;

create function public.get_team_roster(p_team_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  full_name text,
  ign text,
  free_fire_uid text,
  role text,
  slot smallint,
  status text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_active_team_member(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_ACCESS_DENIED';
  end if;

  return query
    select member.id, member.user_id, coalesce(profile.full_name, 'Player'),
      member.ign, member.free_fire_uid, member.role, member.slot, member.status, member.joined_at
    from public.team_members as member
    left join public.profiles as profile on profile.id = member.user_id
    where member.team_id = p_team_id and member.status = 'active'
    order by member.slot;
end;
$$;

create function public.get_team_invitations(p_team_id uuid)
returns table (
  invitation_id uuid,
  invited_user_id uuid,
  invited_user_name text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_ACCESS_DENIED';
  end if;

  return query
    select invitation.id, invitation.invited_user_id,
      coalesce(profile.full_name, 'Player'), invitation.role, invitation.status, invitation.created_at
    from public.team_invitations as invitation
    left join public.profiles as profile on profile.id = invitation.invited_user_id
    where invitation.team_id = p_team_id
    order by invitation.created_at desc;
end;
$$;

create function public.get_my_team_invitations()
returns table (
  invitation_id uuid,
  team_id uuid,
  team_name text,
  logo_path text,
  role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select invitation.id, team.id, team.name, team.logo_path, invitation.role, invitation.created_at
  from public.team_invitations as invitation
  join public.teams as team on team.id = invitation.team_id
  where invitation.invited_user_id = (select auth.uid())
    and invitation.status = 'pending'
  order by invitation.created_at desc;
$$;

create function public.create_team(
  p_name text,
  p_ign text,
  p_free_fire_uid text,
  p_description text default null,
  p_region text default null
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
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 3 and 40 or p_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_NAME';
  end if;
  if p_ign is null or char_length(btrim(p_ign)) not between 2 and 32 or p_ign ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_IGN';
  end if;
  if p_free_fire_uid is null or p_free_fire_uid !~ '^[0-9]{5,20}$' then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;
  if p_description is not null and char_length(p_description) > 1000 then
    raise exception using errcode = '22023', message = 'DESCRIPTION_TOO_LONG';
  end if;
  if p_region is not null and char_length(p_region) > 100 then
    raise exception using errcode = '22023', message = 'REGION_TOO_LONG';
  end if;
  if exists (
    select 1 from public.team_members as member
    where member.user_id = v_user_id and member.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'ACTIVE_TEAM_EXISTS';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = v_user_id and profile.full_name is not null
  ) then
    raise exception using errcode = 'P0002', message = 'PROFILE_NAME_REQUIRED';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'team'; end if;
  v_slug := left(v_slug, 48) || '-' || left(v_team_id::text, 12);

  insert into public.teams (id, name, slug, description, region)
  values (v_team_id, btrim(p_name), v_slug, nullif(btrim(p_description), ''), nullif(btrim(p_region), ''));

  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team_id, v_user_id, btrim(p_ign), p_free_fire_uid, 'captain', 1);

  return v_team_id;
end;
$$;

create function public.update_team(
  p_team_id uuid,
  p_name text,
  p_description text,
  p_region text,
  p_logo_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.teams where id = p_team_id for update;
  if not found or not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_ACCESS_DENIED';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 3 and 40 or p_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_NAME';
  end if;
  if p_description is not null and char_length(p_description) > 1000 then
    raise exception using errcode = '22023', message = 'DESCRIPTION_TOO_LONG';
  end if;
  if p_region is not null and char_length(p_region) > 100 then
    raise exception using errcode = '22023', message = 'REGION_TOO_LONG';
  end if;
  if p_logo_path is not null and (
    (storage.foldername(p_logo_path))[1] <> p_team_id::text
    or (storage.foldername(p_logo_path))[2] <> (select auth.uid())::text
    or (storage.foldername(p_logo_path))[3] is not null
    or not exists (
      select 1 from storage.objects as object
      where object.bucket_id = 'team-logos' and object.name = p_logo_path
    )
  ) then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_LOGO_PATH';
  end if;

  update public.teams
  set name = btrim(p_name), description = nullif(btrim(p_description), ''),
      region = nullif(btrim(p_region), ''), logo_path = coalesce(p_logo_path, logo_path)
  where id = p_team_id;
end;
$$;

create function public.invite_team_member(p_team_id uuid, p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invited_user_id uuid;
  v_invitation_id uuid := gen_random_uuid();
  v_active_total integer;
  v_pending_total integer;
  v_active_starters integer;
  v_pending_starters integer;
  v_active_substitutes integer;
  v_pending_substitutes integer;
begin
  perform 1 from public.teams where id = p_team_id for update;
  if not found or not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_ACCESS_DENIED';
  end if;
  if p_email is null or char_length(btrim(p_email)) > 254 or position('@' in btrim(p_email)) < 2 then
    raise exception using errcode = '22023', message = 'INVALID_EMAIL';
  end if;
  if p_role is null or p_role not in ('starting_player', 'substitute') then
    raise exception using errcode = '22023', message = 'INVALID_TEAM_ROLE';
  end if;

  select account.id into v_invited_user_id
  from auth.users as account
  where lower(account.email) = lower(btrim(p_email))
    and account.email_confirmed_at is not null;
  if v_invited_user_id is null then
    raise exception using errcode = 'P0002', message = 'PLAYER_NOT_FOUND';
  end if;
  if v_invited_user_id = (select auth.uid()) then
    raise exception using errcode = '22023', message = 'CANNOT_INVITE_SELF';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = v_invited_user_id and profile.full_name is not null
  ) then
    raise exception using errcode = 'P0002', message = 'PLAYER_PROFILE_INCOMPLETE';
  end if;
  if exists (
    select 1 from public.team_members as member
    where member.user_id = v_invited_user_id and member.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'PLAYER_ALREADY_ON_ACTIVE_TEAM';
  end if;
  if exists (
    select 1 from public.team_invitations as invitation
    where invitation.team_id = p_team_id
      and invitation.invited_user_id = v_invited_user_id
      and invitation.status = 'pending'
  ) then
    raise exception using errcode = '23505', message = 'INVITATION_ALREADY_PENDING';
  end if;

  select count(*) into v_active_total from public.team_members
  where team_id = p_team_id and status = 'active';
  select count(*) into v_pending_total from public.team_invitations
  where team_id = p_team_id and status = 'pending';
  select count(*) into v_active_starters from public.team_members
  where team_id = p_team_id and status = 'active' and role in ('captain', 'starting_player');
  select count(*) into v_pending_starters from public.team_invitations
  where team_id = p_team_id and status = 'pending' and role = 'starting_player';
  select count(*) into v_active_substitutes from public.team_members
  where team_id = p_team_id and status = 'active' and role = 'substitute';
  select count(*) into v_pending_substitutes from public.team_invitations
  where team_id = p_team_id and status = 'pending' and role = 'substitute';

  if v_active_total + v_pending_total >= 5 then
    raise exception using errcode = '23514', message = 'TEAM_ROSTER_FULL';
  end if;
  if p_role = 'starting_player' and v_active_starters + v_pending_starters >= 4 then
    raise exception using errcode = '23514', message = 'STARTING_LINEUP_FULL';
  end if;
  if p_role = 'substitute' and v_active_substitutes + v_pending_substitutes >= 1 then
    raise exception using errcode = '23514', message = 'SUBSTITUTE_SLOT_FULL';
  end if;

  insert into public.team_invitations (id, team_id, invited_user_id, invited_by, role)
  values (v_invitation_id, p_team_id, v_invited_user_id, (select auth.uid()), p_role);
  return v_invitation_id;
end;
$$;

create function public.respond_to_team_invitation(
  p_invitation_id uuid,
  p_accept boolean,
  p_ign text default null,
  p_free_fire_uid text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_role text;
  v_active_count integer;
  v_slot smallint;
begin
  select invitation.team_id into v_team_id
  from public.team_invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.invited_user_id = (select auth.uid())
    and invitation.status = 'pending';
  if v_team_id is null then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;
  if p_accept is null then
    raise exception using errcode = '22023', message = 'INVALID_INVITATION_RESPONSE';
  end if;

  perform 1 from public.teams where id = v_team_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;

  select invitation.role into v_role
  from public.team_invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.invited_user_id = (select auth.uid())
    and invitation.status = 'pending'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;

  if not p_accept then
    update public.team_invitations
    set status = 'rejected', responded_at = now()
    where id = p_invitation_id;
    return;
  end if;

  if p_ign is null or char_length(btrim(p_ign)) not between 2 and 32 or p_ign ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'INVALID_PLAYER_IGN';
  end if;
  if p_free_fire_uid is null or p_free_fire_uid !~ '^[0-9]{5,20}$' then
    raise exception using errcode = '22023', message = 'INVALID_FREE_FIRE_UID';
  end if;
  if exists (
    select 1 from public.team_members as member
    where member.user_id = (select auth.uid()) and member.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'PLAYER_ALREADY_ON_ACTIVE_TEAM';
  end if;

  select count(*) into v_active_count from public.team_members
  where team_id = v_team_id and status = 'active';
  if v_active_count >= 5 then
    raise exception using errcode = '23514', message = 'TEAM_ROSTER_FULL';
  end if;

  if v_role = 'starting_player' then
    if (select count(*) from public.team_members
        where team_id = v_team_id and status = 'active' and role in ('captain', 'starting_player')) >= 4 then
      raise exception using errcode = '23514', message = 'STARTING_LINEUP_FULL';
    end if;
    select slots.slot_number::smallint into v_slot
    from generate_series(2, 4) as slots(slot_number)
    where not exists (
      select 1 from public.team_members as member
      where member.team_id = v_team_id and member.status = 'active' and member.slot = slots.slot_number
    )
    order by slots.slot_number limit 1;
    if v_slot is null then
      raise exception using errcode = '23514', message = 'STARTING_LINEUP_FULL';
    end if;
  else
    if exists (
      select 1 from public.team_members
      where team_id = v_team_id and status = 'active' and role = 'substitute'
    ) then
      raise exception using errcode = '23514', message = 'SUBSTITUTE_SLOT_FULL';
    end if;
    v_slot := 5;
  end if;

  insert into public.team_members (team_id, user_id, ign, free_fire_uid, role, slot)
  values (v_team_id, (select auth.uid()), btrim(p_ign), p_free_fire_uid, v_role, v_slot);

  update public.team_invitations
  set status = 'accepted', responded_at = now()
  where id = p_invitation_id;
end;
$$;

create function public.cancel_team_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  select invitation.team_id into v_team_id
  from public.team_invitations as invitation
  where invitation.id = p_invitation_id and invitation.status = 'pending';
  if v_team_id is null then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;

  perform 1 from public.teams where id = v_team_id for update;
  if not found or not rs_internal.is_active_team_captain(v_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_ACCESS_DENIED';
  end if;

  update public.team_invitations
  set status = 'cancelled', responded_at = now()
  where id = p_invitation_id and team_id = v_team_id and status = 'pending';
  if not found then
    raise exception using errcode = 'P0002', message = 'INVITATION_UNAVAILABLE';
  end if;
end;
$$;

create function public.remove_team_member(p_team_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.teams where id = p_team_id for update;
  if not found or not rs_internal.is_active_team_captain(p_team_id) then
    raise exception using errcode = '42501', message = 'TEAM_ACCESS_DENIED';
  end if;

  update public.team_members
  set status = 'removed'
  where id = p_member_id
    and team_id = p_team_id
    and role <> 'captain'
    and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'MEMBER_UNAVAILABLE';
  end if;
end;
$$;

revoke all on function public.get_team_roster(uuid) from public, anon;
revoke all on function public.get_team_invitations(uuid) from public, anon;
revoke all on function public.get_my_team_invitations() from public, anon;
revoke all on function public.create_team(text, text, text, text, text) from public, anon;
revoke all on function public.update_team(uuid, text, text, text, text) from public, anon;
revoke all on function public.invite_team_member(uuid, text, text) from public, anon;
revoke all on function public.respond_to_team_invitation(uuid, boolean, text, text) from public, anon;
revoke all on function public.cancel_team_invitation(uuid) from public, anon;
revoke all on function public.remove_team_member(uuid, uuid) from public, anon;
grant execute on function public.get_team_roster(uuid) to authenticated;
grant execute on function public.get_team_invitations(uuid) to authenticated;
grant execute on function public.get_my_team_invitations() to authenticated;
grant execute on function public.create_team(text, text, text, text, text) to authenticated;
grant execute on function public.update_team(uuid, text, text, text, text) to authenticated;
grant execute on function public.invite_team_member(uuid, text, text) to authenticated;
grant execute on function public.respond_to_team_invitation(uuid, boolean, text, text) to authenticated;
grant execute on function public.cancel_team_invitation(uuid) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets as bucket
    where bucket.id = 'team-logos'
      and bucket.public = false
      and bucket.file_size_limit = 2097152
      and bucket.allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  ) then
    raise exception 'The team-logos bucket already exists with unexpected settings. Review and configure it as private, 2 MB, PNG/JPEG/WEBP before applying this migration.';
  end if;
end;
$$;

create policy "Team members and invitees can view team logos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[2] is not null
    and (storage.foldername(name))[3] is null
    and (
      exists (
        select 1 from public.team_members as member
        where member.team_id::text = (storage.foldername(name))[1]
          and member.user_id = (select auth.uid())
          and member.status = 'active'
      )
      or exists (
        select 1 from public.team_invitations as invitation
        where invitation.team_id::text = (storage.foldername(name))[1]
          and invitation.invited_user_id = (select auth.uid())
          and invitation.status = 'pending'
      )
    )
  );

create policy "Active captains can upload team logos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (storage.foldername(name))[3] is null
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
    and metadata ->> 'mimetype' in ('image/png', 'image/jpeg', 'image/webp')
    and coalesce((metadata ->> 'size')::bigint, 2097153) <= 2097152
    and exists (
      select 1 from public.team_members as member
      where member.team_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
        and member.role = 'captain'
        and member.status = 'active'
    )
  );

create policy "Active captains can delete team logos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'team-logos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (storage.foldername(name))[3] is null
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
    and metadata ->> 'mimetype' in ('image/png', 'image/jpeg', 'image/webp')
    and coalesce((metadata ->> 'size')::bigint, 2097153) <= 2097152
    and exists (
      select 1 from public.team_members as member
      where member.team_id::text = (storage.foldername(name))[1]
        and member.user_id = (select auth.uid())
        and member.role = 'captain'
        and member.status = 'active'
    )
  );

commit;