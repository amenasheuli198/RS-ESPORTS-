# Authentication Setup

## Member authentication

The member UI uses Supabase email OTP only:

- Signup calls `auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
- Login and resend call `signInWithOtp` without user creation.
- Code verification calls `auth.verifyOtp({ email, token, type: 'email' })`.
- The Supabase client persists and refreshes the session. Auth state is subscribed in `AuthProvider`.
- The UI does not use password login for member signup/sign-in. Password-related helpers/routes are legacy and are not part of this OTP flow.

The current workspace contains no configured Supabase URL/key and no captured Auth API response. Therefore the exact runtime cause of “Unable to send a verification code” cannot be attributed to application code or the Supabase project from this source checkout alone. The code targets whichever project is supplied through the configured browser URL; it does not hard-code a project. Error handling now identifies common invalid-email, rate-limit, disabled-provider, SMTP, and disabled-signup responses without exposing raw server details.

## Required browser environment

Set these in the build/deployment environment:

- `VITE_SUPABASE_URL`: the intended Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: that same project's publishable/anon key. Never use a secret or service-role key in the browser.

The client validates HTTPS outside localhost and rejects service-role keys. An empty `.env.example` is only a template; it does not configure a project.

## Supabase Dashboard settings

In the intended Supabase project:

1. Enable the Email provider under Authentication providers.
2. Enable email confirmations so a newly registered member does not get a verified session before confirming ownership.
3. For a numeric code email, configure the Email OTP template to render `{{ .Token }}`. A template containing only `{{ .ConfirmationURL }}` sends a link rather than the code expected by the current form.
4. Configure a working SMTP provider for production delivery. Supabase's default/test email service has delivery and recipient limitations; check Auth logs and SMTP/provider logs for the actual send error.
5. Set the Site URL to the deployed site origin and add each legitimate deployment origin under Redirect URLs. Include `<origin>/auth/callback` for email-change and other callback links. The typed OTP submission itself verifies in-page and does not rely on a redirect.
6. Review email send rate limits and provider restrictions; do not disable confirmations to bypass a delivery failure.

Required change for OTP if the project currently uses a link-only template: change the Email OTP template to include `{{ .Token }}` and test a real signup and sign-in against that project.

## Admin authentication

Admin authentication is deliberately separate from member OTP. `/api/admin-login` accepts the server-side admin access key, applies persistent source-address lockout via `record_admin_access_key_attempt`, finds exactly one Supabase Auth user whose trusted `app_metadata` contains an admin role, generates/verifies a magic link server-side, and returns a session to the browser. Public signup cannot assign `app_metadata` roles.

Required server-only environment values:

- `ADMIN_ACCESS_KEY`: 64 hexadecimal characters.
- `ADMIN_SESSION_SECRET`: a separate 64-character hexadecimal secret used to HMAC lockout keys.
- `SUPABASE_URL`: intended project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role secret for the Vercel API function.

Provision exactly one eligible admin account through a trusted Supabase Auth Admin process. Do not put service credentials in `VITE_*` variables, client bundles, logs, or this file. Admin access-key delivery/storage is separate from member email verification.

## Troubleshooting

- Confirm the deployed browser bundle uses the intended project URL and matching public key; both are compiled into the frontend configuration.
- Inspect Supabase Auth logs for the exact provider response and recipient. The frontend intentionally presents categorized, non-sensitive messages.
- Check provider enabled state, email confirmation, SMTP credentials/domain verification, template variables, recipient allowlists in test mode, and rate limits.
- For a rejected redirect, compare the exact site origin and `/auth/callback` against the Auth Redirect URLs allowlist.
- Confirm the server API deployment has all admin-only environment values and the lockout migration applied. Admin login does not send an email OTP.
- Do not claim delivery is fixed until a real email arrives and its code can be verified in the intended environment.
