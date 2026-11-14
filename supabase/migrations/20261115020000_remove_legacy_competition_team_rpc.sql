begin;

drop function if exists public.register_competition_team(uuid, uuid);

notify pgrst, 'reload schema';

commit;