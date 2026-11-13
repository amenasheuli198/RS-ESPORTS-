# Supabase SQL Run Order

Use this order when running the project SQL in a Supabase staging database before production.

Important:
- Run the files in the order below, from top to bottom.
- Do not run the SQL test files under `supabase/tests` on your live database. Those are validation scripts.
- If you are deploying to a fresh project, run the migrations in this sequence exactly once.
- If you are applying to an existing project, confirm the migration history before re-running anything.

## Recommended order

1. `20261102000000_profiles_auth.sql`
   - Base auth/profile foundation.

2. `20261103000000_team_management.sql`
   - Team, invitations, captain/member permissions.

3. `20261103120000_tournament_management.sql`
   - Core tournament admin and tournament ownership checks.

4. `20261103130000_tournament_registrations.sql`
   - Tournament registration lifecycle and review flow.

5. `20261103140000_match_scheduling_rooms.sql`
   - Match scheduling, room creation, access control.

6. `20261103150000_match_results_scoring.sql`
   - Match results, scoring, and result audit tables.

7. `20261103160000_announcements_notifications.sql`
   - Announcements and notification features.

8. `20261103170000_player_profiles.sql`
   - Player profile schema and profile-related functions.

9. `20261103180000_achievements_badges.sql`
   - Achievement definitions and badge-related logic.

10. `20261103200000_support_disputes.sql`
   - Dispute/support records and evidence metadata model.

11. `20261103210000_platform_settings.sql`
   - Platform settings and private admin settings access.

12. `20261106000000_security_profiles_hardening.sql`
   - Profile completion hardening, phone validation, readiness checks, profile privacy controls.

13. `20261106010000_competition_model.sql`
   - Shared competition model, entry states, organizer/member permissions.

14. `20261106020000_bkash_payment_workflow.sql`
   - Payment tables, proof storage setup, reviewer permissions, payment workflow.

15. `20261106030000_support_evidence_hardening.sql`
   - Private support evidence bucket and scoped access rules.

16. `20261106040000_competition_match_operations.sql`
   - Advanced competition operations and match management rules.

17. `20261106050000_competition_scoring_results.sql`
   - Competition result validation and result scoring hardening.

18. `20261107000000_payment_bkash_verification.sql`
   - Final payment verification hardening and review enforcement.

## Full file list in order

```text
supabase/migrations/20261102000000_profiles_auth.sql
supabase/migrations/20261103000000_team_management.sql
supabase/migrations/20261103120000_tournament_management.sql
supabase/migrations/20261103130000_tournament_registrations.sql
supabase/migrations/20261103140000_match_scheduling_rooms.sql
supabase/migrations/20261103150000_match_results_scoring.sql
supabase/migrations/20261103160000_announcements_notifications.sql
supabase/migrations/20261103170000_player_profiles.sql
supabase/migrations/20261103180000_achievements_badges.sql
supabase/migrations/20261103200000_support_disputes.sql
supabase/migrations/20261103210000_platform_settings.sql
supabase/migrations/20261106000000_security_profiles_hardening.sql
supabase/migrations/20261106010000_competition_model.sql
supabase/migrations/20261106020000_bkash_payment_workflow.sql
supabase/migrations/20261106030000_support_evidence_hardening.sql
supabase/migrations/20261106040000_competition_match_operations.sql
supabase/migrations/20261106050000_competition_scoring_results.sql
supabase/migrations/20261107000000_payment_bkash_verification.sql
```

## How to run in Supabase

1. Open the Supabase SQL editor.
2. Start with the first file in the list above.
3. Run it and wait for success.
4. Move to the next file.
5. Repeat until the last migration.

## What not to run

- Do not run the file under `supabase/tests/payment_security.test.sql` against your live DB.
- Do not run the test SQL files in `supabase/tests` unless you are explicitly validating in a disposable environment.

## Recommended deployment flow

- Stage DB: run all migration files in order
- Validate the schema and permissions
- Run the SQL validation tests in a disposable staging project
- Then deploy to production only after the checks pass

This repo is organized as a forward-only migration set, so the timestamp order matters.
