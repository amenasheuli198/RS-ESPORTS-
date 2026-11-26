begin;

update public.competitions
set currency = 'BDT'
where entry_type = 'paid'
  and currency <> 'BDT';

create or replace function rs_internal.enforce_paid_competition_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_type = 'paid' then
    new.currency := 'BDT';
  end if;
  return new;
end;
$$;

revoke all on function rs_internal.enforce_paid_competition_currency() from public, anon, authenticated;

drop trigger if exists enforce_paid_competition_currency on public.competitions;
create trigger enforce_paid_competition_currency
before insert or update of entry_type, currency on public.competitions
for each row execute function rs_internal.enforce_paid_competition_currency();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.competitions'::regclass
      and conname = 'competitions_paid_currency_bdt_check'
  ) then
    alter table public.competitions
      add constraint competitions_paid_currency_bdt_check
      check (entry_type <> 'paid' or currency = 'BDT');
  end if;
end;
$$;

commit;
