begin;

alter table public.team_members
  drop constraint if exists team_members_check,
  drop constraint if exists team_members_slot_check;

alter table public.team_members
  add constraint team_members_slot_check
  check (
    (role = 'captain' and slot = 1)
    or (role in ('starting_player', 'substitute') and slot >= 2)
  ) not valid;

notify pgrst, 'reload schema';

commit;