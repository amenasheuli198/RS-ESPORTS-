# Supabase Security Remediation

## Scope

This document is a source-based remediation plan for the findings in `SUPABASE_DATABASE_AUDIT.md`. No production Supabase connection was made. It does not claim that any migration is applied or that a live policy is fixed. Existing migration files must remain unchanged until their application history is verified; remediation should be forward-only.

## Prioritized Remediation

| Priority | Finding | Required database change | Required frontend/infrastructure change | Verification |
|---|---|---|---|---|
| P0 | Arbitrary achievement awards/evaluation | Revoke client execution from `try_award_achievement`, `evaluate_player_achievements`, and `evaluate_achievement_for_result`; replace with criteria-checked server workflow or admin-only RPC. Actor comes from `auth.uid()`. | No direct client call unless it is a safe read path. | Player attempts award for self/other; non-admin RPC denied; criteria threshold tests. |
| P0 | Private settings disclosure | Add `is_admin` authorization inside `get_private_platform_settings`; limit EXECUTE; leave `get_public_platform_settings` limited to allowlisted public keys. | Admin settings page should handle access denied and never show success without a persisted response. | Player gets permission denied; admin reads private settings; anonymous sees public settings only. |
| P0 | Profile history privacy bypass | Recreate history/stat views with `match_history_visibility = 'public'` filtering; provide a separate owner-only RPC/view if required. | Player page must show private-state messaging and not infer private stats from empty data. | Public, authenticated non-owner, and owner role matrix. |
| P0 | Roster snapshot exposed by unspecified grants | Enable RLS and revoke direct client table privileges. Use tightly filtered views/RPCs for allowed output. | Do not query snapshot table directly. | `anon`/`authenticated` cannot select raw snapshots; approved public history still works. |
| P0 | Missing profile completion security | Add `phone`, completion state, `complete_my_profile`, and a stable `is_player_ready()` helper checking `auth.users.email_confirmed_at` and profile completion. Add database enforcement to registration/team-entry operations. | Keep OTP; call the deployed completion RPC; do not unlock protected actions on frontend state alone. | Unverified and incomplete users fail the same RPC even if they bypass React routing. |
| P1 | Dispute evidence storage absent | Create a private `support-evidence` bucket with explicit size/MIME policy and scoped object policies; verify object path and uploader before inserting metadata. | Upload only through Supabase Storage; show evidence only to submitter and authorized staff. | Other players/anon cannot list, download, or sign URLs. |
| P1 | Notification preference argument ignored | Replace preference RPC to persist every supplied boolean, including `p_system_updates`. | Reflect saved values after a successful RPC only. | Round-trip all combinations. |
| P1 | Dispute relationship validation | Validate match-to-competition and entry ownership, and enforce category requirements in one transaction. | Include selected competition/match/entry in the dispute form. | Attempt mismatched IDs and another user's entry. |
| P1 | Support message owner read missing | Add owner SELECT policy that excludes `is_internal_note`; internal notes remain staff-only. | Add conversation/reply UI only after policy tests pass. | Player reads own public messages but cannot read internal notes or other tickets. |
| P1 | Payment workflow absent | Add payments, payment events, proof references, refunds, and reviewer-only transitions. TXID unique; amount/currency checked server-side; approvals transactional and audited. | Show bKash instructions and pending/rejected/approved state; never expose an approval control to players. | Duplicate TXID, wrong amount, concurrent review, self-review, proof access, and refund tests. |
| P1 | Admin permission model coarse | Introduce role-permission mapping for super admin, admin, competition manager, payment reviewer, moderator, and support agent. Admin claims are provisioned only through trusted Auth Admin APIs. | Hide irrelevant admin controls for usability, while DB remains authoritative. | Positive and negative tests per role and RPC. |
| P2 | Anonymous contact abuse | Add a trusted edge/server rate-limit and bot challenge. Preserve insert-only client access; do not trust a client-supplied CAPTCHA boolean. | Submit token to server validation path. | Burst/duplicate abuse tests and valid submission test. |
| P2 | Game-specific identity and results | Add game/format catalog, identity table, individual/team entries, format-specific score payload validation, and audit history. | Update team, event, result, and leaderboard UI to consume new APIs. | Free Fire, PUBG, Chess fixtures and ownership tests. |

## Safe Function/Grant Pattern

For each privileged RPC:

1. `REVOKE ALL` from `PUBLIC`, `anon`, and `authenticated` as appropriate.
2. Use a fixed `search_path` and schema-qualified object names.
3. Derive the actor from `(select auth.uid())`; never trust an actor ID from JSON or parameters.
4. Check a database-side role/permission helper inside the function.
5. Validate ownership, lifecycle, amount, and state transition under row locks as needed.
6. Write the audit record in the same transaction.
7. Grant EXECUTE only to the caller role that should use the RPC.
8. Add negative authorization tests before frontend integration.

Do not create a broad `GRANT EXECUTE ON ALL FUNCTIONS` grant.

## Existing High-Risk RPCs to Reconcile

- `public.try_award_achievement(uuid,text,text,boolean,uuid)`
- `public.evaluate_player_achievements(uuid)`
- `public.evaluate_achievement_for_result(uuid)`
- `public.get_private_platform_settings()`
- `public.save_player_profile(jsonb)`
- `public.create_tournament_dispute(uuid,uuid,uuid,text,text)`
- `public.add_dispute_evidence(uuid,text,text,text,text,bigint)`
- `public.set_my_notification_preferences(boolean,boolean,boolean,boolean,boolean)`

Before deploying replacement functions, compare live `pg_proc`, `proacl`, table grants, RLS state, and migration history against this repository using an authorized read-only connection. No such comparison has been performed here.

## Current Status

- Client admin email literals removed from current frontend source in the preceding frontend task; this does not rewrite public Git history or revoke already-issued keys/tokens.
- Forward-only source migrations `20261106000000_security_profiles_hardening.sql` through `20261106050000_competition_scoring_results.sql` prepare remediations for private settings, achievement RPCs, profile phone/completion, profile history privacy, snapshot RLS, private evidence/payment proof storage, registration, result authorization/corrections, support-agent access, and dispute relationship validation.
- Not every listed issue is addressed: anonymous contact rate limiting, administrator role-change workflow/audit, notification delivery for standalone competition events, and end-to-end frontend integration remain open.
- None of the new migrations has been applied or SQL-executed. Their SQL has only been inspected in source; VS Code diagnostics are not a PostgreSQL parser.
- A repeatable pgTAP suite was added at `supabase/tests/security_remediation.test.sql`, but it has not been run. No local database runner is connected to the VFS workspace.
