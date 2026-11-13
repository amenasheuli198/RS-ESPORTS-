BEGIN;

SELECT plan(12);

SELECT has_table('public', 'payments', 'payments table exists');
SELECT has_table('public', 'payment_events', 'payment events table exists');
SELECT has_table('public', 'payment_proofs', 'payment proof table exists');
SELECT has_table('public', 'payment_refunds', 'refund table exists');

SELECT has_function('public', 'submit_competition_payment', ARRAY['uuid','uuid','text','text','numeric','text','text','bigint','text'], 'submit function exists');
SELECT has_function('public', 'approve_competition_payment', ARRAY['uuid','text'], 'approve function exists');
SELECT has_function('public', 'reject_competition_payment', ARRAY['uuid','text'], 'reject function exists');
SELECT has_function('public', 'initiate_competition_refund', ARRAY['uuid','numeric','text','text'], 'refund initiation function exists');
SELECT has_function('public', 'complete_competition_refund', ARRAY['uuid'], 'refund completion function exists');

SELECT is(
  (SELECT setting_value->>'value' FROM public.platform_settings WHERE setting_key = 'platform.name' LIMIT 1),
  'UNDERGRADUATE HUB E-Sports',
  'platform name is set to UNDERGRADUATE HUB E-Sports'
);

SELECT is(
  (SELECT setting_value->>'value' FROM public.platform_settings WHERE setting_key = 'payment.bkash.send_money_number' LIMIT 1),
  '01845278579',
  'bKash send-money number is configured'
);

SELECT is(
  (SELECT jsonb_typeof(metadata) FROM public.payment_events LIMIT 1),
  'object',
  'audit metadata is JSON object typed'
);

SELECT * FROM finish();
ROLLBACK;
