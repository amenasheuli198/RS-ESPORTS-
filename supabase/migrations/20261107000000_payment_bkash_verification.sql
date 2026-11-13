begin;

create schema if not exists rs_internal;
revoke all on schema rs_internal from public, anon;
grant usage on schema rs_internal to authenticated;

create or replace function rs_internal.has_platform_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
    when 'super_admin' then p_permission in (
      'manage_platform',
      'manage_tournaments',
      'manage_payments',
      'view_payments',
      'review_payments',
      'manage_refunds',
      'manage_support',
      'manage_settings'
    )
    when 'admin' then p_permission in (
      'manage_tournaments',
      'manage_payments',
      'view_payments',
      'review_payments',
      'manage_refunds',
      'manage_support'
    )
    when 'payment_reviewer' then p_permission in (
      'view_payments',
      'review_payments',
      'manage_refunds'
    )
    else false
  end;
$$;

revoke all on function rs_internal.has_platform_permission(text) from public, anon;
grant execute on function rs_internal.has_platform_permission(text) to authenticated;

create or replace function rs_internal.is_payment_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select rs_internal.has_platform_permission('review_payments');
$$;

revoke all on function rs_internal.is_payment_reviewer() from public, anon;
grant execute on function rs_internal.is_payment_reviewer() to authenticated;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete restrict,
  registration_id uuid not null references public.tournament_registrations (id) on delete restrict,
  payer_user_id uuid not null references auth.users (id) on delete restrict,
  payment_method text not null default 'bkash' check (payment_method = 'bkash'),
  sender_phone text not null check (sender_phone ~ '^\+?[1-9][0-9]{6,14}$'),
  receiver_phone text not null default '01845278579' check (receiver_phone ~ '^[0-9]{11}$'),
  txid text not null check (char_length(btrim(txid)) between 5 and 80),
  normalized_txid text not null unique check (normalized_txid ~ '^[A-Z0-9]{5,80}$'),
  submitted_amount numeric(12, 2) not null check (submitted_amount > 0),
  expected_amount numeric(12, 2) not null check (expected_amount > 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'refund_pending', 'partially_refunded', 'refunded')),
  submitted_at timestamptz not null default now(),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(btrim(rejection_reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id),
  check (submitted_amount = expected_amount),
  check (status not in ('approved', 'rejected', 'refund_pending', 'partially_refunded', 'refunded') or (verified_by is not null and verified_at is not null))
);

create unique index if not exists payments_txid_global_unique on public.payments (normalized_txid);
create unique index if not exists payments_one_payment_per_registration on public.payments (registration_id);
create index if not exists payments_status_idx on public.payments (status, submitted_at desc);
create index if not exists payments_payer_idx on public.payments (payer_user_id, submitted_at desc);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  previous_status text,
  new_status text not null,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (char_length(btrim(action)) between 2 and 120),
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists payment_events_payment_created_idx on public.payment_events (payment_id, created_at desc);

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  storage_bucket text not null default 'payment-proofs' check (storage_bucket = 'payment-proofs'),
  storage_path text not null unique check (char_length(btrim(storage_path)) between 8 and 500),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 180),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  file_size bigint not null check (file_size between 1 and 10485760),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  refund_amount numeric(12, 2) not null check (refund_amount > 0),
  currency text not null default 'BDT' check (currency = 'BDT'),
  refund_method text not null default 'bkash' check (refund_method = 'bkash'),
  refund_txid text not null check (char_length(btrim(refund_txid)) between 5 and 80),
  normalized_refund_txid text not null unique check (normalized_refund_txid ~ '^[A-Z0-9]{5,80}$'),
  refund_reason text not null check (char_length(btrim(refund_reason)) between 5 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'processing', 'completed', 'failed')),
  initiated_by uuid not null references auth.users (id) on delete restrict,
  approved_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('approved', 'processing', 'completed', 'failed') or approved_by is not null)
);

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.payment_refunds enable row level security;

revoke all on table public.payments, public.payment_events, public.payment_proofs, public.payment_refunds from public, anon, authenticated;

grant select on public.payments, public.payment_events, public.payment_proofs, public.payment_refunds to authenticated;

create policy "Players can read their own payment records" on public.payments for select to authenticated using (payer_user_id = (select auth.uid()));
create policy "Payment reviewers can read all payment records" on public.payments for select to authenticated using (rs_internal.is_payment_reviewer());

create policy "Players can read their own payment events" on public.payment_events for select to authenticated using (
  exists (
    select 1 from public.payments as payment
    where payment.id = payment_id and payment.payer_user_id = (select auth.uid())
  )
);
create policy "Payment reviewers can read all payment events" on public.payment_events for select to authenticated using (rs_internal.is_payment_reviewer());

create policy "Players can read their own payment proof metadata" on public.payment_proofs for select to authenticated using (
  uploaded_by = (select auth.uid())
  or exists (
    select 1 from public.payments as payment
    where payment.id = payment_id and payment.payer_user_id = (select auth.uid())
  )
);
create policy "Payment reviewers can read payment proof metadata" on public.payment_proofs for select to authenticated using (rs_internal.is_payment_reviewer());

create policy "Players can read their own refund records" on public.payment_refunds for select to authenticated using (initiated_by = (select auth.uid()));
create policy "Payment reviewers can read all refund records" on public.payment_refunds for select to authenticated using (rs_internal.is_payment_reviewer());

create or replace function public.set_payment_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.ensure_payment_registration_matches()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_registration_tournament uuid;
begin
  select tournament_id into v_registration_tournament
  from public.tournament_registrations
  where id = new.registration_id;

  if v_registration_tournament is null then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;

  if v_registration_tournament <> new.tournament_id then
    raise exception using errcode = '23514', message = 'PAYMENT_REGISTRATION_TOURNAMENT_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_payment_updated_at();

create trigger ensure_payment_registration_match
before insert or update on public.payments
for each row execute function public.ensure_payment_registration_matches();

create trigger set_refunds_updated_at
before update on public.payment_refunds
for each row execute function public.set_payment_updated_at();

revoke all on function public.set_payment_updated_at() from public, anon, authenticated;
revoke all on function public.ensure_payment_registration_matches() from public, anon, authenticated;

create or replace function public.submit_competition_payment(
  p_tournament_id uuid,
  p_registration_id uuid,
  p_sender_phone text,
  p_txid text,
  p_submitted_amount numeric,
  p_proof_path text default null,
  p_proof_type text default null,
  p_proof_size bigint default null,
  p_proof_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tournament public.tournaments%rowtype;
  v_registration public.tournament_registrations%rowtype;
  v_existing_payment public.payments%rowtype;
  v_sender text;
  v_txid text;
  v_expected_amount numeric(12, 2);
  v_payment_id uuid;
  v_folder text[];
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_tournament_id is null or p_registration_id is null then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_CONTEXT';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'TOURNAMENT_NOT_FOUND';
  end if;

  select * into v_registration
  from public.tournament_registrations
  where id = p_registration_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;

  if v_registration.tournament_id <> p_tournament_id then
    raise exception using errcode = '23514', message = 'PAYMENT_REGISTRATION_TOURNAMENT_MISMATCH';
  end if;

  if v_registration.registered_by <> v_user_id and not rs_internal.is_active_team_captain(v_registration.team_id) then
    raise exception using errcode = '42501', message = 'PAYMENT_OWNER_REQUIRED';
  end if;

  if v_tournament.entry_type <> 'paid' then
    raise exception using errcode = '23514', message = 'PAYMENT_NOT_REQUIRED';
  end if;

  v_expected_amount := v_tournament.entry_fee;

  if p_submitted_amount is null or p_submitted_amount <> v_expected_amount then
    raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  v_sender := regexp_replace(btrim(coalesce(p_sender_phone, '')), '[[:space:]()-]', '', 'g');
  if v_sender is null or v_sender !~ '^\+?[1-9][0-9]{6,14}$' then
    raise exception using errcode = '22023', message = 'INVALID_SENDER_PHONE';
  end if;

  v_txid := upper(regexp_replace(btrim(coalesce(p_txid, '')), '[^A-Za-z0-9]', '', 'g'));
  if char_length(v_txid) not between 5 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_TXID';
  end if;

  if exists (
    select 1 from public.payments
    where registration_id = p_registration_id and status in ('pending', 'approved', 'refund_pending', 'partially_refunded')
  ) then
    raise exception using errcode = '23505', message = 'PAYMENT_ALREADY_EXISTS_FOR_REGISTRATION';
  end if;

  if exists (select 1 from public.payments where normalized_txid = upper(v_txid)) then
    raise exception using errcode = '23505', message = 'TXID_ALREADY_USED';
  end if;

  if p_proof_path is not null then
    if p_proof_type is null or p_proof_size is null or p_proof_name is null then
      raise exception using errcode = '22023', message = 'PAYMENT_PROOF_METADATA_REQUIRED';
    end if;

    if p_proof_type not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf') then
      raise exception using errcode = '22023', message = 'INVALID_PROOF_TYPE';
    end if;

    if p_proof_size < 1 or p_proof_size > 10485760 then
      raise exception using errcode = '22023', message = 'INVALID_PROOF_SIZE';
    end if;

    v_folder := storage.foldername(p_proof_path);
    if array_length(v_folder, 1) < 2 or v_folder[1] <> p_registration_id::text or v_folder[2] <> v_user_id::text then
      raise exception using errcode = '22023', message = 'INVALID_PROOF_PATH';
    end if;

    if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_proof_path) then
      raise exception using errcode = '22023', message = 'PROOF_NOT_FOUND_IN_STORAGE';
    end if;
  end if;

  v_payment_id := gen_random_uuid();

  insert into public.payments (
    id,
    tournament_id,
    registration_id,
    payer_user_id,
    payment_method,
    sender_phone,
    receiver_phone,
    txid,
    normalized_txid,
    submitted_amount,
    expected_amount,
    currency,
    status,
    submitted_at,
    verified_by,
    verified_at,
    rejection_reason
  ) values (
    v_payment_id,
    p_tournament_id,
    p_registration_id,
    v_user_id,
    'bkash',
    v_sender,
    '01845278579',
    v_txid,
    upper(v_txid),
    p_submitted_amount,
    v_expected_amount,
    'BDT',
    'pending',
    now(),
    null,
    null,
    null
  );

  insert into public.payment_events (payment_id, previous_status, new_status, actor_user_id, action, reason, metadata)
  values (v_payment_id, null, 'pending', v_user_id, 'submitted', 'Payment submitted by player', jsonb_build_object('registration_id', p_registration_id, 'tournament_id', p_tournament_id));

  if p_proof_path is not null then
    insert into public.payment_proofs (payment_id, uploaded_by, storage_bucket, storage_path, file_name, mime_type, file_size)
    values (v_payment_id, v_user_id, 'payment-proofs', p_proof_path, p_proof_name, p_proof_type, p_proof_size);
  end if;

  return v_payment_id;
end;
$$;

revoke all on function public.submit_competition_payment(uuid, uuid, text, text, numeric, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.submit_competition_payment(uuid, uuid, text, text, numeric, text, text, bigint, text) to authenticated;

create or replace function public.approve_competition_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_payment public.payments%rowtype;
  v_registration public.tournament_registrations%rowtype;
  v_previous_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not rs_internal.is_payment_reviewer() then
    raise exception using errcode = '42501', message = 'PAYMENT_REVIEWER_REQUIRED';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.payer_user_id = v_user_id then
    raise exception using errcode = '42501', message = 'SELF_APPROVAL_FORBIDDEN';
  end if;

  if v_payment.status = 'approved' then
    raise exception using errcode = '23514', message = 'PAYMENT_ALREADY_APPROVED';
  end if;

  select * into v_registration
  from public.tournament_registrations
  where id = v_payment.registration_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;

  v_previous_status := v_payment.status;

  update public.payments
  set status = 'approved', verified_by = v_user_id, verified_at = now(), rejection_reason = null, updated_at = now()
  where id = p_payment_id;

  update public.tournament_registrations
  set status = 'approved', reviewed_by = v_user_id, reviewed_at = now(), rejection_reason = null, updated_at = now()
  where id = v_payment.registration_id;

  insert into public.payment_events (payment_id, previous_status, new_status, actor_user_id, action, reason, metadata)
  values (p_payment_id, v_previous_status, 'approved', v_user_id, 'approved', coalesce(p_reason, 'Approved by payment reviewer'), jsonb_build_object('reviewer_id', v_user_id));

  insert into public.tournament_registration_events (registration_id, from_status, to_status, actor_id, reason)
  values (v_payment.registration_id, v_registration.status, 'approved', v_user_id, coalesce(p_reason, 'Payment approved by reviewer'));
end;
$$;

revoke all on function public.approve_competition_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_competition_payment(uuid, text) to authenticated;

create or replace function public.reject_competition_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_payment public.payments%rowtype;
  v_registration public.tournament_registrations%rowtype;
  v_previous_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not rs_internal.is_payment_reviewer() then
    raise exception using errcode = '42501', message = 'PAYMENT_REVIEWER_REQUIRED';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode = '22023', message = 'REJECTION_REASON_REQUIRED';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.payer_user_id = v_user_id then
    raise exception using errcode = '42501', message = 'SELF_APPROVAL_FORBIDDEN';
  end if;

  select * into v_registration
  from public.tournament_registrations
  where id = v_payment.registration_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'REGISTRATION_NOT_FOUND';
  end if;

  v_previous_status := v_payment.status;

  update public.payments
  set status = 'rejected', verified_by = v_user_id, verified_at = now(), rejection_reason = p_reason, updated_at = now()
  where id = p_payment_id;

  update public.tournament_registrations
  set status = 'rejected', reviewed_by = v_user_id, reviewed_at = now(), rejection_reason = p_reason, updated_at = now()
  where id = v_payment.registration_id;

  insert into public.payment_events (payment_id, previous_status, new_status, actor_user_id, action, reason, metadata)
  values (p_payment_id, v_previous_status, 'rejected', v_user_id, 'rejected', p_reason, jsonb_build_object('reviewer_id', v_user_id));

  insert into public.tournament_registration_events (registration_id, from_status, to_status, actor_id, reason)
  values (v_payment.registration_id, v_registration.status, 'rejected', v_user_id, p_reason);
end;
$$;

revoke all on function public.reject_competition_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_competition_payment(uuid, text) to authenticated;

create or replace function public.initiate_competition_refund(p_payment_id uuid, p_refund_amount numeric, p_refund_txid text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_payment public.payments%rowtype;
  v_total_refunded numeric(12, 2) := 0;
  v_refund_id uuid;
  v_norm text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not rs_internal.is_payment_reviewer() then
    raise exception using errcode = '42501', message = 'PAYMENT_REVIEWER_REQUIRED';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status not in ('approved', 'partially_refunded', 'refund_pending') then
    raise exception using errcode = '23514', message = 'REFUND_NOT_ALLOWED_FOR_STATUS';
  end if;

  if p_refund_amount is null or p_refund_amount <= 0 then
    raise exception using errcode = '22023', message = 'INVALID_REFUND_AMOUNT';
  end if;

  select coalesce(sum(refund_amount), 0) into v_total_refunded
  from public.payment_refunds
  where payment_id = p_payment_id and status in ('pending', 'approved', 'processing', 'completed');

  if p_refund_amount + v_total_refunded > v_payment.submitted_amount then
    raise exception using errcode = '23514', message = 'REFUND_EXCEEDS_AVAILABLE_BALANCE';
  end if;

  v_norm := upper(regexp_replace(btrim(coalesce(p_refund_txid, '')), '[^A-Za-z0-9]', '', 'g'));
  if char_length(v_norm) not between 5 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_REFUND_TXID';
  end if;

  if exists (select 1 from public.payment_refunds where normalized_refund_txid = v_norm) then
    raise exception using errcode = '23505', message = 'DUPLICATE_REFUND_TXID';
  end if;

  v_refund_id := gen_random_uuid();

  insert into public.payment_refunds (
    id, payment_id, refund_amount, currency, refund_method, refund_txid, normalized_refund_txid, refund_reason, status, initiated_by, approved_by, completed_at
  ) values (
    v_refund_id,
    p_payment_id,
    p_refund_amount,
    'BDT',
    'bkash',
    v_norm,
    v_norm,
    p_reason,
    'pending',
    v_user_id,
    null,
    null
  );

  update public.payments
  set status = 'refund_pending', updated_at = now()
  where id = p_payment_id;

  insert into public.payment_events (payment_id, previous_status, new_status, actor_user_id, action, reason, metadata)
  values (p_payment_id, v_payment.status, 'refund_pending', v_user_id, 'refund_initiated', p_reason, jsonb_build_object('refund_amount', p_refund_amount));

  return v_refund_id;
end;
$$;

revoke all on function public.initiate_competition_refund(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.initiate_competition_refund(uuid, numeric, text, text) to authenticated;

create or replace function public.complete_competition_refund(p_refund_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_refund public.payment_refunds%rowtype;
  v_payment public.payments%rowtype;
  v_total_refunded numeric(12, 2);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if not rs_internal.is_payment_reviewer() then
    raise exception using errcode = '42501', message = 'PAYMENT_REVIEWER_REQUIRED';
  end if;

  select * into v_refund from public.payment_refunds where id = p_refund_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'REFUND_NOT_FOUND';
  end if;

  select * into v_payment from public.payments where id = v_refund.payment_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;

  if v_refund.status = 'completed' then
    raise exception using errcode = '23514', message = 'REFUND_ALREADY_COMPLETED';
  end if;

  update public.payment_refunds
  set status = 'completed', approved_by = v_user_id, completed_at = now(), updated_at = now()
  where id = p_refund_id;

  select coalesce(sum(refund_amount), 0) into v_total_refunded
  from public.payment_refunds
  where payment_id = v_payment.id and status in ('completed', 'processing', 'approved');

  if v_total_refunded >= v_payment.submitted_amount then
    update public.payments
    set status = 'refunded', updated_at = now()
    where id = v_payment.id;
  else
    update public.payments
    set status = 'partially_refunded', updated_at = now()
    where id = v_payment.id;
  end if;

  insert into public.payment_events (payment_id, previous_status, new_status, actor_user_id, action, reason, metadata)
  values (v_payment.id, v_payment.status, 'refunded', v_user_id, 'refund_completed', 'Refund completed', jsonb_build_object('refund_id', p_refund_id, 'refund_amount', v_refund.refund_amount));
end;
$$;

revoke all on function public.complete_competition_refund(uuid) from public, anon, authenticated;
grant execute on function public.complete_competition_refund(uuid) to authenticated;

create or replace function public.get_my_payment_history()
returns table (
  id uuid,
  tournament_id uuid,
  registration_id uuid,
  payment_method text,
  sender_phone text,
  txid text,
  submitted_amount numeric,
  expected_amount numeric,
  currency text,
  status text,
  verified_by uuid,
  verified_at timestamptz,
  rejection_reason text,
  submitted_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select id, tournament_id, registration_id, payment_method, sender_phone, txid, submitted_amount, expected_amount, currency, status, verified_by, verified_at, rejection_reason, submitted_at, created_at, updated_at
  from public.payments
  where payer_user_id = (select auth.uid())
  order by submitted_at desc;
$$;

revoke all on function public.get_my_payment_history() from public, anon, authenticated;
grant execute on function public.get_my_payment_history() to authenticated;

create or replace function public.get_admin_payment_queue()
returns table (
  id uuid,
  tournament_id uuid,
  registration_id uuid,
  payer_user_id uuid,
  sender_phone text,
  txid text,
  submitted_amount numeric,
  expected_amount numeric,
  currency text,
  status text,
  submitted_at timestamptz,
  rejection_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select id, tournament_id, registration_id, payer_user_id, sender_phone, txid, submitted_amount, expected_amount, currency, status, submitted_at, rejection_reason
  from public.payments
  where status in ('pending', 'rejected', 'refund_pending')
    and rs_internal.is_payment_reviewer()
  order by submitted_at asc;
$$;

revoke all on function public.get_admin_payment_queue() from public, anon, authenticated;
grant execute on function public.get_admin_payment_queue() to authenticated;

create or replace function public.get_public_payment_instructions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'platform_name', coalesce((select setting_value ->> 'value' from public.platform_settings where setting_key = 'platform.name' limit 1), 'UNDERGRADUATE HUB E-Sports'),
    'payment_method', 'bKash',
    'send_money_number', coalesce((select setting_value ->> 'value' from public.platform_settings where setting_key = 'payment.bkash.send_money_number' limit 1), '01845278579'),
    'currency', 'BDT',
    'required_fields', jsonb_build_array('sender_phone', 'txid', 'submitted_amount', 'proof')
  );
$$;

revoke all on function public.get_public_payment_instructions() from public, anon, authenticated;
grant execute on function public.get_public_payment_instructions() to anon, authenticated;

insert into public.platform_settings (setting_key, setting_value, setting_group, description, is_public)
values
  ('platform.name', jsonb_build_object('value', 'UNDERGRADUATE HUB E-Sports'), 'general', 'Public platform name.', true),
  ('payment.bkash.send_money_number', jsonb_build_object('value', '01845278579'), 'general', 'Organization bKash send-money number.', true),
  ('payment.default_currency', jsonb_build_object('value', 'BDT'), 'general', 'Default payment currency for manual bKash submissions.', true),
  ('payment.instructions', jsonb_build_object(
      'method', 'bKash',
      'number', '01845278579',
      'currency', 'BDT',
      'instructions', 'Send the exact amount to the bKash send-money number shown above and upload the confirmation screenshot or PDF. Submit the TXID for review.'
  ), 'general', 'Public bKash payment instructions.', true)
on conflict (setting_key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

create policy "Users can upload payment proofs for their own pending payment" on storage.objects for insert to authenticated with check (
  bucket_id = 'payment-proofs'
  and coalesce((storage.foldername(name))[1], '') <> ''
  and coalesce((storage.foldername(name))[2], '') = (select auth.uid())::text
  and exists (
    select 1
    from public.payments as payment
    where payment.id::text = (storage.foldername(name))[1]
      and payment.payer_user_id = (select auth.uid())
      and payment.status in ('pending', 'rejected')
  )
  and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp', 'pdf')
);

create policy "Users can read their own payment proofs" on storage.objects for select to authenticated using (
  bucket_id = 'payment-proofs'
  and exists (
    select 1
    from public.payments as payment
    where payment.id::text = (storage.foldername(name))[1]
      and payment.payer_user_id = (select auth.uid())
  )
);

create policy "Payment reviewers can read all payment proofs" on storage.objects for select to authenticated using (
  bucket_id = 'payment-proofs' and rs_internal.is_payment_reviewer()
);

create policy "Owner can remove their own unused payment proof" on storage.objects for delete to authenticated using (
  bucket_id = 'payment-proofs'
  and exists (
    select 1
    from public.payments as payment
    where payment.id::text = (storage.foldername(name))[1]
      and payment.payer_user_id = (select auth.uid())
      and not exists (select 1 from public.payment_proofs as proof where proof.storage_path = name)
  )
);

create policy "Payment reviewers can view all payment proofs" on storage.objects for update to authenticated using (bucket_id = 'payment-proofs' and rs_internal.is_payment_reviewer()) with check (bucket_id = 'payment-proofs');

commit;
