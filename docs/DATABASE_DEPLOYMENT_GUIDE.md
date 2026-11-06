# Database Deployment Guide

## Important State

The production project ref in the request is user-supplied and has not been verified. This workspace has no confirmed migration-history snapshot and no authorized read-only database connection. No remote SQL, migration push, reset, repair, or production setting change was performed. Do not deploy the proposed migrations until preflight confirms the actual target and schema state.

## Local Development Requirements

Install the Supabase CLI and Docker using the project's approved toolchain. Do not put production secrets in the repository or browser environment. Use a disposable local Supabase stack or dedicated staging project for database tests.

## Safe Local Validation

From the repository root, against a fresh local stack only:

```powershell
supabase start
supabase status
supabase db reset
supabase test db
npm run typecheck
npm run build
```

Before `supabase db reset`, confirm `supabase status` reports local services and that the CLI is not linked to a remote project. Never add `--linked`, and never substitute `supabase db push`, remote reset, or migration repair. The repository includes `supabase/tests/security_remediation.test.sql`; it has not been executed, and `supabase test db` must pass on a disposable local stack before staging review.

## Required Preflight Before Any Shared/Production Apply

1. Confirm the project ref independently in Supabase Dashboard; do not rely solely on a typed ref.
2. Export/query schema and migration history read-only, including `supabase_migrations.schema_migrations`, `pg_tables`, `pg_policies`, `pg_proc`/function ACLs, `information_schema.role_table_grants`, views, triggers, and Storage buckets/policies.
3. Compare production objects and data with every migration. Check whether each historical migration was applied. Do not edit historical files when any shared database may have applied them.
4. Back up according to the organization's recovery policy and rehearse forward migrations on a staging clone.
5. Review generated SQL and test authorization using anon, player, team leader/member, payment reviewer, competition manager, admin, and super-admin roles.
6. Obtain explicit deployment authorization before applying any migration. This guide does not authorize or perform a production push.

## Release Sequence

1. Review `SUPABASE_DATABASE_AUDIT.md`, `SUPABASE_SECURITY_REMEDIATION.md`, and `DATABASE_ARCHITECTURE.md`.
2. Apply migrations to disposable local Supabase and run SQL plus frontend tests.
3. Apply to a dedicated staging project only after verifying its project ref and taking a recoverable snapshot.
4. Run smoke tests: OTP signup, required profile, team/individual entry, free entry, duplicate/wrong amount payment rejection, payment review, unauthorized proof access denial, room before/after release, result publication/correction, private settings and history privacy.
5. Have a second reviewer inspect RLS, function grants, storage policies, and migration diffs.
6. Deploy production only after a separately approved rollout plan, backup, maintenance window if needed, and verified rollback/recovery path.

## Current Limitations

- Six new forward-only migrations have been prepared after the original 11. None has been applied or tested by PostgreSQL.
- The execution environment for this task is a GitHub VFS workspace. The PowerShell terminal is outside the checkout; build and local DB commands have not been executed here.
- No production DB state or Vercel/Supabase setting has been verified.
- Do not interpret migration files present in Git as applied to any database.
