# PAYMENT DEPLOYMENT GUIDE

## Status

This repository is not connected to the remote Supabase project. The payment migration prepared here is a forward-only source change for review and staging deployment, not a live production push.

## Required review before deployment

Before applying the migration to any environment, verify:

1. The environment is staging or a review database, not production.
2. The target project is the correct Supabase project.
3. Historical migration history will not be rewritten.
4. The platform settings default name is `UNDERGRADUATE HUB E-Sports`.
5. The send-money number is `01845278579`.
6. A payment reviewer role is provisioned in the target environment and not granted as a super-admin role.
7. Storage bucket naming and RLS policies match the reviewed migration.

## Local validation commands

Run the following commands from the repository root:

```bash
npm install
npx tsc --noEmit
```

If a local PostgreSQL test runner is available, also run the pgTAP suite after applying the migration in a disposable database:

```bash
psql -f supabase/tests/payment_security.test.sql
```

## Safety rules

- Do not run `supabase db push`.
- Do not run `supabase db reset --remote`.
- Do not run `supabase migration repair`.
- Do not connect to the production Supabase project.
- Do not rewrite already-applied migration history.
- Do not expose private payment proof URLs publicly.

## Recommended deployment sequence

1. Validate the SQL in a disposable local or staging Supabase environment.
2. Review role mapping and reviewer permissions.
3. Confirm the payment bucket is private and properly restricted.
4. Confirm the payment number and public instructions are correct.
5. Review the payment queue, proof access, and rejection workflow in the admin area.
6. Only then proceed with approval for a production-scheduled deployment.

## Release gate

The migration is considered ready for deployment only when:

- the SQL runs without errors in a review database,
- pgTAP or equivalent tests pass,
- the reviewer role cannot escalate privileges,
- payment proof access is private,
- the platform name matches `UNDERGRADUATE HUB E-Sports`, and
- the send-money number is verified as `01845278579`.
