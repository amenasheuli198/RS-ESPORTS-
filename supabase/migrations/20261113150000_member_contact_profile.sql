begin;

create or replace function public.update_my_contact_profile(p_full_name text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_full_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_phone text := nullif(regexp_replace(btrim(coalesce(p_phone, '')), '[[:space:]()-]', '', 'g'), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1 from auth.users as account
    where account.id = v_user_id and account.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'EMAIL_VERIFICATION_REQUIRED';
  end if;
  if v_full_name is null or char_length(v_full_name) not between 2 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_FULL_NAME';
  end if;
  if v_phone is null or v_phone !~ '^\+?[1-9][0-9]{6,14}$' then
    raise exception using errcode = '22023', message = 'INVALID_PHONE_NUMBER';
  end if;

  insert into public.profiles (id, full_name, phone, profile_completed_at)
  values (v_user_id, v_full_name, v_phone, now())
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    profile_completed_at = coalesce(public.profiles.profile_completed_at, excluded.profile_completed_at),
    updated_at = now();

  return v_user_id;
end;
$$;

revoke all on function public.update_my_contact_profile(text, text) from public, anon, authenticated;
grant execute on function public.update_my_contact_profile(text, text) to authenticated;

commit;