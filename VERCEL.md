# Vercel Environment Variables

Configure the following variables in **Vercel Project → Settings → Environment Variables**:

| Name | Required | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | The Supabase project URL, for example `https://your-project-ref.supabase.co`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | The Supabase project's publishable key. Use the `sb_publishable_...` key when available. |

The app also accepts `VITE_SUPABASE_ANON_KEY` as a legacy fallback if `VITE_SUPABASE_PUBLISHABLE_KEY` is not set. Prefer the publishable key for new configuration; do not set both unless migrating an existing project.

## Set the Values

1. Open the correct project in the [Supabase Dashboard](https://supabase.com/dashboard).
2. Find the project URL and publishable key under **Project Settings → API** (the exact dashboard label may vary).
3. In Vercel, add both required variables. Set the environment targets you use: **Production**, **Preview**, and **Development**. Preview deployments should point to a deliberate Supabase project, such as a separate staging project, if you need to isolate test data.
4. Save the variables and redeploy. Vite embeds `VITE_` variables at build time, so changing a value requires a new deployment.

Use the Supabase project URL with `https://` for hosted projects. The application rejects insecure hosted URLs and server-only Supabase secret keys.

## Security Notes

- Never add a Supabase `service_role` or `sb_secret_...` key to Vercel variables prefixed with `VITE_`, or to any browser-exposed variable. This app runs in the browser; its Supabase access must rely on Row Level Security.
- The publishable/anon key is intended for browser use, but it does not replace correct Supabase Row Level Security policies.
- Do not commit real project credentials to `.env.example`, source files, or this document.

## Authentication URLs

Environment variables alone do not enable email verification or admin email OTP. In the Supabase Dashboard, configure **Authentication → URL Configuration** so the Site URL and allowed redirect URLs include the deployed Vercel domain. For a production deployment, allow the production origin and the callback URL:

```text
https://your-production-domain.example
https://your-production-domain.example/auth/callback
```

If users authenticate from Vercel Preview deployments, add the appropriate preview origins to Supabase's allowed redirect URLs as well. Avoid broad wildcard redirects when a narrower set of trusted domains is practical. Also confirm email confirmation and email OTP are enabled and that the configured email provider/templates support those flows.

## Admin Access Provisioning

The admin login page does not contain an administrator email allowlist. Admin authorization is determined by the trusted Supabase JWT `app_metadata.role` claim, which is also checked by database RLS and privileged RPCs. Provision the `admin` role only for the two administrator accounts approved by the organization, using a trusted Supabase administrative process such as the Auth Admin API from a private server environment. Verify each account's email identity before assigning the claim. Never set `app_metadata` from browser code or expose a service-role/secret key in Vercel `VITE_` variables.

Do not add administrator email addresses or an admin allowlist variable to Vercel. The browser only needs the Supabase project URL and publishable key. OTP delivery to an unauthorized account does not grant admin access; the account is rejected after verification unless its trusted JWT includes the admin role.

## Production Deployment Checklist

1. Configure Vercel with the repository root as the project root, `npm install` as the install command, `npm run build` as the build command, and `dist` as the output directory.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production. Configure Preview against a separate staging Supabase project when possible; do not point untrusted previews at production data.
3. In Supabase Authentication URL Configuration, set the production Site URL and allow only the production origin and the exact callback paths used by the app, including `/auth/callback` and `/admin/login`.
4. Enable email OTP, configure the email provider and OTP email template, and set appropriate rate limits and abuse protection.
5. Apply and verify database migrations in staging before production. Confirm RLS, function grants, storage policies, and admin claims through authorized checks; a successful frontend deployment does not verify database security.
6. Deploy to Vercel, verify OTP signup/login and admin login, then test representative unauthorized requests against the database API.

The application still requires backend work for completed profile persistence, standalone Quick Matches, payment verification, and associated admin review. Vercel configuration alone does not make those features production-ready.

## Troubleshooting

- **Supabase is not configured:** check that both required variables are present for the deployment's target environment, then redeploy.
- **Invalid URL or insecure URL:** copy the project URL from Supabase and ensure it uses `https://`.
- **Email callback does not return to the site:** add the exact deployed origin and `/auth/callback` URL to Supabase's allowed redirect URLs.
- **Authorization errors:** verify RLS policies and the server-side admin authorization claims. Do not solve these errors by exposing a secret key in the frontend.