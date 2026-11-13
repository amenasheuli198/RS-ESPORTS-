create table public.admin_access_key_lockouts (
  lock_hash text primary key check (lock_hash ~ '^[0-9a-f]{64}$'),
  failure_count smallint not null default 0 check (failure_count between 0 and 2),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.admin_access_key_lockouts enable row level security;
revoke all on table public.admin_access_key_lockouts from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_access_key_lockouts to service_role;

create function public.record_admin_access_key_attempt(p_lock_hash text, p_result text)
returns table (is_locked boolean, attempts_remaining integer, lock_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock public.admin_access_key_lockouts%rowtype;
  v_next_failure_count integer;
  v_lock_expires_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_lock_hash is null or p_lock_hash !~ '^[0-9a-f]{64}$'
    or p_result is null or p_result not in ('check', 'failure', 'success') then
    raise exception using errcode = '22023', message = 'INVALID_LOCKOUT_REQUEST';
  end if;

  insert into public.admin_access_key_lockouts (lock_hash)
  values (p_lock_hash)
  on conflict (lock_hash) do nothing;

  select * into v_lock
  from public.admin_access_key_lockouts
  where lock_hash = p_lock_hash
  for update;

  if v_lock.locked_until is not null and v_lock.locked_until > now() then
    return query select true, 0, v_lock.locked_until;
    return;
  end if;

  if v_lock.window_started_at <= now() - interval '15 minutes' then
    update public.admin_access_key_lockouts
    set failure_count = 0,
        window_started_at = now(),
        locked_until = null,
        updated_at = now()
    where lock_hash = p_lock_hash;

    select * into v_lock
    from public.admin_access_key_lockouts
    where lock_hash = p_lock_hash
    for update;
  end if;

  if p_result = 'check' then
    return query select false, 2 - v_lock.failure_count::integer, null::timestamptz;
    return;
  end if;

  if p_result = 'success' then
    delete from public.admin_access_key_lockouts where lock_hash = p_lock_hash;
    return query select false, 2, null::timestamptz;
    return;
  end if;

  v_next_failure_count := v_lock.failure_count + 1;
  if v_next_failure_count >= 2 then
    v_lock_expires_at := now() + interval '15 minutes';
    update public.admin_access_key_lockouts
    set failure_count = 2,
        locked_until = v_lock_expires_at,
        updated_at = now()
    where lock_hash = p_lock_hash;
    return query select true, 0, v_lock_expires_at;
    return;
  end if;

  update public.admin_access_key_lockouts
  set failure_count = v_next_failure_count,
      updated_at = now()
  where lock_hash = p_lock_hash;
  return query select false, 2 - v_next_failure_count, null::timestamptz;
end;
$$;

revoke all on function public.record_admin_access_key_attempt(text, text) from public, anon, authenticated;
grant execute on function public.record_admin_access_key_attempt(text, text) to service_role;