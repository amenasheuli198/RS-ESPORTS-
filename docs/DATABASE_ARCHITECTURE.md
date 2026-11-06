# Database Architecture Proposal

## Implementation Status

Forward-only migrations now prepare a first implementation of the games/formats catalog, shared competition parent, stages/rounds, entries, game-scoped identities, bKash payment workflow, competition-linked matches, room access, and separate BR/Chess scoring. They are source files only and have not been executed. The proposal below describes the target direction; remaining items include frontend callers, role lifecycle/audit, qualification advancement automation, result notifications, support/contact anti-abuse, public team directory/logo access, and production-safe migration preflight.

## Goals

One competition/entry/payment/match/result lifecycle should serve Free Fire, PUBG, and Chess, support standalone Quick Matches without a tournament, preserve current tournament data, and keep room credentials/payment proof private. Existing tournament/team features should be migrated forward without rewriting historical migration files.

## Relationship Overview

```text
users -> profiles
users -> player_game_identities
users -> teams -> team_members

games -> game_formats
competitions -> games + game_formats
competitions -> competition_stages -> competition_rounds -> matches
competitions -> competition_entries -> competition_entry_members
competition_entries -> payments -> payment_events / payment_proofs / refunds
matches -> match_participants / match_team_assignments
matches -> match_room_credentials
matches -> results -> result_revisions
users -> audit_log (actor)
```

A Quick Match is a `competitions` row with `competition_type = 'quick_match'` and no tournament requirement. A tournament is the same parent with `competition_type = 'tournament'`, stages, and rounds. `matches.competition_id` is required for new competitions; a legacy tournament foreign key remains nullable during compatibility migration.

## Core Entities

| Entity | Purpose and key constraints |
|---|---|
| `games` | Stable code/name for Free Fire, PUBG, Chess; seeded by migration. |
| `game_formats` | Game-specific mode and participation kind (`team`/`individual`), min/max starters, substitute policy, capacity unit, and scoring scheme identifier. Unique `(game_id, format_code)`. |
| `player_game_identities` | `(user_id, game_id)` identity with in-game name and provider UID/rating; do not add one hard-coded identity column per game to `profiles`. Access scoped to owner and authorized competition operations. |
| `competitions` | Shared title/type/game/format/entry fee/currency/capacity/registration window/status/creator. Check `free => fee=0`, `paid => fee>0`; currency explicit (BDT for bKash competitions). |
| `competition_stages` | Ordered group/qualifier/semifinal/final stage and qualification configuration. |
| `competition_rounds` | Ordered round within stage, schedule, status, advancement rule. |
| `competition_entries` | One team or one individual per competition. Check exactly one of `team_id`, `player_id`; unique active participant per competition; approved/confirmed state controlled by RPC. |
| `competition_entry_members` | Snapshot of eligible roster members and game identity at entry time; supports starter/substitute role and bounded slots. Individual chess entries use the entry's player and do not require a team. |
| `competition_registration_events` | Immutable actor/state/reason/time history for entry submission, review, withdrawal, and disqualification. |
| `payments` | Entry FK, bKash provider, normalized unique TXID, sender phone, amount/currency, submitted/pending/approved/rejected/refund state, reviewer/timestamps. Use transaction-level checks to match fee and entry. |
| `payment_events` | Append-only status history with actor, reason, previous/new state, timestamp. |
| `payment_proofs` | Private Storage object path, uploader, MIME/size, timestamp; never public URL. Verify object ownership/policy before accepting reference. |
| `refunds` | Payment FK, amount, reason, status, requester/reviewer, timestamps and event history. |
| `matches` | Competition FK, optional stage/round, schedule, capacity and lifecycle. Quick Matches have no tournament FK. Legacy rows remain linked to old tournaments during transition. |
| `match_participants` | Individual participant assignment for Chess or solo formats. |
| `match_team_assignments` | Team-entry assignments for team formats. Enforce entry belongs to same competition and is confirmed. |
| `match_room_credentials` | One private row per match; room ID/password/release timestamp/status; direct table privileges revoked, access through audited RPC. |
| `match_results` | Match and entry/participant, format-specific input values and server-calculated points. Prevent duplicate participant result per match. |
| `result_revisions` | Immutable before/after/result actor/reason/timestamp history. Publication is a state transition, not a client write. |
| `leaderboard` views/RPCs | Aggregate only published results and partition by game, competition, format, and participant kind. Respect profile visibility. |
| `admin_audit_log` | Append-only security/operations log for roles, competition changes, payment decisions, refunds, room release, result correction, bans, and settings. Actor from `auth.uid()`. |
| `admin_role_permissions` | Trusted role/permission mapping for Super Admin, Admin, Competition Manager, Payment Reviewer, Moderator, Support Agent. No client role mutation. |

## Game Rules

- **Free Fire:** team entry, configurable squad size and substitute limit; per-player IGN/UID stored in `player_game_identities` and snapshotted for the entry/match.
- **PUBG:** team entry with format-specific roster range and UID rules; no fixed Free Fire squad assumptions.
- **Chess:** individual entry, optional rating source/type, pairing/round format, win/draw/loss scoring; no team foreign key requirement.

Scoring configuration identifies a scoring implementation per format. Battle-royale placement and kill points are not applied to Chess. All authoritative scores are calculated and validated by server-side functions.

## State and Authorization Boundaries

- Entry: `pending_payment` for paid competitions; free entries may enter review/confirmation flow. Only a permitted reviewer can approve/reject.
- Payment: `pending -> approved|rejected`; approval atomically confirms an eligible entry. Reject self-review and record reason/actor. A TXID is unique across payments.
- Match: `draft -> scheduled -> room_ready -> live -> completed|cancelled`, with explicit legal transitions.
- Room: credentials are retrievable only by assigned confirmed participants after DB time reaches `release_at`, or users with a specific room-management permission.
- Result: `draft -> submitted -> verified -> published`; corrections require reason and immutable revision. Participants cannot mutate official results.
- Profile completion: `auth.users.email_confirmed_at` and profile completion state checked inside database entry/team RPCs, not only React guards.

## Compatibility and Migration Approach

1. Establish actual applied migration history and schema through read-only production inspection before deployment. Until then, treat all existing migrations as immutable.
2. Add forward-only tables and nullable compatibility columns. Do not drop existing `tournament_id`, registration tables, columns, views, or policies without explicit approval and an observed data migration plan.
3. Backfill competition records for legacy tournaments only after confirming fee currency and mapping behavior. Existing fee values are labeled USD by the frontend; do not silently relabel them BDT.
4. Keep old RPCs working during frontend transition. Add explicit compatibility views/RPCs, verify old callers, and schedule deprecation separately.
5. Remove compatibility surfaces only in a later approved migration after production telemetry shows no remaining clients.

## Storage

- `team-logos` and `tournament-banners` remain private unless a separately reviewed public serving design is approved.
- Add `payment-proofs` and `support-evidence` as private buckets with size/MIME constraints and owner/role-scoped read policies.
- No room credentials in Storage; keep them in a private table with gated retrieval.
- Never trust object path, MIME, or size supplied solely by a client RPC; verify Storage metadata and uploader ownership.
