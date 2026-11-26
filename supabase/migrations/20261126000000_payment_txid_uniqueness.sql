begin;

create unique index if not exists payments_txid_trimmed_unique
  on public.payments (upper(btrim(txid)))
  where txid is not null;

create or replace function rs_internal.ensure_unique_bkash_txid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_txid text := upper(regexp_replace(btrim(coalesce(new.txid, '')), '[^[:alnum:]]', '', 'g'));
begin
  if char_length(v_normalized_txid) not between 5 and 80 then
    raise exception using errcode = '22023', message = 'INVALID_TXID';
  end if;

  if exists (
    select 1
    from public.payments as payment
    where payment.normalized_txid = v_normalized_txid
      and payment.id is distinct from new.id
  ) then
    raise exception using errcode = '23505', message = 'TXID_ALREADY_USED';
  end if;

  new.txid := btrim(new.txid);
  new.normalized_txid := v_normalized_txid;
  return new;
end;
$$;

revoke all on function rs_internal.ensure_unique_bkash_txid() from public, anon, authenticated;

create trigger ensure_unique_bkash_txid
before insert or update of txid, normalized_txid on public.payments
for each row execute function rs_internal.ensure_unique_bkash_txid();

commit;
