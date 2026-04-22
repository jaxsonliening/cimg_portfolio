# Setting up Supabase

One-time steps to get a live Supabase project and wire it into the app.

## 1. Create a project

1. Sign up / log in at [supabase.com](https://supabase.com).
2. **New project** → pick a name (e.g. `cimg-portfolio`), region close to your users, and a strong database password (save it in a password manager; you won't need it for the app itself).
3. Wait ~2 minutes for the project to provision.

## 2. Run the schema

1. Open **SQL Editor** in the left nav.
2. Paste the full contents of [`supabase/schema.sql`](../supabase/schema.sql) and run it.
3. Verify in **Table Editor**: you should see `committees` (7 rows), `positions`, `price_ticks`, `price_snapshots`, `fund_snapshots`, `benchmark_snapshots`, and `profiles` (all empty except `committees`).

The SQL is idempotent — safe to re-run whenever `schema.sql` changes.

## 3. Grab the keys

In **Project Settings → API**:

| Key | Where it goes | Notes |
| --- | --- | --- |
| `Project URL` | `NEXT_PUBLIC_SUPABASE_URL` | Safe to expose. |
| `anon public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Safe to expose. RLS gates reads/writes. |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` (server-only) | **Secret.** Bypasses RLS. Only used by `/api/cron/*` handlers. |

Copy these into `.env.local` (see `.env.example`). Never commit real values.

## 4. Configure auth

**Auth → URL Configuration:**
- Site URL: `http://localhost:3000` for local dev, your Vercel URL in prod.
- Redirect URLs: add `http://localhost:3000/auth/callback` and `https://<your-vercel-domain>/auth/callback`.

**Auth → Providers:** leave **Email** enabled (magic link is on by default). Disable any provider you don't plan to use.

**Auth → Email Templates (optional):** tweak the "Magic Link" email subject/body to say `CIMG` so the PM recognizes it.

## 5. Create the first admin

Magic-link sign-ins create `auth.users` rows automatically, and the `on_auth_user_created` trigger from the schema inserts a matching `profiles` row with `role='viewer'`. To promote someone to admin:

1. Have the PM sign in once at `/admin/login` with their email. This creates their auth user + viewer profile.
2. In the Supabase **SQL Editor**, run:

   ```sql
   update public.profiles
   set role = 'admin'
   where user_id = (select id from auth.users where email = 'pm@example.com');
   ```

3. They can now add/remove positions. You only do this once per admin.

## 6. Production deploy

When deploying to Vercel, set the same three Supabase env vars in **Project Settings → Environment Variables**. Also add:

- `FMP_API_KEY` — from [Financial Modeling Prep](https://financialmodelingprep.com).
- `ALPHA_VANTAGE_API_KEY` — fallback, from [Alpha Vantage](https://www.alphavantage.co).
- `CRON_SECRET` — generate with `openssl rand -hex 32`. Same value goes into the GitHub Actions repo secret.

## Troubleshooting

- **Magic link goes to the wrong domain** — check the Site URL in Auth settings.
- **New user didn't get a `profiles` row** — confirm the `on_auth_user_created` trigger exists (Database → Triggers).
- **RLS blocking a query in dev** — you're probably hitting it with the anon key when you need the service role; double-check you're in a server route handler and that it's an admin-only path.
