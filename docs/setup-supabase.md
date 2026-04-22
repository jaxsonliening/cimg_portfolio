# Setting up Supabase

One-time steps to get a live Supabase project and wire it into the app.

## 1. Create a project

1. Sign up / log in at [supabase.com](https://supabase.com).
2. **New project** → pick a name (e.g. `cimg-portfolio`), region close to your users, and a strong database password (save it in a password manager; you won't need it for the app itself).
3. Wait ~2 minutes for the project to provision.

## 2. Run the schema

1. Open **SQL Editor** in the left nav.
2. Paste the full contents of [`supabase/schema.sql`](../supabase/schema.sql) and run it.
3. Verify in **Table Editor**: you should see `committees` (8 rows), `positions`, `trades`, `cash_transactions`, `ticker_meta`, `price_ticks`, `price_snapshots`, `fund_snapshots`, `benchmark_snapshots`, and `profiles` (all empty except `committees`).

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

Magic-link sign-ins create `auth.users` rows automatically, and the `on_auth_user_created` trigger seeds a matching `profiles` row with `role='viewer'`. Promoting to admin is a second step.

There are two paths — use the first one for bootstrapping (and whenever Supabase's default SMTP is acting up), use the second once email delivery is set up.

### Option A — one-command bootstrap (recommended)

From the project root, after `.env.local` is filled in:

```bash
npm run admin-link -- pm@example.com --admin
```

This creates the user if needed, promotes them to admin, and prints a sign-in URL. Paste the URL into a browser — it completes the auth flow at `/auth/callback` and lands on `/admin`. Valid for ~1 hour.

Drop `--admin` if you only want to generate a link for a viewer.

The script uses `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`, so it bypasses SMTP entirely. Send the URL to the person over whatever channel you'd use normally.

### Option B — normal magic-link flow

Once email delivery is working (see §7), anyone can sign in on their own:

1. Visit `/admin/login` and enter email → click the link in the inbox.
2. They arrive signed in, but as a viewer. Promote them once in SQL Editor:

   ```sql
   update public.profiles
   set role = 'admin'
   where user_id = (select id from auth.users where email = 'pm@example.com');
   ```

## 6. Production deploy

When deploying to Vercel, set the same three Supabase env vars in **Project Settings → Environment Variables**. Also add:

- `FMP_API_KEY` — from [Financial Modeling Prep](https://financialmodelingprep.com).
- `ALPHA_VANTAGE_API_KEY` — fallback, from [Alpha Vantage](https://www.alphavantage.co).
- `CRON_SECRET` — generate with `openssl rand -hex 32`. Same value goes into the GitHub Actions repo secret.

## 7. Configure real email delivery (when SMTP gets flaky)

Supabase's built-in SMTP is for testing only. It rate-limits at 4 emails/hour on a shared sender that's often blocked by `.edu` domains, and there's no delivery feedback — mails just silently don't arrive. If `/admin/login` doesn't send emails reliably, point Supabase at a real SMTP provider.

**Resend** is the simplest option — free tier covers 3,000 emails/month, which is more than CIMG needs.

1. Create an account at [resend.com](https://resend.com) and verify a sending domain (or use the default `onboarding@resend.dev` for testing).
2. Generate an API key at Resend → API Keys.
3. In Supabase → **Authentication → Emails → SMTP Settings**:
   - Enable custom SMTP.
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your Resend API key
   - Sender email: the verified address from step 1.
4. Save. Test from `/admin/login` — mail should arrive within a few seconds.

While you're waiting to set this up, **Option A in §5** (`npm run admin-link`) keeps everyone unblocked.

## Troubleshooting

- **`PGRST125: Invalid path specified in request URL`** — `NEXT_PUBLIC_SUPABASE_URL` has `/rest/v1` or a trailing slash. Trim it to just `https://<ref>.supabase.co`.
- **`/admin/login` says "Check your email" but nothing arrives** — Supabase default SMTP silently rate-limited or blocked. Use `npm run admin-link -- email@example.com --admin` to get in, then configure Resend (§7) to fix the normal flow.
- **Magic link opens but lands on the home page logged out** — `redirect_to` is pointing at `/` instead of `/auth/callback`. The Site URL alone isn't enough; add `/auth/callback` explicitly under Redirect URLs.
- **New user didn't get a `profiles` row** — confirm the `on_auth_user_created` trigger exists (Database → Triggers).
- **RLS blocking a query in dev** — you're probably hitting it with the anon key when you need the service role; double-check you're in a server route handler and that it's an admin-only path.
