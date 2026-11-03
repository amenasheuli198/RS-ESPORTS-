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

## Troubleshooting

- **Supabase is not configured:** check that both required variables are present for the deployment's target environment, then redeploy.
- **Invalid URL or insecure URL:** copy the project URL from Supabase and ensure it uses `https://`.
- **Email callback does not return to the site:** add the exact deployed origin and `/auth/callback` URL to Supabase's allowed redirect URLs.
- **Authorization errors:** verify RLS policies and the server-side admin authorization claims. Do not solve these errors by exposing a secret key in the frontend.