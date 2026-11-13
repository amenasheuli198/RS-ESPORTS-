# bKash Manual Verification Workflow

## Purpose

This document defines the manual bKash verification process for UNDERGRADUATE HUB E-Sports. It is designed for the initial release and is intentionally server-authoritative rather than client-trusted.

## Official organization send-money number

The bKash send-money number used by the platform is:

`01845278579`

This is the send money number, not a merchant or agent number.

## Public payment instructions

The public payment instructions should display:

- Platform name: `UNDERGRADUATE HUB E-Sports`
- Payment method: `bKash`
- Send money number: `01845278579`
- Instructions to send the exact amount for the tournament registration
- Request to upload a payment proof screenshot or PDF
- The player must submit the TXID for review

## Player flow

1. Player registers for a paid tournament or paid match.
2. The server reads the authoritative tournament fee from `public.tournaments.entry_fee`.
3. The player sends the exact amount to the designated bKash send-money number.
4. The player submits the sender number, TXID, and screenshot.
5. The system creates a payment record with status `pending`.
6. The system writes an immutable event record for the payment submission.
7. The reviewer validates the payment in the admin queue.
8. The reviewer approves or rejects the payment with a reason.
9. Approved payments update the related registration status separately from the payment itself.

## Reviewer flow

1. Reviewer sees queued payments.
2. Reviewer checks the sender number, TXID, proof, and expected fee.
3. Reviewer approves the payment only when the amount and TXID match the expected data and the payment is valid for the registration.
4. Reviewer records the decision reason in the payment event log and the payment record.
5. If rejected, the payment remains associated with the registration but the request is denied.

## Security requirements

The manual bKash process must ensure:

- expected amount is server-side only
- TXID is normalized and unique
- pending approvals are not visible to players as admin controls
- only reviewers can approve or reject
- duplicate TXID submissions are rejected at database level
- payment proof access is limited to the payer and authorized reviewers
- refunds are tracked in a separate table and not merged into the original payment row

## Refund flow

Refunds are not treated as an original payment update. Instead:

- a refund record is created with an initial status such as `pending`
- a reviewer approves the refund
- the refund is completed and the related payment moves to `refunded` or `partially_refunded` as appropriate

This keeps original payment evidence and audit trail intact.
