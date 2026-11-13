# Payment Security Audit

## Summary

Payment infrastructure exists in source migrations, but the platform does not have a working, end-to-end payment lifecycle. The current member UI blocks paid tournament registration, the admin portal has no payment queue, and two migration generations define incompatible contracts for the same payment tables. Do not treat bKash payment collection, review, or refunds as operational.

## Source findings

- `20261106020000_bkash_payment_workflow.sql` defines competition-entry payments with `entry_id`, `provider`, `sender_number`, and a payment review/refund RPC family. Its Storage bucket insert has an incomplete `VALUES` statement, so the migration is not valid as checked in.
- `20261107000000_payment_bkash_verification.sql` uses `CREATE TABLE IF NOT EXISTS` for a different payment layout based on `tournament_id`, `registration_id`, and `payer_user_id`, then creates policies and functions against that layout. Because the earlier migration already creates `public.payments`, `IF NOT EXISTS` does not reconcile the missing columns; later statements expect a schema that was not created.
- `payment_security.test.sql` expects competition payment/review/refund RPC names that are not provided as a consistent set by the checked-in migration sequence.
- `AdminTournamentFormPage` labels paid entry as configuration-only, and `TeamTournamentsPage`/`TournamentDetailsPage` deny paid registration while verification is unsupported. No payment admin page is routed.
- No database runner or live Supabase project was available to verify RLS, constraints, or migration behavior.

## Security controls present in source

The competing designs include server-side amount and ownership checks, unique normalized transaction IDs, reviewer permission checks, audit events, RLS on payment tables, and private proof buckets. Those controls are not evidence of a usable or deployed payment workflow until one schema contract is selected, migrations are made sequentially valid, and database tests pass.

## Required remediation before enabling payments

1. Verify the migration history in a non-production project before editing/replaying previously applied migrations.
2. Select one canonical registration/payment schema and migrate the UI, RPCs, policies, and tests to that schema; do not keep two incompatible `public.payments` contracts.
3. Repair the malformed Storage bucket statement in the migration history only after determining whether it was applied. If already applied, use a forward migration rather than changing an applied migration.
4. Add and execute SQL tests for transaction uniqueness, exact fee, registration ownership, duplicate submission, concurrent review, self-review, status transitions, proof access, and refunds.
5. Keep paid registration disabled until an end-to-end staging test passes for member submission and authorized reviewer approval/rejection.

No production migration was pushed and no payment data was modified in this work.
