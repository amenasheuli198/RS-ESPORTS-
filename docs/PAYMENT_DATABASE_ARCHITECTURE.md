# PAYMENT DATABASE ARCHITECTURE

## Scope

This document records the source-only payment architecture prepared for the UNDERGRADUATE HUB E-Sports platform. It is intentionally forward-only and does not rewrite any historical Supabase migration history.

The project currently has existing tournament and registration tables but no payment workflow. There are no payment records, no TXID uniqueness rules, no refund ledger, and no private payment-proof bucket. This architecture therefore adds the missing payment layer without altering the established tournament model.

## Existing authoritative entities used by the payment flow

The repository already contains:

- `public.tournaments` for each event fee and lifecycle.
- `public.tournament_registrations` for a participant team registration.
- `public.platform_settings` for public and private settings metadata.
- `public.team_members` and `rs_internal.is_active_team_captain()` for ownership checks.

Because there is no `public.competitions` table in this repository, the authoritative payment linkage is:

- `payments.tournament_id` -> `public.tournaments.id`
- `payments.registration_id` -> `public.tournament_registrations.id`
- `payments.payer_user_id` -> `auth.users.id`

This prevents mismatched payment-to-registration relationships and keeps the solution aligned with the actual schema already in use.

## Payment schema summary

### `public.payments`

The table stores the bKash manual-verification payment lifecycle for a single registration.

Required columns:

- `id` UUID PK
- `tournament_id` UUID FK to `public.tournaments`
- `registration_id` UUID FK to `public.tournament_registrations`
- `payer_user_id` UUID FK to `auth.users`
- `payment_method` text default `bkash`
- `sender_phone` text
- `receiver_phone` text default `01845278579`
- `txid` text
- `normalized_txid` text
- `submitted_amount` numeric(12,2)
- `expected_amount` numeric(12,2)
- `currency` text default `BDT`
- `status` text
- `submitted_at` timestamptz
- `verified_by` UUID
- `verified_at` timestamptz
- `rejection_reason` text
- `created_at` timestamptz
- `updated_at` timestamptz

Rules:

- TXID is normalized to uppercase alphanumeric characters before storage.
- A global unique index prevents duplicate TXIDs from being reused across users.
- One payment is allowed per registration.
- `submitted_amount` must match `expected_amount` at submission time for the initial pay request.
- `expected_amount` is read from the authoritative tournament fee, not from client input.
- Payment approval and rejection are recorded with admin metadata and an immutable event log.

### `public.payment_events`

This table is the append-only payment audit trail.

Fields:

- `id` UUID PK
- `payment_id` UUID FK
- `previous_status` text
- `new_status` text
- `actor_user_id` UUID
- `action` text
- `reason` text
- `metadata` jsonb
- `created_at` timestamptz

The table is not designed for user mutation. It is intended for secure backend insertions only.

### `public.payment_proofs`

This table records metadata for uploaded payment screenshots or PDFs.

Fields:

- `id` UUID PK
- `payment_id` UUID FK
- `uploaded_by` UUID FK
- `storage_bucket` text
- `storage_path` text
- `file_name` text
- `mime_type` text
- `file_size` bigint
- `uploaded_at` timestamptz

The actual binary file is stored in a private Supabase Storage bucket named `payment-proofs`.

### `public.payment_refunds`

This table stores refunds without altering the original payment record.

Fields:

- `id` UUID PK
- `payment_id` UUID FK
- `refund_amount` numeric(12,2)
- `currency` text
- `refund_method` text
- `refund_txid` text
- `normalized_refund_txid` text
- `refund_reason` text
- `status` text
- `initiated_by` UUID
- `approved_by` UUID
- `completed_at` timestamptz
- `created_at` timestamptz
- `updated_at` timestamptz

Refunds are tracked separately from original payments to ensure audit clarity and prevent overwriting the original payment history.

## Security model

The payment system uses a restricted server-side permission helper that checks `auth.jwt()->'app_metadata'->>'role'` and grants only the required capabilities.

Allowed role capabilities:

- `super_admin`: full administrative access
- `admin`: general admin and payment review access
- `payment_reviewer`: view and review payments, not platform settings or super-admin actions

This ensures payment reviewers cannot automatically receive super-admin privileges or broader platform-control permissions.

## Storage model

The private Storage bucket is:

- `payment-proofs`

Bucket security:

- `public = false`
- `file_size_limit = 10MB`
- `allowed_mime_types = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']`

Policies:

- Player uploads are allowed only when the object path maps to that player's pending payment.
- Player reads are limited to their own proof data.
- Payment reviewers can read relevant payments and proofs.
- No anonymous access is granted.

## Key database guardrails

The migration adds:

- `unique (normalized_txid)` across all payments
- `unique (registration_id)` for a single payment per registration
- validation that `tournament_id` and `registration_id` belong together
- server-side determination of the expected amount from `public.tournaments.entry_fee`
- immutable audit events for status changes
- reviewer-only approval and rejection logic
- refund references that remain independent of the original payment

## Statuses

Payment status values:

- `pending`
- `approved`
- `rejected`
- `refund_pending`
- `partially_refunded`
- `refunded`

Refund status values:

- `pending`
- `approved`
- `rejected`
- `processing`
- `completed`
- `failed`

## Notes for production review

This is a forward-only migration and should be reviewed before any remote Supabase deployment. The SQL is intended for review and migration planning, not for direct `db push` usage from this environment.
