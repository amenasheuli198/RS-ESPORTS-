# Admin Functionality

Status reflects checked-in UI and migration code. It does not imply live database migrations or environment variables are deployed.

Status labels: **Fully Implemented** means the UI calls a persisted backend operation; **Partially Implemented** means only a subset is wired; **Not Implemented** means no working end-to-end operation is present; **Requires External Configuration** means platform settings are needed; **Implemented but Requires Security Fix** means code exists but must not be relied on until the noted boundary is verified.

## Admin dashboard

**Partially Implemented.** Shows registered profile count, teams, tournaments, active tournaments, pending registrations, scheduled/live/completed matches, published results, recent activity, and 7/30/90-day trends. Admin unread notifications are explicitly unavailable. Dashboard data is fetched from Supabase; it is not a separate aggregate/reporting service.

## Member management

**Not Implemented.** There is no admin member directory or UI to edit a member profile, disable accounts, change status, or administer roles. Admin registration review can display the team roster and personal names needed for that review; this is not general member management.

## Tournament management

**Partially Implemented.** Admins can create/edit tournament records, configure game/format, entry fee, schedule, capacity, roster requirements, rules and content, publish/cancel, change lifecycle, inspect registrations, and review registrations. Free team registration has a working RPC path. Paid registration is not connected to the payment workflow. Participant capacity and important state transitions are enforced by database functions, but a live database test was not run.

## Quick Match management

**Partially Implemented.** Admins can create and publish standalone Quick Matches, confirm free entries, assign confirmed participants to match lobbies, update Quick Match and lobby schedules, and set room credentials with a release time. Database RPCs enforce admin permission, participant capacity, assignment status, and time-gated room access. Paid registration and Quick Match results/leaderboards are not connected. These controls require the competition and match-operation migrations, including `20261113160000_quick_match_schedule_updates.sql`, and were not exercised against a live database.

## Payment management

**Not Implemented in the portal; migration code is inconsistent.** No admin payment queue or working end-to-end bKash review UI is routed. The repository has two competing payment schema/function designs. The bucket insert syntax in `20261106020000_bkash_payment_workflow.sql` is repaired in source, but the later `20261107000000_payment_bkash_verification.sql` still assumes incompatible columns on the same table. Do not treat payment submission, approval, rejection, or refunds as deployable until migrations are reconciled and tested in staging. No refund UI is present.

## Team management

**Partially Implemented.** Members can create/manage a team, roster, Team Codes, and team settings through the member team portal. Captains create one-time codes with a required player name and optional email/phone; a verified, profile-complete player redeems a code to join one active team. Email-bound codes require that verified email. Active roster members may change only the team logo; captain-only detail edits remain restricted. Admins can inspect roster details while reviewing a tournament registration. There is no dedicated admin team directory or admin roster-management portal. These actions require `20261113180000_team_join_codes.sql` and `20261113170000_team_logo_member_uploads.sql` to be applied.

## Results and leaderboards

**Partially Implemented.** Admins can configure tournament scoring; create result drafts; submit, verify, dispute, correct, and publish results. Server-side functions calculate points and enforce status checks. Public match results and leaderboard pages read published data. Operational correctness has not been confirmed against a live database.

## Announcements and notifications

**Partially Implemented.** Member-facing announcement and notification pages exist. The admin content page lists articles/categories and provides filters, but its “New article” control has no persistence handler. There is no complete admin announcement/notification-management workflow; dashboard admin alerts are unavailable.

## Support and disputes

**Partially Implemented for members; admin operations are not connected.** Members can submit contact requests, support tickets, and disputes. The dispute page submits a general dispute without tournament, match, or registration identifiers. Support/dispute tables, role checks, and private evidence policies exist in migrations, but the admin portal has no routed support/dispute review queue or evidence-review operation.

## Platform settings

**Partially Implemented.** The admin settings page reads private settings through `get_private_platform_settings` and writes through `set_platform_setting`. Database functions check admin permission and record changes. Settings depend on their migrations being applied; security-critical values and persistence were not tested against a live project.

## Admin roles and permissions

**Partially Implemented; provisioning requires trusted external administration.** Browser routes check trusted `app_metadata` roles for usability, while privileged database functions also check JWT app metadata/permission helpers. The admin login API uses a server-only access key, a service-role client, a lockout RPC, and requires exactly one Auth user with an `admin`, `super_admin`, or `super-admin` role. It creates a magic-link session for that account; admin login is not email OTP.

The migrations define `super_admin`, `admin`, `competition_manager`, `payment_reviewer`, `moderator`, and `support_agent` permissions in some function families. Legacy tournament admin checks accept only `admin`/`super_admin` claims. There is no in-app role provisioning/change flow; role claims must be assigned through a trusted Supabase Auth Admin process. Permission consistency across older and newer function families needs staging tests before granting non-admin roles.

## External configuration

The browser requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or a supported legacy public key). Admin login additionally requires server-only `ADMIN_ACCESS_KEY`, `ADMIN_SESSION_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Values must be configured outside source control; none are documented here.
