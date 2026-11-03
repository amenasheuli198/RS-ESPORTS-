begin;

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text not null check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  subject text not null check (char_length(btrim(subject)) between 3 and 180),
  category text not null check (category in ('general', 'account_login', 'team_management', 'tournament_registration', 'match_issues', 'results_scoring', 'technical', 'other')),
  message text not null check (char_length(btrim(message)) between 20 and 5000),
  created_at timestamptz not null default now(),
  reviewed boolean not null default false
);

create index contact_requests_created_idx
  on public.contact_requests (created_at desc);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique check (ticket_number ~ '^RSK-[A-Z0-9-]+$'),
  user_id uuid references auth.users (id) on delete set null,
  subject text not null check (char_length(btrim(subject)) between 3 and 180),
  category text not null check (category in ('account_login', 'team_management', 'tournament_registration', 'match_issues', 'room_access', 'results_scoring', 'payment', 'technical', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_for_user', 'resolved', 'closed')),
  assigned_admin_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_user_status_idx
  on public.support_tickets (user_id, status, created_at desc);

create index support_tickets_admin_idx
  on public.support_tickets (assigned_admin_id, status);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  is_internal_note boolean not null default false,
  created_at timestamptz not null default now()
);

create index support_messages_ticket_created_idx
  on public.support_messages (ticket_id, created_at asc);

create table public.tournament_disputes (
  id uuid primary key default gen_random_uuid(),
  dispute_reference text not null unique check (dispute_reference ~ '^RSD-[A-Z0-9-]+$'),
  tournament_id uuid references public.tournaments (id) on delete set null,
  match_id uuid references public.matches (id) on delete set null,
  registration_id uuid references public.tournament_registrations (id) on delete set null,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('match_results', 'kill_count', 'placement', 'player_eligibility', 'team_roster', 'match_scheduling', 'room_access', 'rule_violation', 'other')),
  description text not null check (char_length(btrim(description)) between 20 and 5000),
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'awaiting_evidence', 'accepted', 'rejected', 'resolved')),
  assigned_admin_id uuid references auth.users (id) on delete set null,
  decision text check (decision is null or char_length(decision) between 2 and 200),
  decision_reason text check (decision_reason is null or char_length(decision_reason) between 5 and 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tournament_disputes_status_idx
  on public.tournament_disputes (status, created_at desc);

create index tournament_disputes_tournament_idx
  on public.tournament_disputes (tournament_id, status, created_at desc);

create table public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.tournament_disputes (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete cascade,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 180),
  bucket_name text not null check (bucket_name = 'support-evidence'),
  object_path text not null check (char_length(btrim(object_path)) between 8 and 500),
  content_type text not null check (content_type ~ '^[A-Za-z0-9.+\-]+/[A-Za-z0-9.+\-]+$'),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index dispute_evidence_dispute_idx
  on public.dispute_evidence (dispute_id, created_at desc);

alter table public.contact_requests enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.tournament_disputes enable row level security;
alter table public.dispute_evidence enable row level security;

revoke all on table public.contact_requests, public.support_tickets, public.support_messages, public.tournament_disputes, public.dispute_evidence from public, anon, authenticated;

grant insert on table public.contact_requests to anon, authenticated;
grant select on table public.contact_requests to authenticated;

grant select on table public.support_tickets, public.support_messages, public.tournament_disputes, public.dispute_evidence to authenticated;

grant insert, update on table public.support_tickets, public.support_messages to authenticated;
grant insert, update on table public.tournament_disputes to authenticated;
grant insert on table public.dispute_evidence to authenticated;

create function public.set_support_updated_at()
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

create trigger set_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.set_support_updated_at();

create trigger set_disputes_updated_at
  before update on public.tournament_disputes
  for each row execute function public.set_support_updated_at();

revoke all on function public.set_support_updated_at() from public, anon, authenticated;

create function public.save_contact_request(
  p_name text,
  p_email text,
  p_subject text,
  p_message text,
  p_category text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_category text := coalesce(p_category, 'general');
  v_id uuid;
begin
  if char_length(v_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'INVALID_NAME';
  end if;
  if v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception using errcode = '22023', message = 'INVALID_EMAIL';
  end if;
  if char_length(v_subject) not between 3 and 180 then
    raise exception using errcode = '22023', message = 'INVALID_SUBJECT';
  end if;
  if char_length(v_message) not between 20 and 5000 then
    raise exception using errcode = '22023', message = 'INVALID_MESSAGE';
  end if;
  if v_category not in ('general', 'account_login', 'team_management', 'tournament_registration', 'match_issues', 'results_scoring', 'technical', 'other') then
    raise exception using errcode = '22023', message = 'INVALID_CATEGORY';
  end if;

  v_id := gen_random_uuid();
  insert into public.contact_requests (id, name, email, subject, message, category)
  values (v_id, v_name, v_email, v_subject, v_message, v_category);
  return v_id;
end;
$$;

revoke all on function public.save_contact_request(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.save_contact_request(text, text, text, text, text) to anon, authenticated;

create function public.create_support_ticket(
  p_subject text,
  p_category text,
  p_priority text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_subject text := btrim(coalesce(p_subject, ''));
  v_category text := coalesce(p_category, 'other');
  v_priority text := coalesce(p_priority, 'normal');
  v_message text := btrim(coalesce(p_message, ''));
  v_ticket_id uuid;
  v_ticket_number text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if char_length(v_subject) not between 3 and 180 then
    raise exception using errcode = '22023', message = 'INVALID_SUBJECT';
  end if;
  if v_category not in ('account_login', 'team_management', 'tournament_registration', 'match_issues', 'room_access', 'results_scoring', 'payment', 'technical', 'other') then
    raise exception using errcode = '22023', message = 'INVALID_CATEGORY';
  end if;
  if v_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception using errcode = '22023', message = 'INVALID_PRIORITY';
  end if;
  if char_length(v_message) not between 10 and 5000 then
    raise exception using errcode = '22023', message = 'INVALID_MESSAGE';
  end if;

  v_ticket_number := 'RSK-' || upper(substr(md5(random()::text), 1, 8));
  v_ticket_id := gen_random_uuid();

  insert into public.support_tickets (id, ticket_number, user_id, subject, category, priority, status)
  values (v_ticket_id, v_ticket_number, v_user_id, v_subject, v_category, v_priority, 'open');

  insert into public.support_messages (ticket_id, sender_id, message)
  values (v_ticket_id, v_user_id, v_message);

  return v_ticket_id;
end;
$$;

revoke all on function public.create_support_ticket(text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_support_ticket(text, text, text, text) to authenticated;

create function public.add_support_message(
  p_ticket_id uuid,
  p_message text,
  p_is_internal_note boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_message text := btrim(coalesce(p_message, ''));
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_ticket_id is null or not exists (select 1 from public.support_tickets where id = p_ticket_id) then
    raise exception using errcode = 'P0002', message = 'TICKET_NOT_FOUND';
  end if;
  if char_length(v_message) < 1 or char_length(v_message) > 5000 then
    raise exception using errcode = '22023', message = 'INVALID_MESSAGE';
  end if;
  if p_is_internal_note and not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;

  if not rs_internal.is_tournament_admin() and not exists (
    select 1 from public.support_tickets where id = p_ticket_id and user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;

  v_id := gen_random_uuid();
  insert into public.support_messages (id, ticket_id, sender_id, message, is_internal_note)
  values (v_id, p_ticket_id, v_user_id, v_message, p_is_internal_note);

  update public.support_tickets set updated_at = now() where id = p_ticket_id;
  return v_id;
end;
$$;

revoke all on function public.add_support_message(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.add_support_message(uuid, text, boolean) to authenticated;

create function public.set_support_ticket_status(
  p_ticket_id uuid,
  p_status text,
  p_assigned_admin_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_status not in ('open', 'in_progress', 'waiting_for_user', 'resolved', 'closed') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;

  update public.support_tickets set
    status = p_status,
    assigned_admin_id = p_assigned_admin_id,
    updated_at = now()
  where id = p_ticket_id;
end;
$$;

revoke all on function public.set_support_ticket_status(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_support_ticket_status(uuid, text, uuid) to authenticated;

create function public.create_tournament_dispute(
  p_tournament_id uuid,
  p_match_id uuid,
  p_registration_id uuid,
  p_category text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_category text := coalesce(p_category, 'other');
  v_description text := btrim(coalesce(p_description, ''));
  v_id uuid;
  v_reference text;
  v_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if v_category not in ('match_results', 'kill_count', 'placement', 'player_eligibility', 'team_roster', 'match_scheduling', 'room_access', 'rule_violation', 'other') then
    raise exception using errcode = '22023', message = 'INVALID_DISPUTE_CATEGORY';
  end if;
  if char_length(v_description) not between 20 and 5000 then
    raise exception using errcode = '22023', message = 'INVALID_DISPUTE_DESCRIPTION';
  end if;

  if p_tournament_id is not null and not exists (
    select 1 from public.tournaments where id = p_tournament_id and publication_status = 'published'
  ) then
    raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND';
  end if;

  select count(*) into v_count
  from public.tournament_disputes
  where submitted_by = v_user_id and coalesce(tournament_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_tournament_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(match_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_match_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and status in ('submitted', 'under_review', 'awaiting_evidence');

  if v_count > 0 then
    raise exception using errcode = '23505', message = 'DUPLICATE_ACTIVE_DISPUTE';
  end if;

  v_reference := 'RSD-' || upper(substr(md5(random()::text), 1, 10));
  v_id := gen_random_uuid();

  insert into public.tournament_disputes (
    id, dispute_reference, tournament_id, match_id, registration_id, submitted_by, category, description, status
  ) values (
    v_id, v_reference, p_tournament_id, p_match_id, p_registration_id, v_user_id, v_category, v_description, 'submitted'
  );

  return v_id;
end;
$$;

revoke all on function public.create_tournament_dispute(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_tournament_dispute(uuid, uuid, uuid, text, text) to authenticated;

create function public.set_dispute_status(
  p_dispute_id uuid,
  p_status text,
  p_decision text default null,
  p_decision_reason text default null,
  p_assigned_admin_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rs_internal.is_tournament_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_status not in ('submitted', 'under_review', 'awaiting_evidence', 'accepted', 'rejected', 'resolved') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;

  update public.tournament_disputes set
    status = p_status,
    assigned_admin_id = p_assigned_admin_id,
    decision = p_decision,
    decision_reason = p_decision_reason,
    resolved_at = case when p_status = 'resolved' then coalesce(resolved_at, now()) else null end,
    updated_at = now()
  where id = p_dispute_id;
end;
$$;

revoke all on function public.set_dispute_status(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.set_dispute_status(uuid, text, text, text, uuid) to authenticated;

create function public.add_dispute_evidence(
  p_dispute_id uuid,
  p_file_name text,
  p_bucket_name text,
  p_object_path text,
  p_content_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_dispute_id is null or not exists (select 1 from public.tournament_disputes where id = p_dispute_id) then
    raise exception using errcode = 'P0002', message = 'DISPUTE_NOT_FOUND';
  end if;
  if not rs_internal.is_tournament_admin() and not exists (
    select 1 from public.tournament_disputes where id = p_dispute_id and submitted_by = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;
  if p_bucket_name <> 'support-evidence' then
    raise exception using errcode = '22023', message = 'INVALID_BUCKET';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 10485760 then
    raise exception using errcode = '22023', message = 'INVALID_FILE_SIZE';
  end if;

  v_id := gen_random_uuid();
  insert into public.dispute_evidence (id, dispute_id, uploaded_by, file_name, bucket_name, object_path, content_type, size_bytes)
  values (v_id, p_dispute_id, v_user_id, p_file_name, p_bucket_name, p_object_path, p_content_type, p_size_bytes);
  return v_id;
end;
$$;

revoke all on function public.add_dispute_evidence(uuid, text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.add_dispute_evidence(uuid, text, text, text, text, bigint) to authenticated;

create policy "Anonymous contact submissions are allowed"
  on public.contact_requests
  for insert
  to anon, authenticated
  with check (true);

create policy "Admins can inspect contact requests"
  on public.contact_requests
  for select
  to authenticated
  using (rs_internal.is_tournament_admin());

create policy "Users can view their support tickets"
  on public.support_tickets
  for select
  to authenticated
  using (user_id = (select auth.uid()) or rs_internal.is_tournament_admin());

create policy "Users can create their own support tickets"
  on public.support_tickets
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can reply to their own tickets"
  on public.support_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.support_tickets where id = ticket_id and user_id = (select auth.uid())
    )
  );

create policy "Admins can manage all support tickets and messages"
  on public.support_tickets
  for all
  to authenticated
  using (rs_internal.is_tournament_admin())
  with check (rs_internal.is_tournament_admin());

create policy "Admins can manage all support messages"
  on public.support_messages
  for all
  to authenticated
  using (rs_internal.is_tournament_admin())
  with check (rs_internal.is_tournament_admin());

create policy "Users can view their own disputes"
  on public.tournament_disputes
  for select
  to authenticated
  using (submitted_by = (select auth.uid()) or rs_internal.is_tournament_admin());

create policy "Users can submit disputes"
  on public.tournament_disputes
  for insert
  to authenticated
  with check (submitted_by = (select auth.uid()));

create policy "Admins can manage all disputes"
  on public.tournament_disputes
  for all
  to authenticated
  using (rs_internal.is_tournament_admin())
  with check (rs_internal.is_tournament_admin());

create policy "Users can view their own dispute evidence"
  on public.dispute_evidence
  for select
  to authenticated
  using (uploaded_by = (select auth.uid()) or exists (
    select 1 from public.tournament_disputes as dispute
    where dispute.id = dispute_id and (dispute.submitted_by = (select auth.uid()) or rs_internal.is_tournament_admin())
  ));

create policy "Users can upload evidence for their own disputes"
  on public.dispute_evidence
  for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.tournament_disputes where id = dispute_id and submitted_by = (select auth.uid())
    )
  );

create policy "Admins can manage all evidence"
  on public.dispute_evidence
  for all
  to authenticated
  using (rs_internal.is_tournament_admin())
  with check (rs_internal.is_tournament_admin());

commit;
