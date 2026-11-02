# Dark Arena --- Esports Website Design Specification

**Document type:** UI/UX Design Specification\
**Project:** Free Fire Esports Tournament Platform\
**Design direction:** Dark Arena --- Premium Esports\
**Status:** Initial design baseline\
**Version:** 1.0

------------------------------------------------------------------------

## 1. Product Vision

Build a premium, competitive esports tournament platform where Free Fire
teams can discover tournaments, register squads, manage team
information, receive match details, and follow results and rankings.

The experience should feel like a professional esports league: bold,
energetic, trustworthy, and easy to use. It must not look like a generic
business website or an unofficial game client.

### Initial scope

-   Game supported at launch: **Garena Free Fire**
-   Primary competition format: **Battle Royale Squad**
-   Standard squad: **4 starting players**, with an optional substitute
-   Registration model: team captain registers the squad
-   Entry fee: configurable per tournament; support free-entry
    tournaments
-   Platform roles: visitor, player/team captain, and administrator

Do not assume prize pools, tournament rules, or entry fees. These must
be configurable for each tournament.

------------------------------------------------------------------------

## 2. Design Principles

1.  **Mobile-first:** Most participants are expected to use smartphones.
    Registration and team management must work comfortably on small
    screens.
2.  **Competition-first:** Tournament status, available slots,
    registration deadlines, and match schedules should be easy to find.
3.  **Clear hierarchy:** Use strong headings, readable labels, and
    obvious primary actions.
4.  **Trust and transparency:** Clearly show tournament rules,
    eligibility, registration status, and result publication status.
5.  **Fast and focused:** Avoid unnecessary animations, oversized
    effects, and clutter.
6.  **Accessible:** Maintain readable contrast, visible focus states,
    clear form errors, and keyboard navigation.
7.  **Consistent:** Reuse the same colors, spacing, typography, buttons,
    and card patterns throughout the application.

------------------------------------------------------------------------

## 3. Visual Identity

### 3.1 Color palette

  --------------------------------------------------------------------------
  Token                      Hex                     Usage
  -------------------------- ----------------------- -----------------------
  `--color-bg`               `#0B0D12`               Main page background

  `--color-surface`          `#171B24`               Cards, panels,
                                                     navigation

  `--color-surface-raised`   `#202633`               Hover states, nested
                                                     panels

  `--color-primary`          `#FF5A1F`               Primary actions, active
                                                     states, highlights

  `--color-primary-hover`    `#E94B13`               Primary button hover

  `--color-gold`             `#F5B700`               Championship and
                                                     achievement accents

  `--color-text`             `#F5F5F5`               Main text

  `--color-text-muted`       `#9CA3AF`               Secondary text and
                                                     metadata

  `--color-border`           `#2B3240`               Card borders and
                                                     dividers

  `--color-success`          `#22C55E`               Approved, completed,
                                                     success

  `--color-warning`          `#F59E0B`               Pending, warning,
                                                     approaching deadline

  `--color-danger`           `#EF4444`               Rejected, closed,
                                                     destructive actions

  `--color-info`             `#38BDF8`               Informational states
  --------------------------------------------------------------------------

Use orange as the main accent. Gold is a secondary highlight and must be
used sparingly. Do not use every accent color decoratively.

### 3.2 Typography

-   **Display/headings:** Rajdhani, with a sensible sans-serif fallback.
-   **Body/UI:** Inter, with a system sans-serif fallback.
-   Use bold or semibold weights for headings and actions.
-   Use uppercase sparingly for short labels, buttons, and tournament
    tags.
-   Do not use futuristic display fonts for long paragraphs or form
    instructions.

Suggested hierarchy:

  Element              Desktop     Mobile
  ----------------- ---------- ----------
  Hero heading        56--72px   36--44px
  Page heading        40--48px   30--36px
  Section heading     28--32px   24--28px
  Card heading        20--24px   18--22px
  Body                    16px   15--16px
  Metadata            12--14px   12--13px

### 3.3 Shape, borders, and effects

-   Cards: 10--16px corner radius.
-   Buttons and inputs: 8--12px corner radius.
-   Use subtle 1px borders in `--color-border`.
-   Prefer restrained shadows and subtle orange highlights.
-   Avoid excessive neon glow, glassmorphism, constant pulsing, and
    distracting gradients.
-   Use gradients only for selected hero artwork overlays or special
    tournament highlights.

------------------------------------------------------------------------

## 4. Layout and Responsive Behavior

### Desktop

-   Maximum content width: approximately 1280px.
-   Center the main content with consistent horizontal gutters.
-   Use a horizontal top navigation for public pages.
-   Use a fixed or sticky sidebar for authenticated dashboards where
    appropriate.
-   Tournament grids may use 3 columns on wide screens and 2 columns on
    medium screens.

### Mobile

-   Use a compact header with a menu or clearly visible navigation.
-   Use one-column tournament cards.
-   Use full-width primary actions where helpful.
-   Use a mobile bottom navigation for the signed-in team dashboard.
-   Keep form fields large enough to tap comfortably.
-   Never require horizontal scrolling for core content.
-   Tables should become stacked cards or use carefully controlled
    horizontal scrolling only when necessary.

### Suggested breakpoints

-   Small mobile: below 480px
-   Mobile/tablet: 480--767px
-   Tablet/desktop: 768--1023px
-   Desktop: 1024px and above

------------------------------------------------------------------------

## 5. Public Website Information Architecture

Primary navigation:

-   Home
-   Tournaments
-   Leaderboard
-   Match Schedule
-   News
-   Login / Register

The navigation should include a prominent **Find a Tournament** or
**Explore Tournaments** action. Do not expose admin navigation to public
users.

### 5.1 Homepage

Recommended section order:

1.  **Header**

    -   Brand logo/name
    -   Main navigation
    -   Login / Register
    -   Primary CTA: Explore Tournaments

2.  **Hero**

    -   Large, licensed or original esports-themed artwork.
    -   Headline such as "ENTER THE ARENA."
    -   Supporting text explaining that teams can compete in Free Fire
        tournaments.
    -   Primary CTA: Browse Tournaments.
    -   Secondary CTA: Create Your Team.
    -   Do not imply official Garena affiliation.

3.  **Platform statistics**

    -   Show only real values from the database.
    -   Examples: tournaments hosted, registered teams, completed
        matches.
    -   If no real data exists, use a helpful empty state instead of
        fabricated numbers.

4.  **Featured tournament**

    -   Tournament banner
    -   Name and game mode
    -   Entry fee
    -   Prize pool, only if configured
    -   Available slots / total slots
    -   Registration deadline
    -   Status
    -   View Details CTA

5.  **Upcoming tournaments**

    -   Responsive tournament card grid
    -   Filters or tabs for Open, Upcoming, and Completed

6.  **How to participate**

    -   Create an account
    -   Create a team
    -   Add squad members
    -   Register for a tournament
    -   Check match information

7.  **Leaderboard preview**

    -   Top teams and points from published results
    -   Link to the full leaderboard

8.  **Announcements/news preview**

9.  **Footer**

    -   About
    -   Contact/support
    -   Rules
    -   Privacy policy
    -   Terms
    -   Social links, when configured
    -   Clear statement that the platform is independently operated and
        is not endorsed by Garena

### 5.2 Tournament listing page

Include:

-   Page title and short explanation
-   Search by tournament name
-   Filters: status, mode, date, and entry type
-   Sort options: newest, registration deadline, and start date
-   Tournament cards
-   Pagination or incremental loading
-   Empty state when no tournaments match

Tournament status labels should be consistent:

-   Registration Open
-   Registration Closing Soon
-   Registration Closed
-   Upcoming
-   Live
-   Completed
-   Cancelled

Do not use color alone to communicate status; include text labels.

### 5.3 Tournament details page

Display:

-   Tournament cover/banner
-   Tournament name and status
-   Game and mode
-   Match format and team size
-   Entry fee
-   Prize details, if configured
-   Total slots and available slots
-   Registration opening and closing dates
-   Match date and time, including timezone
-   Eligibility requirements
-   Full rules and scoring system
-   Map/round information, if relevant
-   Organizer contact/support
-   Register or registration-status CTA

Clearly explain what happens after registration. Never promise a
confirmed slot until the server has accepted the registration.

------------------------------------------------------------------------

## 6. Team Registration Experience

The registration flow should be captain-led and easy to complete on
mobile.

### Step 1 --- Sign in

-   User signs in or creates an account.
-   Show clear validation and authentication feedback.

### Step 2 --- Create or select a team

Fields:

-   Team name
-   Team logo (optional)
-   Team captain/contact details
-   Region or location, if required by tournament rules

### Step 3 --- Add squad members

For each starting player:

-   In-game nickname (IGN)
-   Free Fire UID
-   Optional display name if needed

Allow one optional substitute if enabled by the tournament.

### Step 4 --- Review and submit

-   Show a clear summary of team and tournament information.
-   Require acceptance of tournament rules.
-   Explain the registration status and next steps.
-   Prevent accidental duplicate submissions.

### Form behavior

-   Label every field; do not rely on placeholders alone.
-   Validate required fields and UID format according to the platform's
    configured rules.
-   Show field-level errors and a summary when submission fails.
-   Preserve entered data after recoverable errors.
-   Show a loading state while submitting.
-   Prevent repeated submissions while a request is processing.
-   Confirm successful submission with a registration reference.
-   Do not treat client-side validation as a security boundary; validate
    again on the server.

------------------------------------------------------------------------

## 7. Team Dashboard

The dashboard should help captains understand what needs attention.

### Navigation

-   Overview
-   My Team
-   My Tournaments
-   Match Information
-   Results
-   Profile / Settings

### Overview content

-   Team name and logo
-   Team verification/registration status, if applicable
-   Quick links to edit team and browse tournaments
-   Upcoming match card
-   Recent tournament activity
-   Important announcements

### My Team

-   Team profile
-   Captain details
-   Starting squad roster
-   Substitute roster, if configured
-   Player IGN and UID
-   Edit controls with appropriate permissions
-   Clear indication of which fields are locked after a tournament
    registration deadline

### My Tournaments

Each registration should show:

-   Tournament name
-   Registration date
-   Registration status
-   Slot or group, once assigned
-   Match schedule, once published
-   Action required, if any

### Match Information

-   Match date and time
-   Match number/round
-   Group or lobby
-   Room ID and password, when released
-   Instructions and check-in deadline

Room credentials are sensitive tournament information. Only eligible,
approved participants should be able to retrieve them through authorized
backend access.

------------------------------------------------------------------------

## 8. Leaderboard and Results

### Leaderboard

Show:

-   Rank
-   Team name/logo
-   Matches played
-   Wins / Booyahs
-   Placement points
-   Kill points
-   Total points

The scoring configuration must be defined by the tournament organizer.
Do not hardcode an assumed scoring system for every tournament.

Include filters for tournament, stage, group, and season where relevant.

### Results

-   Match-by-match results
-   Team placement
-   Kill count
-   Points awarded
-   Total points
-   Result publication status
-   Evidence or screenshot attachment, if provided

Clearly distinguish draft, under-review, and published results. Only
published results should affect the public leaderboard.

------------------------------------------------------------------------

## 9. Admin Dashboard

The admin dashboard should use the same design system but prioritize
operational clarity over visual effects.

### Admin navigation

-   Overview
-   Tournaments
-   Registrations
-   Teams
-   Matches
-   Results
-   Announcements
-   Users
-   Settings
-   Audit Log

### Admin capabilities

-   Create, edit, publish, close, and cancel tournaments
-   Configure slots, format, rules, dates, and scoring
-   Review and approve/reject registrations
-   Assign groups and match slots
-   Publish room information to eligible teams
-   Submit, review, and publish match results
-   Manage announcements
-   Review reports and suspicious activity
-   View an audit history of important administrative actions

Use confirmation dialogs for destructive or high-impact actions. Show
success and failure feedback. Enforce all permissions on the backend;
hiding an admin button in the UI is not authorization.

------------------------------------------------------------------------

## 10. Reusable UI Components

Build a consistent component library:

-   `SiteHeader`
-   `SiteFooter`
-   `MobileNavigation`
-   `PrimaryButton`
-   `SecondaryButton`
-   `StatusBadge`
-   `TournamentCard`
-   `FeaturedTournament`
-   `TournamentFilters`
-   `TeamAvatar`
-   `TeamRoster`
-   `PlayerFormField`
-   `RegistrationStepper`
-   `EmptyState`
-   `LoadingSkeleton`
-   `ErrorState`
-   `ConfirmDialog`
-   `LeaderboardTable`
-   `MatchCard`
-   `AnnouncementCard`
-   `DashboardSidebar`
-   `MobileDashboardNavigation`

Components should support loading, empty, error, disabled, and success
states where relevant.

------------------------------------------------------------------------

## 11. Interaction and Motion

-   Use short transitions, generally 150--220ms.
-   Provide visible hover, focus, active, and disabled states.
-   Use subtle card lift or border changes on hover.
-   Use skeleton loaders for data-heavy sections.
-   Use toast messages for lightweight feedback and inline errors for
    form problems.
-   Respect `prefers-reduced-motion`.
-   Do not autoplay audio or use flashing effects.
-   Avoid animations that delay registration or navigation.

------------------------------------------------------------------------

## 12. Imagery and Brand Usage

-   Use original, licensed, or properly authorized artwork.
-   Use esports arena imagery as atmosphere, not as a substitute for
    readable content.
-   Use consistent team logo containers and tournament banner ratios.
-   Provide fallbacks when a team logo or banner is missing.
-   Do not copy Garena or Free Fire logos in a way that suggests
    official ownership or endorsement.
-   Do not use copyrighted game artwork unless the project has
    permission or the relevant usage is authorized.
-   Add meaningful alt text for informative images; mark purely
    decorative images appropriately.

------------------------------------------------------------------------

## 13. Accessibility and Quality Requirements

-   Maintain strong text/background contrast.
-   All interactive controls must be keyboard accessible.
-   Inputs must have persistent labels.
-   Focus indicators must be visible.
-   Status must not be conveyed by color alone.
-   Buttons must have clear action labels.
-   Images must have appropriate alternative text.
-   Tables need clear column headings.
-   Forms must identify errors in text and associate them with the
    relevant fields.
-   Test layouts at common mobile, tablet, and desktop widths.

------------------------------------------------------------------------

## 14. Design Acceptance Criteria

The design is ready for implementation review when:

-   [ ] The visual identity consistently follows the Dark Arena palette.
-   [ ] Public pages have clear navigation and a strong tournament
    discovery path.
-   [ ] Tournament cards display the key decision-making information.
-   [ ] Tournament details explain rules, dates, slots, and registration
    conditions.
-   [ ] Team registration is usable on a mobile device.
-   [ ] Team dashboard navigation is clear on desktop and mobile.
-   [ ] Admin screens prioritize safe and efficient operations.
-   [ ] Loading, empty, error, and success states are designed.
-   [ ] Real statistics are used; no fabricated counts or tournament
    data appear.
-   [ ] Room credentials and private team data are never displayed
    publicly.
-   [ ] Accessibility and responsive behavior are checked.

------------------------------------------------------------------------

## 15. Implementation Guidance for the Coding Agent

Treat this document as the design source of truth.

Before implementation:

1.  Inspect the repository and report its current framework, structure,
    scripts, and existing conventions.
2.  Identify whether the project is new or contains existing production
    code.
3.  Do not overwrite existing files, environment variables, database
    objects, or deployment settings without explaining the impact.
4.  Propose a concise implementation plan before making broad changes.
5.  Build reusable design tokens and components rather than duplicating
    styles.
6.  Use realistic sample content only where clearly marked as demo data.
7.  Keep secrets out of frontend code and source control.
8.  Do not implement frontend-only authorization as a substitute for
    backend security.
9.  Test responsive layouts and report the exact checks performed.
10. At the end of each task, summarize changed files, tests, known
    issues, and the next recommended task.

### Architecture baseline

-   Frontend hosting: Vercel
-   Frontend: React + Vite
-   Styling: Tailwind CSS (if compatible with the repository)
-   Backend services: Supabase
-   Database: Supabase PostgreSQL
-   Authentication: Supabase Auth
-   File storage: Supabase Storage
-   Server-side privileged operations: Supabase Edge Functions or other
    trusted server-side functions
-   Database access control: PostgreSQL Row Level Security (RLS)

The design document defines the intended user experience. It does not
authorize weakening database policies or exposing privileged credentials
to make the UI work.

------------------------------------------------------------------------

**End of design specification.**
