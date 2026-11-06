begin;

select plan(20);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.player_match_roster_snapshots'::regclass),
  'raw player roster snapshots have RLS enabled'
);

select ok(
  not has_table_privilege('authenticated', 'public.player_match_roster_snapshots', 'SELECT'),
  'authenticated clients cannot query raw roster snapshots'
);

select ok(
  not has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT'),
  'anonymous clients cannot read profile phone numbers'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT'),
  'authenticated clients cannot query profile phone numbers directly'
);

select ok(
  not has_function_privilege('anon', 'public.get_private_platform_settings()', 'EXECUTE'),
  'anonymous clients cannot call the private settings RPC'
);

select ok(
  not has_function_privilege('authenticated', 'public.achievement_progress_for_user(uuid,uuid)', 'EXECUTE'),
  'authenticated clients cannot query arbitrary achievement progress'
);

select ok(
  not has_function_privilege('anon', 'public.try_award_achievement(uuid,text,text,boolean,uuid)', 'EXECUTE'),
  'anonymous clients cannot call the achievement award RPC'
);

select ok(
  not (select public from storage.buckets where id = 'payment-proofs'),
  'payment proof bucket is private'
);

select ok(
  not (select public from storage.buckets where id = 'support-evidence'),
  'support evidence bucket is private'
);

select ok(
  exists (select 1 from pg_catalog.pg_indexes where schemaname = 'public' and indexname = 'payments_provider_txid_unique'),
  'payment provider and normalized TXID are unique'
);

select ok(
  exists (select 1 from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Eligible entry owners can upload payment proofs'),
  'payment proof upload requires an eligible entry owner'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{}}',
  true
);
set local role authenticated;

select ok(not rs_internal.is_player_ready(), 'a user without a confirmed profile is not player-ready');

select throws_ok(
  $$select * from public.get_private_platform_settings()$$,
  '42501',
  'ADMIN_REQUIRED',
  'non-admin authenticated users cannot read private settings'
);

select throws_ok(
  $$select public.try_award_achievement('22222222-2222-4222-8222-222222222222'::uuid, 'first-blood', null, false, null)$$,
  '42501',
  'ADMIN_REQUIRED',
  'non-admin authenticated users cannot forge achievement awards'
);

select throws_ok(
  $$select public.complete_my_profile('Example Player', '+8801712345678')$$,
  '42501',
  'EMAIL_VERIFICATION_REQUIRED',
  'unverified accounts cannot complete player profiles'
);

select throws_ok(
  $$select * from public.get_competition_match_room('33333333-3333-4333-8333-333333333333'::uuid)$$,
  '42501',
  'MATCH_NOT_ELIGIBLE_FOR_ROOM_ACCESS',
  'room credentials for an unknown match are not returned'
);

select throws_ok(
  $$select public.review_bkash_payment('44444444-4444-4444-8444-444444444444'::uuid, 'approved', null)$$,
  '42501',
  'PAYMENT_REVIEWER_REQUIRED',
  'players cannot approve bKash payments'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{"role":"payment_reviewer"}}',
  true
);
select ok(rs_internal.has_competition_permission('review_payments'), 'payment reviewer claim grants only payment review');
select ok(not rs_internal.has_competition_permission('manage_competitions'), 'payment reviewer cannot manage competitions');

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","app_metadata":{"role":"super_admin"}}',
  true
);
select ok(rs_internal.is_tournament_admin(), 'trusted super-admin claim passes legacy admin gates');

select * from finish();
rollback;
