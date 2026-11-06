begin;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.competition_entries (id) on delete restrict,
  provider text not null default 'bkash' check (provider = 'bkash'),
    sender_number text not null check (sender_number ~ '^\+?[1-9][0-9]{6,14}$'),
  txid text not null check (char_length(btrim(txid)) between 5 and 80),
  normalized_txid text not null check (normalized_txid ~ '^[A-Z0-9]{5,80}$'),
  amount numeric(12, 2) not null check (amount > 0 and amount < 'Infinity'::numeric),
  currency text not null check (currency = 'BDT'),
  paid_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'partially_refunded', 'refunded')),
  submitted_by uuid not null references auth.users (id) on delete restrict,
  reviewed_by uuid references auth.users (id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(btrim(rejection_reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (status not in ('approved', 'rejected', 'partially_refunded', 'refunded') or (reviewed_by is not null and reviewed_at is not null))
);

create unique index payments_provider_txid_unique on public.payments (provider, normalized_txid);
create unique index payments_one_open_or_approved_per_entry
  on public.payments (entry_id)
  where status in ('pending', 'approved', 'partially_refunded');
create index payments_status_created_idx on public.payments (status, created_at desc);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_id uuid not null references auth.users (id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 2000),
  created_at timestamptz not null default now()
);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  bucket_name text not null default 'payment-proofs' check (bucket_name = 'payment-proofs'),
  object_path text not null unique check (char_length(btrim(object_path)) between 8 and 500),
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0 and amount < 'Infinity'::numeric),
  currency text not null check (currency = 'BDT'),
  refund_txid text not null check (char_length(btrim(refund_txid)) between 5 and 80),
  normalized_refund_txid text not null unique check (normalized_refund_txid ~ '^[A-Z0-9]{5,80}$'),
  reason text not null check (char_length(btrim(reason)) between 5 and 2000),
  recorded_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.payment_refunds enable row level security;
revoke all on table public.payments, public.payment_events, public.payment_proofs, public.payment_refunds
  from public, anon, authenticated;
grant select on public.payments, public.payment_events, public.payment_proofs, public.payment_refunds to authenticated;

create policy "Users and payment reviewers can read payments"
  on public.payments for select to authenticated
  using (submitted_by = (select auth.uid()) or rs_internal.has_competition_permission('review_payments'));
create policy "Users and payment reviewers can read payment events"
  on public.payment_events for select to authenticated
  using (
    exists (select 1 from public.payments as payment
      where payment.id = payment_id and payment.submitted_by = (select auth.uid()))
    or rs_internal.has_competition_permission('review_payments')
  );
create policy "Users and payment reviewers can read payment proof metadata"
  on public.payment_proofs for select to authenticated
  using (uploaded_by = (select auth.uid()) or rs_internal.has_competition_permission('review_payments'));
create policy "Payment reviewers can read refunds"
  on public.payment_refunds for select to authenticated
  using (rs_internal.has_competition_permission('review_payments'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760,
 		if v_sender is null or v_sender !~ '^\+?[1-9][0-9]{6,14}$' then
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets as bucket
    where bucket.id = 'payment-proofs'
      and bucket.public = false
      and bucket.file_size_limit = 10485760
      and bucket.allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
  ) then
    raise exception 'payment-proofs already exists with unexpected settings; inspect before applying';
  end if;
end;
$$;

create policy "Eligible entry owners can upload payment proofs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (storage.foldername(name))[3] is null
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp', 'pdf')
    and metadata ->> 'mimetype' in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
    and coalesce((metadata ->> 'size')::bigint, 10485761) <= 10485760
    and exists (
      select 1 from public.competition_entries as entry
      where entry.id::text = (storage.foldername(name))[1]
        and (entry.registered_by = (select auth.uid())
          or entry.player_id = (select auth.uid())
          or (entry.team_id is not null and rs_internal.is_active_team_captain(entry.team_id)))
        and entry.status in ('pending_payment', 'payment_rejected')
    )
  );

create policy "Entry owners and payment reviewers can read payment proofs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      exists (
        select 1 from public.competition_entries as entry
        where entry.id::text = (storage.foldername(name))[1]
          and (entry.registered_by = (select auth.uid())
            or entry.player_id = (select auth.uid())
            or (entry.team_id is not null and rs_internal.is_active_team_member(entry.team_id)))
      )
      or rs_internal.has_competition_permission('review_payments')
    )
  );

create policy "Entry owners can remove unattached payment proofs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.competition_entries as entry
      where entry.id::text = (storage.foldername(name))[1]
        and (entry.registered_by = (select auth.uid())
          or entry.player_id = (select auth.uid())
          or (entry.team_id is not null and rs_internal.is_active_team_captain(entry.team_id)))
        and not exists (
          select 1 from public.payment_proofs as proof where proof.object_path = name
        )
    )
  );

create function public.submit_bkash_payment(
  p_entry_id uuid,
  p_sender_number text,
  p_txid text,
  p_amount numeric,
  p_paid_at timestamptz default null,
  p_proof_path text default null,
  p_proof_type text default null,
  p_proof_size bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_entry public.competition_entries%rowtype;
  v_competition public.competitions%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_sender text := nullif(regexp_replace(btrim(coalesce(p_sender_number, '')), '[[:space:]()-]', '', 'g'), '');
  v_txid text := upper(regexp_replace(btrim(coalesce(p_txid, '')), '[^[:alnum:]]', '', 'g'));
begin
  if v_user_id is null or not rs_internal.is_player_ready() then
    raise exception using errcode = '42501', message = 'PLAYER_PROFILE_COMPLETION_REQUIRED';
  end if;
  select * into v_entry from public.competition_entries where id = p_entry_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ENTRY_NOT_FOUND'; end if;
  if not (v_entry.registered_by = v_user_id or v_entry.player_id = v_user_id
    or (v_entry.team_id is not null and rs_internal.is_active_team_captain(v_entry.team_id))) then
    raise exception using errcode = '42501', message = 'ENTRY_PAYMENT_ACCESS_DENIED';
  end if;
  select * into v_competition from public.competitions where id = v_entry.competition_id for update;
  if v_competition.entry_type <> 'paid' or v_competition.currency <> 'BDT' then
    raise exception using errcode = '23514', message = 'PAYMENT_NOT_REQUIRED';
  end if;
  if v_entry.status not in ('pending_payment', 'payment_rejected') then
    raise exception using errcode = '23514', message = 'ENTRY_NOT_PAYABLE';
  end if;
  if v_sender is null or v_sender !~ '^\+?[1-9][0-9]{6,14}$' then
    raise exception using errcode = '22023', message = 'INVALID_SENDER_NUMBER';
  end if;
  if char_length(v_txid) not between 5 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_TXID';
  end if;
  if p_amount is null or p_amount <> v_competition.entry_fee then
    raise exception using errcode = '23514', message = 'PAYMENT_AMOUNT_MISMATCH';
  end if;
  if p_proof_path is null and (p_proof_type is not null or p_proof_size is not null) then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_PROOF';
  end if;
  if p_proof_path is not null and (
    (storage.foldername(p_proof_path))[1] <> p_entry_id::text
    or (storage.foldername(p_proof_path))[2] <> v_user_id::text
    or (storage.foldername(p_proof_path))[3] is not null
    or not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_proof_path)
    or p_proof_type not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
    or p_proof_size not between 1 and 10485760
  ) then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_PROOF';
  end if;

  insert into public.payments (id, entry_id, sender_number, txid, normalized_txid, amount, currency, paid_at, submitted_by)
  values (v_payment_id, p_entry_id, v_sender, btrim(p_txid), v_txid, p_amount, 'BDT', p_paid_at, v_user_id);
  if p_proof_path is not null then
    insert into public.payment_proofs (payment_id, uploaded_by, object_path, content_type, size_bytes)
    values (v_payment_id, v_user_id, p_proof_path, p_proof_type, p_proof_size);
  end if;
  insert into public.payment_events (payment_id, from_status, to_status, actor_id)
  values (v_payment_id, null, 'pending', v_user_id);
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'bkash_payment_submitted', 'payment', v_payment_id,
    jsonb_build_object('entry_id', p_entry_id, 'amount', p_amount, 'currency', 'BDT'));
  return v_payment_id;
end;
$$;

create function public.review_bkash_payment(p_payment_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_entry public.competition_entries%rowtype;
  v_competition public.competitions%rowtype;
  v_user_id uuid := (select auth.uid());
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not rs_internal.has_competition_permission('review_payments') then
    raise exception using errcode = '42501', message = 'PAYMENT_REVIEWER_REQUIRED';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_DECISION';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'pending' then raise exception using errcode = '23514', message = 'PAYMENT_NOT_PENDING'; end if;
  if v_payment.submitted_by = v_user_id then raise exception using errcode = '42501', message = 'SELF_REVIEW_FORBIDDEN'; end if;
  if p_decision = 'rejected' and v_reason is null then raise exception using errcode = '22023', message = 'REJECTION_REASON_REQUIRED'; end if;
  select * into v_entry from public.competition_entries where id = v_payment.entry_id for update;
  select * into v_competition from public.competitions where id = v_entry.competition_id for update;
  if v_entry.status not in ('pending_payment', 'payment_rejected')
    or v_payment.amount <> v_competition.entry_fee or v_payment.currency <> v_competition.currency then
    raise exception using errcode = '23514', message = 'PAYMENT_NO_LONGER_ELIGIBLE';
  end if;
  update public.payments set status = p_decision, reviewed_by = v_user_id, reviewed_at = now(),
    rejection_reason = case when p_decision = 'rejected' then v_reason else null end
  where id = p_payment_id;
  if p_decision = 'approved' then
    update public.competition_entries set status = 'confirmed', reviewed_by = v_user_id, reviewed_at = now(), rejection_reason = null
    where id = v_entry.id;
  else
    update public.competition_entries set status = 'payment_rejected', reviewed_by = v_user_id, reviewed_at = now(), rejection_reason = v_reason
    where id = v_entry.id;
  end if;
  insert into public.competition_registration_events (entry_id, from_status, to_status, actor_id, reason)
  values (v_entry.id, v_entry.status, case when p_decision = 'approved' then 'confirmed' else 'payment_rejected' end, v_user_id, v_reason);
  insert into public.payment_events (payment_id, from_status, to_status, actor_id, reason)
  values (p_payment_id, v_payment.status, p_decision, v_user_id, v_reason);
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'bkash_payment_' || p_decision, 'payment', p_payment_id,
    jsonb_build_object('entry_id', v_entry.id, 'reason', v_reason));
end;
$$;

create function public.record_bkash_refund(p_payment_id uuid, p_amount numeric, p_refund_txid text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_refund_id uuid := gen_random_uuid();
  v_user_id uuid := (select auth.uid());
  v_refunded numeric(12,2);
  v_refund_txid text := upper(regexp_replace(btrim(coalesce(p_refund_txid, '')), '[^[:alnum:]]', '', 'g'));
  v_status text;
begin
  if not rs_internal.has_competition_permission('review_payments') then
    raise exception using errcode = '42501', message = 'PAYMENT_REVIEWER_REQUIRED';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found or v_payment.status not in ('approved', 'partially_refunded') then
    raise exception using errcode = '23514', message = 'PAYMENT_NOT_REFUNDABLE';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 'Infinity'::numeric
    or char_length(v_refund_txid) not between 5 and 80
    or char_length(btrim(coalesce(p_reason, ''))) not between 5 and 2000 then
    raise exception using errcode = '22023', message = 'INVALID_REFUND';
  end if;
  select coalesce(sum(refund.amount), 0) into v_refunded from public.payment_refunds refund where refund.payment_id = p_payment_id;
  if v_refunded + p_amount > v_payment.amount then raise exception using errcode = '23514', message = 'REFUND_EXCEEDS_PAYMENT'; end if;
  insert into public.payment_refunds (id, payment_id, amount, currency, refund_txid, normalized_refund_txid, reason, recorded_by)
  values (v_refund_id, p_payment_id, p_amount, v_payment.currency, btrim(p_refund_txid), v_refund_txid, btrim(p_reason), v_user_id);
  v_status := case when v_refunded + p_amount = v_payment.amount then 'refunded' else 'partially_refunded' end;
  update public.payments set status = v_status where id = p_payment_id;
  insert into public.payment_events (payment_id, from_status, to_status, actor_id, reason)
  values (p_payment_id, v_payment.status, v_status, v_user_id, p_reason);
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'bkash_refund_recorded', 'payment', p_payment_id,
    jsonb_build_object('refund_id', v_refund_id, 'amount', p_amount, 'reason', p_reason));
  return v_refund_id;
end;
$$;

revoke all on function public.submit_bkash_payment(uuid, text, text, numeric, timestamptz, text, text, bigint) from public, anon;
revoke all on function public.review_bkash_payment(uuid, text, text) from public, anon;
revoke all on function public.record_bkash_refund(uuid, numeric, text, text) from public, anon;
grant execute on function public.submit_bkash_payment(uuid, text, text, numeric, timestamptz, text, text, bigint) to authenticated;
grant execute on function public.review_bkash_payment(uuid, text, text) to authenticated;
grant execute on function public.record_bkash_refund(uuid, numeric, text, text) to authenticated;

commit;
