begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-evidence', 'support-evidence', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from storage.buckets as bucket
    where bucket.id = 'support-evidence'
      and bucket.public = false
      and bucket.file_size_limit = 10485760
      and bucket.allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
  ) then
    raise exception 'support-evidence already exists with unexpected settings; inspect before applying';
  end if;
end;
$$;

create policy "Dispute owners and support staff can upload private evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'support-evidence'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (storage.foldername(name))[3] is null
    and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp', 'pdf')
    and metadata ->> 'mimetype' in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
    and coalesce((metadata ->> 'size')::bigint, 10485761) <= 10485760
    and exists (
      select 1 from public.tournament_disputes as dispute
      where dispute.id::text = (storage.foldername(name))[1]
        and (dispute.submitted_by = (select auth.uid())
          or rs_internal.has_competition_permission('manage_support')
          or rs_internal.has_competition_permission('manage_competitions'))
        and dispute.status in ('submitted', 'under_review', 'awaiting_evidence')
    )
  );

create policy "Dispute owners and support staff can read private evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'support-evidence'
    and exists (
      select 1 from public.tournament_disputes as dispute
      where dispute.id::text = (storage.foldername(name))[1]
        and (dispute.submitted_by = (select auth.uid())
          or rs_internal.has_competition_permission('manage_support')
          or rs_internal.has_competition_permission('manage_competitions'))
    )
  );

revoke insert on public.dispute_evidence from public, anon, authenticated;
grant select on public.dispute_evidence to authenticated;

create policy "Users can read non-internal support messages"
  on public.support_messages for select to authenticated
  using (
    not is_internal_note
    and exists (
      select 1 from public.support_tickets as ticket
      where ticket.id = ticket_id and ticket.user_id = (select auth.uid())
    )
  );

create policy "Support staff can read support tickets"
  on public.support_tickets for select to authenticated
  using (rs_internal.has_competition_permission('manage_support'));
create policy "Support staff can read support messages"
  on public.support_messages for select to authenticated
  using (rs_internal.has_competition_permission('manage_support'));
create policy "Support staff can read disputes"
  on public.tournament_disputes for select to authenticated
  using (rs_internal.has_competition_permission('manage_support'));
create policy "Support staff can read dispute evidence metadata"
  on public.dispute_evidence for select to authenticated
  using (rs_internal.has_competition_permission('manage_support'));

create or replace function public.add_dispute_evidence(
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
  v_dispute public.tournament_disputes%rowtype;
  v_id uuid := gen_random_uuid();
  v_is_staff boolean := rs_internal.has_competition_permission('manage_support')
    or rs_internal.has_competition_permission('manage_competitions');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  select * into v_dispute from public.tournament_disputes where id = p_dispute_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'DISPUTE_NOT_FOUND';
  end if;
  if v_dispute.submitted_by <> v_user_id and not v_is_staff then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;
  if v_dispute.status not in ('submitted', 'under_review', 'awaiting_evidence') then
    raise exception using errcode = '23514', message = 'DISPUTE_CLOSED';
  end if;
  if p_bucket_name <> 'support-evidence'
    or (storage.foldername(p_object_path))[1] <> p_dispute_id::text
    or (storage.foldername(p_object_path))[2] <> v_user_id::text
    or (storage.foldername(p_object_path))[3] is not null
    or p_content_type not in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
    or p_size_bytes not between 1 and 10485760
    or char_length(btrim(coalesce(p_file_name, ''))) not between 1 and 180 then
    raise exception using errcode = '22023', message = 'INVALID_EVIDENCE';
  end if;
  if not exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'support-evidence'
      and object.name = p_object_path
      and object.metadata ->> 'mimetype' = p_content_type
      and coalesce((object.metadata ->> 'size')::bigint, 0) = p_size_bytes
  ) then
    raise exception using errcode = '22023', message = 'EVIDENCE_OBJECT_NOT_VERIFIED';
  end if;

  insert into public.dispute_evidence (
    id, dispute_id, uploaded_by, file_name, bucket_name, object_path, content_type, size_bytes
  ) values (
    v_id, p_dispute_id, v_user_id, btrim(p_file_name), p_bucket_name,
    p_object_path, p_content_type, p_size_bytes
  );

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'dispute_evidence_added', 'dispute', p_dispute_id,
    jsonb_build_object('evidence_id', v_id, 'file_name', btrim(p_file_name), 'size_bytes', p_size_bytes));
  return v_id;
end;
$$;

revoke all on function public.add_dispute_evidence(uuid, text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.add_dispute_evidence(uuid, text, text, text, text, bigint) to authenticated;

create or replace function public.add_support_message(
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
  v_owner_id uuid;
  v_is_support boolean := rs_internal.has_competition_permission('manage_support');
  v_message text := btrim(coalesce(p_message, ''));
  v_message_id uuid := gen_random_uuid();
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if char_length(v_message) not between 1 and 5000 then raise exception using errcode = '22023', message = 'INVALID_MESSAGE'; end if;
  if p_is_internal_note and not v_is_support then raise exception using errcode = '42501', message = 'SUPPORT_PERMISSION_REQUIRED'; end if;
  select ticket.user_id into v_owner_id from public.support_tickets ticket where ticket.id = p_ticket_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'TICKET_NOT_FOUND'; end if;
  if v_owner_id is distinct from v_user_id and not v_is_support then
    raise exception using errcode = '42501', message = 'ACCESS_DENIED';
  end if;
  insert into public.support_messages (id, ticket_id, sender_id, message, is_internal_note)
  values (v_message_id, p_ticket_id, v_user_id, v_message, coalesce(p_is_internal_note, false));
  update public.support_tickets set updated_at = now() where id = p_ticket_id;
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, case when p_is_internal_note then 'support_internal_note_added' else 'support_message_added' end,
    'support_ticket', p_ticket_id, jsonb_build_object('message_id', v_message_id));
  return v_message_id;
end;
$$;

create or replace function public.set_support_ticket_status(
  p_ticket_id uuid,
  p_status text,
  p_assigned_admin_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_target_role text;
begin
  if not rs_internal.has_competition_permission('manage_support') then
    raise exception using errcode = '42501', message = 'SUPPORT_PERMISSION_REQUIRED';
  end if;
  if p_status not in ('open', 'in_progress', 'waiting_for_user', 'resolved', 'closed') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;
  if p_assigned_admin_id is not null then
    select account.raw_app_meta_data ->> 'role' into v_target_role
    from auth.users account where account.id = p_assigned_admin_id;
    if v_target_role not in ('support_agent', 'admin', 'super_admin') then
      raise exception using errcode = '22023', message = 'INVALID_SUPPORT_ASSIGNEE';
    end if;
  end if;
  update public.support_tickets set status = p_status, assigned_admin_id = p_assigned_admin_id, updated_at = now()
  where id = p_ticket_id;
  if not found then raise exception using errcode = 'P0002', message = 'TICKET_NOT_FOUND'; end if;
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'support_ticket_status_changed', 'support_ticket', p_ticket_id,
    jsonb_build_object('status', p_status, 'assigned_admin_id', p_assigned_admin_id));
end;
$$;

create or replace function public.set_dispute_status(
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
declare
  v_user_id uuid := (select auth.uid());
  v_target_role text;
begin
  if not rs_internal.has_competition_permission('manage_support') then
    raise exception using errcode = '42501', message = 'SUPPORT_PERMISSION_REQUIRED';
  end if;
  if p_status not in ('submitted', 'under_review', 'awaiting_evidence', 'accepted', 'rejected', 'resolved') then
    raise exception using errcode = '22023', message = 'INVALID_STATUS';
  end if;
  if p_decision is not null and char_length(p_decision) not between 2 and 200 then
    raise exception using errcode = '22023', message = 'INVALID_DECISION';
  end if;
  if p_decision_reason is not null and char_length(p_decision_reason) not between 5 and 2000 then
    raise exception using errcode = '22023', message = 'INVALID_DECISION_REASON';
  end if;
  if p_assigned_admin_id is not null then
    select account.raw_app_meta_data ->> 'role' into v_target_role
    from auth.users account where account.id = p_assigned_admin_id;
    if v_target_role not in ('support_agent', 'moderator', 'admin', 'super_admin') then
      raise exception using errcode = '22023', message = 'INVALID_SUPPORT_ASSIGNEE';
    end if;
  end if;
  update public.tournament_disputes set status = p_status, assigned_admin_id = p_assigned_admin_id,
    decision = p_decision, decision_reason = p_decision_reason,
    resolved_at = case when p_status = 'resolved' then coalesce(resolved_at, now()) else null end,
    updated_at = now()
  where id = p_dispute_id;
  if not found then raise exception using errcode = 'P0002', message = 'DISPUTE_NOT_FOUND'; end if;
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, details)
  values (v_user_id, 'dispute_status_changed', 'dispute', p_dispute_id,
    jsonb_build_object('status', p_status, 'decision', p_decision, 'reason', p_decision_reason, 'assigned_admin_id', p_assigned_admin_id));
end;
$$;

create function rs_internal.validate_tournament_dispute_relations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_tournament_id uuid;
  v_registration_tournament_id uuid;
  v_registration_team_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' and v_user_id is not null and new.submitted_by <> v_user_id
    and not rs_internal.has_competition_permission('manage_support') then
    raise exception using errcode = '42501', message = 'DISPUTE_SUBMITTER_MISMATCH';
  end if;
  if new.match_id is not null then
    select match.tournament_id into v_match_tournament_id
    from public.matches as match where match.id = new.match_id;
    if not found then raise exception using errcode = '23503', message = 'DISPUTE_MATCH_NOT_FOUND'; end if;
    if new.tournament_id is not null and v_match_tournament_id is not null
      and new.tournament_id <> v_match_tournament_id then
      raise exception using errcode = '23514', message = 'DISPUTE_MATCH_TOURNAMENT_MISMATCH';
    end if;
    if new.tournament_id is null then new.tournament_id := v_match_tournament_id; end if;
  end if;
  if new.registration_id is not null then
    select registration.tournament_id, registration.team_id
      into v_registration_tournament_id, v_registration_team_id
    from public.tournament_registrations as registration
    where registration.id = new.registration_id;
    if not found then raise exception using errcode = '23503', message = 'DISPUTE_REGISTRATION_NOT_FOUND'; end if;
    if new.tournament_id is not null and new.tournament_id <> v_registration_tournament_id then
      raise exception using errcode = '23514', message = 'DISPUTE_REGISTRATION_TOURNAMENT_MISMATCH';
    end if;
    new.tournament_id := v_registration_tournament_id;
    if v_user_id is not null and not rs_internal.is_active_team_member(v_registration_team_id)
      and not rs_internal.is_tournament_admin() then
      raise exception using errcode = '42501', message = 'DISPUTE_REGISTRATION_ACCESS_DENIED';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function rs_internal.validate_tournament_dispute_relations() from public, anon, authenticated;
create trigger validate_tournament_dispute_relations
  before insert or update of tournament_id, match_id, registration_id, submitted_by
  on public.tournament_disputes
  for each row execute function rs_internal.validate_tournament_dispute_relations();

revoke all on function public.add_support_message(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.set_support_ticket_status(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.set_dispute_status(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.add_support_message(uuid, text, boolean) to authenticated;
grant execute on function public.set_support_ticket_status(uuid, text, uuid) to authenticated;
grant execute on function public.set_dispute_status(uuid, text, text, text, uuid) to authenticated;

commit;
