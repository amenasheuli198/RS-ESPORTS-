# Security Audit Report

## Scope and evidence

This is a source-based review of the checked-in React/Vite application, API handler, Supabase migrations, and SQL tests. No production deployment, Supabase credentials, live Auth logs, or connected PostgreSQL instance were available. Migrations were not applied, and no production data was changed. Findings below distinguish source evidence from runtime verification.

## Findings and remediation

| Severity | Finding | Affected files | Root cause / evidence | Status |
|---|---|---|---|---|
| High | OTP delivery failure cannot be diagnosed exactly from this workspace | `src/auth/AuthProvider.tsx`, `src/auth/errorMessage.ts`, `.env.example` | Member OTP is a direct Supabase Auth request; there is no configured project URL/key or captured Auth response. Project SMTP, provider restrictions, template, and logs are external. | Error mapping improved; exact failure remains unverified. Dashboard setup is in `AUTHENTICATION_SETUP.md`. |
| High | Payment migrations cannot be treated as a working lifecycle | `supabase/migrations/20261106020000_bkash_payment_workflow.sql`, `supabase/migrations/20261107000000_payment_bkash_verification.sql`, `src/pages/TeamTournamentsPage.tsx`, `src/pages/QuickMatchesPage.tsx` | The first migration has an incomplete Storage bucket `VALUES` clause. The second reuses `public.payments` with a different assumed column set and creates policies against columns absent from the earlier definition. Current UI explicitly blocks paid registration and has no payment queue. | Unresolved; requires migration reconciliation and staging database tests. No migration pushed. |
| High | Database security claims are not verified on the target project | `supabase/migrations/`, `supabase/tests/` | RLS, grants, RPCs, and storage policies exist in source migrations, but migration application state is unknown and no SQL test runner is connected. | Source reviewed; live RLS/Storage isolation unverified. |
| Medium | Members could not edit phone from the account page | `src/pages/AccountPage.tsx`, `supabase/migrations/20261106000000_security_profiles_hardening.sql` | UI displayed phone but omitted it from editing; existing profile save call omitted phone and the older RPC rejected phone changes. | Added owner-scoped `update_my_contact_profile` RPC migration and name/phone UI. Migration has not been applied. |
| Medium | Account profile save previously sent unrelated blank fields | `src/pages/AccountPage.tsx` | The account page built `save_player_profile` payload from unrendered state, which could clear unrelated profile values. | Account contact save now uses a narrow dedicated RPC. |
| Medium | Admin member management and support/review portal are absent | `src/App.tsx`, `src/pages/AdminContentPage.tsx`, `src/pages/DisputesDashboardPage.tsx` | Routes expose tournament operations/settings/content, but no member administration or admin support/dispute queue is routed. | Documented as unavailable; not misrepresented as operational. |
| Medium | Role permission model is split across migration generations | `src/pages/AdminLoginPage.tsx`, `api/admin-login.js`, `supabase/migrations/20261106010000_competition_model.sql` | Current role checks use trusted `app_metadata`, but newer permission families and legacy tournament gates differ. No role-management UI exists. | No public escalation path found in reviewed signup/UI. Provisioning must remain trusted and role matrix needs staging tests. |
| Low | OTP delivery errors were mostly collapsed to a generic fallback | `src/auth/errorMessage.ts` | Auth error helper only mapped rate-limit and a small set of legacy password errors. | Added safe categories for malformed email, SMTP/provider delivery, signup disabled, existing user, and rate limits. |
| Low | SQL security tests do not currently prove all implemented workflow contracts | `supabase/tests/payment_security.test.sql`, `supabase/tests/security_remediation.test.sql` | `payment_security.test.sql` expects a competition payment/review/refund RPC set that is not provided consistently by the checked-in payment migration sequence. | Tests were inspected but not executed; test/migration alignment remains open. |

## Authentication and authorization

- Member signup and login use email OTP, and session persistence/refresh is configured in the Supabase client. Real delivery and verification were not tested.
- The browser reads the public project URL/key from environment and rejects service-role keys. This source does not identify which project is configured in a deployed build.
- Admin login is not OTP: the Vercel function checks a server-only access key, lockout state, service-role configuration, and a uniquely configured Auth user with a trusted admin claim before creating a magic-link session.
- Public signup writes user metadata only; admin authorization uses `app_metadata` claims. No member-facing role mutation was found in the inspected flows. Database-side role changes still depend on trusted Supabase administration, not a local role-management feature.
- Frontend route checks are not the security boundary. Reviewed RPCs generally derive the actor with `auth.uid()` and check authorization, but this was not executed under member/admin JWTs against PostgreSQL.

## Privacy and storage

- Profile hardening grants direct table access only to selected profile columns; phone is excluded from public/client column grants. `get_my_profile()` scopes to `auth.uid()`. The public profile view exposes only its selected public fields and respects profile visibility; phone/email are not included.
- Payment and support/dispute migrations define RLS and private evidence/proof buckets with path/ownership policies. Since those migrations are unverified and the payment migration chain conflicts, do not treat private file or payment isolation as live-verified.
- Public leaderboard/history views are designed around published results and profile visibility. The actual live database grants, view definitions, and storage bucket settings were not queried.

## Business logic state

- Free team tournament registration has a database RPC path with captain, roster, capacity, timing, duplicate, and payment-required checks. Quick Match source now includes free individual/team signup, admin review/assignment, scheduled rooms, and time-gated room retrieval; these paths have not been tested against PostgreSQL.
- Paid registration, payment review UI, individual tournament registration, and Quick Match results/leaderboards are not connected end-to-end.
- Match assignment, room access, result scoring/review/publication have database functions in source. No integration/RLS test ran against a database.
- The admin content page's “New article” control has no handler; support/dispute review is not available in routed admin UI.

## Changes in this work

- Added `supabase/migrations/20261113150000_member_contact_profile.sql`, a forward-only owner-scoped profile contact update that requires confirmed email and validates name/phone.
- Added `supabase/migrations/20261113180000_team_join_codes.sql` for expiring captain-created codes, optional verified-email binding, one-active-team enforcement, and roster capacity checks.
- Added `supabase/migrations/20261113170000_team_logo_member_uploads.sql` for active-member logo uploads with a member-scoped storage path and RPC.
- Added `supabase/migrations/20261113190000_team_code_and_banner_urls.sql` for generated unique team codes and admin/member HTTPS banner/logo setters.
- Added `supabase/migrations/20261113160000_quick_match_schedule_updates.sql` for role normalization and admin-only Quick Match date changes.
- Updated `src/pages/AccountPage.tsx` to edit full name/phone and request email changes through Auth verification.
- Updated `src/auth/AuthProvider.tsx` to initiate email changes with the callback URL.
- Updated `src/auth/errorMessage.ts` with non-sensitive OTP/email-delivery error classifications.
- Added this report plus workflow, admin-functionality, and auth-setup documentation.

## External configuration and verification still required

- Configure matching Supabase project URL and publishable key, Email provider, mandatory email confirmation, OTP template containing `{{ .Token }}`, SMTP, Site URL, redirect allowlist, and rate limits.
- Configure server-only admin environment values and provision exactly one trusted admin Auth user.
- Reconcile payment migration table/function contracts and correct the malformed migration before a clean staging migration run.
- Apply migrations only in a controlled environment after review; no migration was pushed by this work.
- Quick Match and Team Code database behavior has not been exercised against a PostgreSQL/Supabase instance; frontend checks do not prove RLS policies or RPC grants are deployed.
- Run pgTAP/RLS/storage/RPC tests with regular-member and admin JWTs; test signup, delivery, OTP verification, email change, profile update, registration, room release, results, and admin operations.
- Run dependency vulnerability scanning and browser-level workflows; neither has been performed here.

## Residual risk

This report is not a production penetration test or certification. Database grants, applied migration state, Auth provider configuration, SMTP delivery, storage policies, API deployment secrets, rate limiting, and real user role claims remain unverified. Do not claim OTP delivery, payment operations, or complete security coverage until staging verification passes.
