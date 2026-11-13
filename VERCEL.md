# Vercel Environment Variables

Configure the following variables in **Vercel Project → Settings → Environment Variables**:

| Name | Required | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | The Supabase project URL, for example `https://your-project-ref.supabase.co`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | The Supabase project's publishable key. Use the `sb_publishable_...` key when available. |
| `ADMIN_ACCESS_KEY` | Yes for admin sign-in | A cryptographically random 32-byte key encoded as 64 hexadecimal characters. Server-side only; never prefix with `VITE_` or `NEXT_PUBLIC_`. |
| `ADMIN_SESSION_SECRET` | Yes for admin sign-in | A separate random 32-byte HMAC secret, encoded as 64 hexadecimal characters. Server-side only. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for admin sign-in | Supabase server-only service-role/secret key used only by the Vercel Function. Never expose it to browser/client code. |

The app also accepts `VITE_SUPABASE_ANON_KEY` as a legacy fallback if `VITE_SUPABASE_PUBLISHABLE_KEY` is not set, and accepts equivalent `NEXT_PUBLIC_` aliases. Prefer the publishable key for new configuration; do not set both unless migrating an existing project.

## Set the Values

1. Open the correct project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Find the project URL and publishable key under **Project Settings → API** (the exact dashboard label may vary).
3. In Vercel, configure the public Supabase URL and publishable key for the environments you use. Preview deployments should point to a deliberate Supabase project, such as a separate staging project, if you need to isolate test data.
4. For admin access, set `ADMIN_ACCESS_KEY`, `ADMIN_SESSION_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` as server-only variables. Set them only for Production and trusted Preview deployments. Generate each random value separately with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and keep the service-role key unprefixed.
5. Save the variables and redeploy. Vite embeds `VITE_` variables at build time, so changing a public value requires a new deployment.

Use the Supabase project URL with `https://` for hosted projects. The application rejects insecure hosted URLs and server-only Supabase secret keys.

## Security Notes

- Never add a Supabase `service_role` or `sb_secret_...` key to Vercel variables prefixed with `VITE_`, or to any browser-exposed variable. This app runs in the browser; its Supabase access must rely on Row Level Security.
- Keep `ADMIN_ACCESS_KEY`, `ADMIN_SESSION_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` as server-only Vercel environment variables. The `/api/admin-login` function compares the key server-side, discovers the single existing Supabase Auth user with a trusted admin role, and only then returns a normal Supabase session. None of these secrets is returned to the browser.
- Rotate any access key that has been pasted into chat or source control. Add a Vercel Firewall rate limit to `/api/admin-login`; the database-backed lockout tracks two failed attempts per source address for 15 minutes.
- The database-backed lockout added by `20261113130000_admin_access_key_lockouts.sql` locks a client address for 15 minutes after two incorrect keys. The address itself is not stored; only an HMAC made with `ADMIN_SESSION_SECRET` is persisted.
- The publishable/anon key is intended for browser use, but it does not replace correct Supabase Row Level Security policies.
- Do not commit real project credentials to `.env.example`, source files, or this document.

## Authentication URLs

Environment variables alone do not enable email verification or member email OTP. In the Supabase Dashboard, configure **Authentication → URL Configuration** so the Site URL and allowed redirect URLs include the deployed Vercel domain. For a production deployment, allow the production origin and callback URL:

```text
https://your-production-domain.example
https://your-production-domain.example/auth/callback
```

If users authenticate from Vercel Preview deployments, add the appropriate preview origins to Supabase's allowed redirect URLs as well. Avoid broad wildcard redirects when a narrower set of trusted domains is practical. Also confirm email confirmation and email OTP are enabled and that the configured email provider/templates support those flows.

## Admin Access Provisioning

The access-key-only admin form calls the server-side `/api/admin-login` function. Configure `ADMIN_ACCESS_KEY`, `ADMIN_SESSION_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` only in Vercel's server environment. The function discovers the administrator from Supabase Auth and requires exactly one existing user with a trusted `app_metadata` admin role; it fails closed if there are zero or multiple candidates. It creates a Supabase session without sending email, so existing RLS rules continue to apply. Provision the role only through a trusted Supabase administrative process; never set it from browser code.

Because no email is entered in the form, this configuration represents one shared administrator identity. All operators using the shared key will appear as the same Supabase user in audit records. Use individual admin identities if per-person accountability is required. Supabase signs the session; `ADMIN_SESSION_SECRET` is used only for the HMAC-based lockout identifier. `PII_ENCRYPTION_KEY` is unrelated to this login flow and is not required unless a server feature is added that encrypts PII.

## Production Deployment Checklist

1. Configure Vercel with the repository root as the project root, `npm install` as the install command, `npm run build` as the build command, and `dist` as the output directory.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production. Configure Preview against a separate staging Supabase project when possible; do not point untrusted previews at production data.
3. In Supabase Authentication URL Configuration, set the production Site URL and allow only the production origin and the exact callback paths used by the app, including `/auth/callback` and `/admin/login`.
4. Enable member email OTP and configure its email provider/template. For admin access, set the server-only Vercel variables and ensure exactly one Auth user has the trusted admin role.
5. Apply and verify database migrations in staging, including `20261113130000_admin_access_key_lockouts.sql`. Confirm RLS, function grants, storage policies, and admin claims through authorized checks; a successful frontend deployment does not verify database security.
6. Deploy to Vercel, verify OTP signup/login and admin login, then test representative unauthorized requests against the database API.

Forward-only migrations for profile completion, standalone competitions, manual bKash payments, match operations, and game-specific results are now prepared in the repository. They have not been SQL-tested, executed, or applied, and the frontend is not yet integrated with all of their RPCs. Vercel configuration alone does not make those features production-ready.

## Troubleshooting

- **Supabase is not configured:** check that both required variables are present for the deployment's target environment, then redeploy.
- **Invalid URL or insecure URL:** copy the project URL from Supabase and ensure it uses `https://`.
- **Admin access-key sign-in fails:** confirm exactly one user in the same Supabase project has a trusted `app_metadata` role, the service-role key belongs to that project, all server-only variables are set, and the lockout migration has been applied. Configure a Vercel Firewall rate limit for `/api/admin-login`.
- **Email callback does not return to the site:** add the exact deployed origin and `/auth/callback` URL to Supabase's allowed redirect URLs.
- **Authorization errors:** verify RLS policies and the server-side admin authorization claims. Do not solve these errors by exposing a secret key in the frontend.