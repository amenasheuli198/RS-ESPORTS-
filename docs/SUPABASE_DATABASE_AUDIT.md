# Supabase Database Audit

## Scope and Verification

This audit is based on the repository's 11 SQL migrations and the React/TypeScript Supabase callers in `src/`. The supplied production project ref (`jgcbnoiaqtqexhgcjmok`) was not accessed. No SQL was run against Supabase, no migrations were applied, and no production tables, policies, grants, or Auth settings were verified. The claimed prior observation that the production public schema had no application tables is not independently verified here. Migration history is unknown, so historical migration files must be treated as immutable until their applied status is established.

The local workspace is a GitHub VFS workspace. VS Code diagnostics are available, but a local PostgreSQL/Supabase test environment and package build were not available from the terminal during this audit.

## Findings

| ID | Severity | Migration / SQL object | Problem and impact | Recommended fix | Migration strategy |
|---|---|---|---|---|---|
| DB-01 | High | `20261103180000_achievements_badges.sql`: `try_award_achievement` | Execute is granted to every authenticated user. With `p_manual = false`, the function does not require the actor to be an admin or validate achievement criteria, and accepts an arbitrary target `p_user_id`. An authenticated caller can forge awards for themselves or others. | Revoke direct player execution; require an admin claim for manual awards; bind `awarded_by` to `auth.uid()`; put automatic awards behind a private, criteria-checked path. | New forward migration; do not rewrite history. |
| DB-02 | High | `20261103180000_achievements_badges.sql`: `evaluate_player_achievements`, `evaluate_achievement_for_result` | Both functions are granted to all authenticated users, accept caller-selected user/result IDs, and execute as definer. `evaluate_player_achievements` can award any matching active achievement to the supplied user. | Revoke client execution or enforce a trusted admin/system authorization path and derive target users from the published result. | New forward migration. |
| DB-03 | High | `20261103210000_platform_settings.sql`: `get_private_platform_settings` | Definer function returns every setting and is executable by all authenticated users without checking admin authorization. Table RLS does not constrain a definer function. | Require an admin role inside the function and restrict its execution grant; alternatively expose only safe setting keys. | New forward migration. |
| DB-04 | High | `20261103170000_player_profiles.sql`: `player_match_history_public`, `player_stats_public` | Public history and aggregate stats do not filter on `profiles.match_history_visibility`. Private players can have history and derived totals exposed. | Filter public history and stats by privacy; provide a separate owner-scoped path if private users must see their own data. | New forward migration recreating the views. |
| DB-05 | High | `20261103170000_player_profiles.sql`: `player_match_roster_snapshots` | Table contains user IDs and Free Fire UID snapshots, but the migration does not enable RLS or declare explicit grants/revokes. Exposure depends on project default grants, which are unverified. | Enable RLS, revoke direct client access, grant access only through audited, privacy-filtered views/RPCs. | New forward migration. |
| DB-06 | High | `20261103120000_tournament_management.sql`: `rs_internal.is_tournament_admin`; all admin RPCs | Admin authorization accepts any JWT with `app_metadata.role = 'admin'`. This is safe only while app metadata is exclusively set by a trusted Auth Admin process. No finer-grained permissions exist. | Provision claims only through trusted server/admin operations; add explicit permission checks for finance, competition, support, and super-admin actions. | New forward migration plus trusted provisioning procedure; never let browser code write claims. |
| DB-07 | High | `20261103200000_support_disputes.sql`: `dispute_evidence`, `add_dispute_evidence` | Metadata requires bucket `support-evidence`, but no migration creates that bucket or policies. The RPC validates the bucket name and claimed size but does not prove that the object exists, matches the caller, or is private. | Create private bucket and scoped object policies; bind metadata to actual object ownership/path and verify content limits before accepting references. | New forward migration; bucket state must be preflighted. |
| DB-08 | High | Competition/payment schema (absent) | There are no payment, TXID, proof, refund, or payment-review entities/functions. Paid tournament registration is explicitly rejected by `register_team_for_tournament`. The current model cannot perform the requested bKash workflow. | Add a shared payment lifecycle, unique normalized TXID, private proof storage, reviewer attribution, amount validation, and atomic registration transition. | New forward migration. |
| DB-09 | High | `20261103140000_match_scheduling_rooms.sql`: `matches.tournament_id`, `match_team_assignments.registration_id` | Match rows require a tournament, assignments require a tournament registration, and assignment team IDs are mandatory. Standalone Quick Matches and individual chess participants cannot be represented. | Add a shared competition/entry model and make the tournament relationship optional through a forward migration; preserve legacy rows and joins. | New forward migration after data/history preflight. |
| DB-10 | High | `20261103000000_team_management.sql`: `team_members`; `20261103170000_player_profiles.sql` | Team membership requires Free Fire UID and fixed slots. Player profiles contain only Free Fire identity columns. This prevents configurable PUBG rosters and individual Chess entries. | Add game/format catalog and game-scoped player identities; model entries as team or individual. | New forward migration and compatibility layer. |
| DB-11 | Medium | `20261103170000_player_profiles.sql`: `save_player_profile` | Optional JSON values are initialized as empty strings, then tested with `IS NOT NULL`; blank optional fields therefore fail validation. The function does not persist `full_name`, and there is no phone column or profile completion timestamp. | Normalize blank strings to NULL before validation; update full name; add phone and server-side completion state. | New forward migration replacing the function and adding columns. |
| DB-12 | Medium | `20261103160000_announcements_notifications.sql`: `set_my_notification_preferences` | The `p_system_updates` parameter is ignored and `system_updates` is always set to `true`. | Persist the supplied boolean and test each preference independently. | New forward migration replacing the function. |
| DB-13 | Medium | `20261103200000_support_disputes.sql`: `support_messages` policies | Owners can insert replies but there is no owner SELECT policy for their ticket messages. The support page lists tickets only, so conversation history and staff replies are not available to players. | Add owner-scoped SELECT policy that excludes internal notes; keep internal notes admin-only. | New forward migration and frontend work. |
| DB-14 | Medium | `20261103200000_support_disputes.sql`: `create_tournament_dispute` | The RPC checks that a supplied tournament is published but does not validate that `p_match_id` belongs to it, that a registration belongs to the submitter/team, or that null context is appropriate for the selected category. | Validate all supplied foreign-key relationships and participant ownership in the transaction. | New forward migration replacing the function. |
| DB-15 | Medium | `20261103200000_support_disputes.sql`: `contact_requests` | Anonymous submissions are accepted without a database-side rate limit or abuse control. Length/format checks do not prevent automated spam. | Add edge/server rate limiting or CAPTCHA verification with a trusted server check; retain safe insert-only grants. | Backend configuration/function plus new migration only if required. |
| DB-16 | Medium | `20261103170000_player_profiles.sql`: `player_team_history_public` | View returns team membership identifiers, IGN, and Free Fire UID for all active/removed members without checking profile visibility or UID visibility. | Filter public fields by profile privacy and suppress game identifiers unless explicitly public; separate private owner history. | New forward migration recreating the view. |
| DB-17 | Medium | `20261103180000_achievements_badges.sql`: `player_achievements`, `badge_collection` | RLS is enabled but no client SELECT policies are defined. Direct player reads are unavailable; adding broad policies would expose award attribution/progress. | Add narrow owner/public-profile policies or safe views, matching the product privacy decision. | New forward migration. |
| DB-18 | Medium | `20261103140000_match_scheduling_rooms.sql`: `match_room_credentials` | Credentials are correctly withheld from direct table grants and retrieved through guarded RPCs. However the match itself must be `room_ready`/`live`, approved registration and active assignment are required, and `release_at` is checked server-side. This model is strong but tournament-only and has no explicit per-participant release audit. | Preserve the RPC boundary while moving participant checks to shared competition entries and auditing credential publication/access where required. | New forward migration. |
| DB-19 | Low | `20261103120000_tournament_management.sql`: tournament entry fields | Admin UI labels fees and prizes as USD, while the new requirement is bKash in Bangladesh. Currency is not stored, making historical fee interpretation ambiguous. | Store currency explicitly for new competition records; do not reinterpret existing values without owner confirmation. | New forward migration; do not rewrite legacy values silently. |
| DB-20 | Low | `20261103130000_tournament_registrations.sql`: capacity flow | Pending registrations reserve slots and registration/review functions lock the tournament row, so the existing team registration capacity path is substantially race-safe. Paid entries are rejected; the path remains team-only. | Preserve row locking when moving to shared entries; test concurrent joins and approvals. | Future migration/tests. |

## Migration-by-Migration Inventory

1. `20261102000000_profiles_auth.sql`: creates `profiles` keyed to `auth.users`, basic self-read/self-update RLS, update timestamp trigger, and Auth user profile trigger. It has no phone or completion state.
2. `20261103000000_team_management.sql`: creates teams, Free Fire-only roster rows, invitations, team management/security-definer RPCs, and private team-logo bucket policies. Roster slots and UID validation are fixed to a 4-player Free Fire lineup plus one substitute.
3. `20261103120000_tournament_management.sql`: creates tournament definitions, admin claim helper/RLS, save/publish/cancel/lifecycle RPCs, public view, and private banner bucket policies. Formats are text codes; no stages/round entities.
4. `20261103130000_tournament_registrations.sql`: creates team-only registration/event/notification tables and RPCs for registration, withdrawal, review, and admin queries. Pending entries reserve capacity. Paid entries are rejected by registration.
5. `20261103140000_match_scheduling_rooms.sql`: creates tournament-bound matches, team assignments, private room credentials, match events, schedule/admin/room RPCs, and public schedule view. Room retrieval is member- and release-time-gated.
6. `20261103150000_match_results_scoring.sql`: creates battle-royale placement/kill scoring, result/audit tables, result workflow RPCs, and team leaderboards. It does not represent chess scores or individual participants.
7. `20261103160000_announcements_notifications.sql`: extends registration notifications, adds preference table/RPC, notification triggers, announcement table/RPC/view, and audience-scoped RLS. The system preference argument is ignored.
8. `20261103170000_player_profiles.sql`: adds Free Fire player fields/privacy flags, roster snapshots, public profile/history/stat/team-history views, and profile save RPC. Privacy is inconsistently applied; snapshots lack RLS; profile save has blank-field/full-name defects.
9. `20261103180000_achievements_badges.sql`: creates definitions, player achievements and badge collection, evaluation/award functions, public catalog. Authenticated grants allow arbitrary target IDs/award paths; achievement tables have no read policies.
10. `20261103200000_support_disputes.sql`: creates anonymous contact requests, player support, disputes and evidence metadata, RPCs and RLS. Evidence bucket/policies are absent; message owner reads and relationship validation are incomplete.
11. `20261103210000_platform_settings.sql`: creates settings/audit tables, admin write RPC, public and private getter, seed routines and RLS. Private getter lacks its own admin check despite authenticated EXECUTE grant.

## Frontend/Database Compatibility

- Player login and registration now use email OTP in the current frontend. Profile completion page calls `complete_my_profile`, which is not present in the existing migrations; phone persistence and server-side completion enforcement are therefore absent.
- Existing account UI calls `save_player_profile`; its current payload does not include full name and sends blank optional fields that the existing function mishandles.
- Existing team and tournament registration callers match their current RPC signatures but are Free Fire/team-only. The tournament registration page correctly cannot complete paid entry.
- Existing match pages query `matches_public`; the SQL only exposes matches joined to published tournaments. No standalone match view exists.
- Results and leaderboards consume team placement/kills and cannot represent chess or individual results.
- News/CMS pages query `article_listing_public`, `article_detail_public`, and `article_categories`; these objects are absent from the 11 migrations.
- The current `AdminLoginPage` has no hardcoded administrator emails; authorization checks the trusted `app_metadata.role` claim. No client-side role assignment is present.
- The public team directory/gallery is absent; the existing teams page is a signed-in user's own team/invitations screen.

## Required Pre-Deployment Actions

- Establish migration history and inspect production schema through an authorized read-only channel before deployment. This audit did not connect to the supplied project ref.
- Fix DB-01 through DB-17 before exposing production traffic; assess DB-18 through DB-20 against product decisions.
- Apply migrations to a disposable local/staging Supabase project and run authorization tests with multiple JWT roles.
- Verify exact Vercel/Supabase Auth URLs, SMTP/OTP, storage buckets, table grants, function grants, and RLS in the target environment.
- Do not use production for destructive tests and do not run `supabase db push`, remote reset, or migration repair as part of this audit.

## Forward Remediation Prepared

The following new forward-only migrations have since been added to the repository. This is source preparation only; none has been executed or verified against a database:

| Migration | Prepared scope | Important remaining caveat |
|---|---|---|
| `20261106000000_security_profiles_hardening.sql` | Profile phone/completion RPC, readiness guard, profile-column grants, privacy-filtered views, snapshot RLS, private settings and achievement RPC checks, notification preference fix. | SQL has not been run; client/UI deployment must be coordinated with this schema. |
| `20261106010000_competition_model.sql` | Games/formats, team game identities, Quick Match/tournament competition parent, stages/rounds, team/individual entries, roster snapshots, legacy tournament mirror, initial admin permission helper. | Role provisioning and invite/roster edge cases need staging tests; not all admin permission domains are implemented. |
| `20261106020000_bkash_payment_workflow.sql` | Pending manual payments, normalized unique TXID, private proof bucket, review/refund records and permission-checked RPCs. | No official bKash verification; human verification and frontend review screens remain required. |
| `20261106030000_support_evidence_hardening.sql` | Private support-evidence bucket, object verification, internal-note message read restriction, direct evidence insert revocation. | No anti-abuse edge/server rate limiter for anonymous contact submissions. |
| `20261106040000_competition_match_operations.sql` | Optional tournament relation, competition-linked matches, team/individual assignments, gated room access, status/cancel operations. | Notifications for standalone competition operations and frontend integration remain incomplete. |
| `20261106050000_competition_scoring_results.sql` | BR and Chess score configurations, generic entry-based results, review, publication, correction audit, competition leaderboard. | No SQL migration or authorization test has been executed; live history and compatibility remain unverified. |

The original findings remain source findings until these migrations are applied to a disposable local/staging database and the checks pass. No production status is implied.

## Remediation Status

| Finding | Status in repository source |
|---|---|
| DB-01 / DB-02 achievements | Client RPCs now require a trusted admin claim; manual awards require criteria and server-derived actor. Prepared in `20261106000000_security_profiles_hardening.sql`; unexecuted. |
| DB-03 private settings | Function now checks admin claim. Prepared; unexecuted. |
| DB-04 / DB-05 history and snapshots | Public views filter by history privacy; raw snapshots have RLS and no client table grants. Prepared; unexecuted. |
| DB-07 evidence storage | Private bucket, scoped policies, verified object metadata, and direct insert revoke prepared. Unexecuted. |
| DB-08 / DB-09 / DB-10 competition model | New competition/entry/payment model, nullable tournament match relation, game identities, and formats prepared. Frontend still uses legacy tournament flows for most pages. |
| DB-11 profile | Full name/phone completion, owner RPC, phone change guard, and optional blank normalization prepared. Frontend account/profile callers were switched to RPCs. Unexecuted. |
| DB-12 preferences | `p_system_updates` now persists. Prepared; unexecuted. |
| DB-13 support messages | Owner message reads exclude internal notes; support staff have explicit scoped policies/RPCs. Prepared; unexecuted. |
| DB-14 dispute relation checks | Insert trigger validates submitter, match/tournament, registration/tournament, and team membership. Prepared; unexecuted. |
| DB-15 anonymous contact abuse | Still unresolved; requires a trusted edge/server rate-limit and challenge verification. |
| DB-18 room security | Competition room RPC checks confirmed assignment and server release time. Prepared; unexecuted. |
| DB-19 currency | Legacy USD fee values are preserved as USD; new paid competition creation only allows BDT. |
| DB-20 capacity | New competition registration locks the competition row and has partial unique indexes. Prepared; concurrency test not run. |

These are source changes, not a claim that the project database has been migrated. Result notifications, full admin role lifecycle/audit, additional support/finance workflows, and frontend integration remain open.
