# PAYMENT SECURITY AUDIT

## Audit summary

A full security audit of the existing repository shows that the tournament registration system is present, but the payment system is not yet implemented.

### Confirmed existing state

- Tournament entries have fee fields in `public.tournaments`.
- Tournament registrations exist in `public.tournament_registrations`.
- Platform settings exist in `public.platform_settings`.
- Support and dispute tables exist, but there are no payment records or proof objects.
- Frontend source contains no payment submission flow, no admin queue, and no bKash verification screens.

### Missing or incomplete functionality

The following are missing from the current repo state:

1. `public.payments` table
2. TXID normalization and uniqueness enforcement
3. Payment proof bucket and storage policies
4. Payment reviewer permission helper and role checks
5. Payment event audit log
6. Refund ledger with status tracking
7. Secure payment submission RPC
8. Secure approval/rejection RPC
9. Owner-only payment history access
10. Admin queue for pending payments
11. Payment instruction settings with the default send-money number `01845278579`
12. Platform name default of `UNDERGRADUATE HUB E-Sports`
13. Database-level guarantee that a registration cannot be mismatched to the wrong tournament or payment

## Why the current state is not production-safe

The current schema accepts entry fees from tournament configuration, but it does not enforce payment submission, review, refund, or proof handling. That means there is no database boundary to protect the payment lifecycle from misuse.

The existing codebase also has only a historical `platform_settings` table and no dedicated payment configuration. This is insufficient for a secure bKash verification flow because the payment number, payment method, and instructions are not governed by a protected database pattern.

## Audit conclusion

The payment workflow is not fully implemented in the repository. The repository is ready for a source-level forward migration, but not ready for live database push or approval without a review environment.

## Highest-risk findings

- Payment record absent
- No TXID uniqueness check
- No private proof storage
- No reviewer authorization boundary
- No refund ledger
- No payment admission audit log
- No database enforcement of registration/payment consistency

## Mitigation strategy

A forward-only migration should be reviewed and then applied only in a staging or controlled environment. The change set adds the missing payment tables, event log, secure functions, storage bucket, and role-aware access controls while leaving historical migration history untouched.
