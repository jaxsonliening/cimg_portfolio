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

This is a one-time bootstrap. From the project root, after `.env.local` is filled in:

```bash
npm run admin-link -- pm@example.com --admin
```

The script creates the auth user, promotes the profile to admin, and prints a sign-in URL. Paste the URL into a browser — it verifies server-side at `/auth/confirm`, sets a session cookie, and lands on `/admin`. Valid ~1 hour. No SMTP required.

Drop `--admin` if you only want to generate a link for a viewer.

## 5a. After the first admin — add everyone else from the UI

Once you (or the PM) can reach `/admin`, go to **Admin → Team** (`/admin/team`). From there, any current admin can:

- **Invite new members** — fill in email + role, click *Generate sign-in link*, copy the URL, send it over Slack/email/text. Same mechanism as `npm run admin-link`, no shell access needed.
- **Change roles** — dropdown next to each member. Demoting the last remaining admin is blocked server-side so nobody locks the group out.
- **Rotate ownership** — when the PM graduates, they promote their successor, the successor promotes the next class, the outgoing PM gets demoted. No SQL Editor, no service-role key handoff.

For the normal `/admin/login` magic-link flow to deliver emails, configure SendGrid (§7).

## 6. Production deploy

When deploying to Vercel, set the same three Supabase env vars in **Project Settings → Environment Variables**. Also add:

- `FMP_API_KEY` — from [Financial Modeling Prep](https://financialmodelingprep.com).
- `ALPHA_VANTAGE_API_KEY` — fallback, from [Alpha Vantage](https://www.alphavantage.co).
- `CRON_SECRET` — generate with `openssl rand -hex 32`. Same value goes into the GitHub Actions repo secret.

## 7. Configure email delivery (SendGrid — required for self-serve login)

Supabase's built-in SMTP is unreliable for `.edu` domains and gives no delivery signal. We bypass it: `/admin/login` calls `/api/auth/email-link`, which generates the magic link server-side with the service-role key and delivers it through **SendGrid**.

> **Until SendGrid is configured, the `/admin/login` self-serve flow returns 503.** This is intentional: returning the sign-in URL in the HTTP response would let anyone type an admin's email and receive a valid session cookie. Use `/admin/team` invites (admin-gated) or `npm run admin-link` (local CLI) to get people in until email is set up.

Free tier: 100 emails/day forever, no credit card. SendGrid's **Single Sender Verification** lets you authenticate any email address as the sender with a click-a-link flow. No custom domain required.

1. **Sign up** at [sendgrid.com](https://signup.sendgrid.com). Free tier is fine.
2. **Verify a sender email** at **Settings → Sender Authentication → Single Sender Verification → Create New Sender**. You can use:
   - A free Gmail you create specifically for the club (`cimgua.team@gmail.com` style), or
   - Any email address you own.
   SendGrid sends a verify link to that address; click it. Done.
3. **Create an API key** at **Settings → API Keys → Create API Key**. Choose "Full Access" or at least "Mail Send" permission. Copy it once; SendGrid won't show it again.
4. **Add the env vars** to `.env.local` (and Vercel → **Project Settings → Environment Variables**):

   ```bash
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx
   SENDGRID_FROM="CIMG Portfolio <the.verified.address@example.com>"
   ```

   The address inside the angle brackets must be the verified sender from step 2.
5. **Redeploy** so the serverless functions pick up the new env. On Vercel: **Deployments → top → ⋯ → Redeploy**. Locally: restart `npm run dev`.
6. **Test** at `/admin/login`. Submit your email; you should see "Check your email" and receive the sign-in link in a few seconds. If the form returns 503, the env vars aren't visible to the runtime — check the Environments column in Vercel and redeploy.

While you're waiting, `npm run admin-link -- you@example.com --admin` still works as a bootstrap path that doesn't depend on email at all.

## Troubleshooting

- **`PGRST125: Invalid path specified in request URL`** — `NEXT_PUBLIC_SUPABASE_URL` has `/rest/v1` or a trailing slash. Trim it to just `https://<ref>.supabase.co`.
- **`/admin/login` says "Check your email" but nothing arrives** — check SendGrid → **Activity Feed** for the specific failure. Common causes: the sender isn't verified yet, or the free-tier 100/day limit is hit. As a temporary unblock, `npm run admin-link -- email@example.com --admin` prints a paste-able sign-in URL.
- **`/admin/login` returns 503 "Email delivery is not configured"** — `SENDGRID_API_KEY` or `SENDGRID_FROM` isn't set in the server env. Set both in Vercel (Production scope) and redeploy so the serverless functions see the new values.
- **`Couldn't send the sign-in email. Try again in a minute`** — SendGrid rejected the send. Check the Vercel function logs for the raw error, and SendGrid → Activity Feed. Usually the sender in `SENDGRID_FROM` doesn't match a verified single sender.
- **Magic link opens but lands on the home page logged out** — `redirect_to` is pointing at `/` instead of `/auth/callback`. The Site URL alone isn't enough; add `/auth/callback` explicitly under Redirect URLs.
- **New user didn't get a `profiles` row** — confirm the `on_auth_user_created` trigger exists (Database → Triggers).
- **RLS blocking a query in dev** — you're probably hitting it with the anon key when you need the service role; double-check you're in a server route handler and that it's an admin-only path.
