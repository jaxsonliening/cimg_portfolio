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

For the normal `/admin/login` magic-link flow to deliver emails instead of showing the link inline, configure Resend (§7).

## 6. Production deploy

When deploying to Vercel, set the same three Supabase env vars in **Project Settings → Environment Variables**. Also add:

- `FMP_API_KEY` — from [Financial Modeling Prep](https://financialmodelingprep.com).
- `ALPHA_VANTAGE_API_KEY` — fallback, from [Alpha Vantage](https://www.alphavantage.co).
- `CRON_SECRET` — generate with `openssl rand -hex 32`. Same value goes into the GitHub Actions repo secret.

## 7. Configure email delivery (Resend — required for self-serve login)

Supabase's built-in SMTP is unreliable: rate-limited, often blocked by `.edu` domains, no delivery signal. We bypass it entirely — `/admin/login` calls `/api/auth/email-link`, which generates the magic link server-side with the service-role key and delivers it through **Resend**.

> **Until Resend is configured, the `/admin/login` self-serve flow is disabled** (returns 503 "Email delivery is not configured"). This is intentional: handing back the sign-in URL in the HTTP response would let anyone type an admin's email and receive a working session cookie. Use `/admin/team` invites (gated to admins) or `npm run admin-link` (local CLI) to get people in until email delivery is set up.

Free tier covers 3,000 emails/month and 100/day — more than CIMG needs.

1. **Sign up** at [resend.com](https://resend.com) — free, no credit card.
2. **Pick a sender:**
   - *Quickest:* skip domain verification and use `onboarding@resend.dev` as the sender. This works immediately but only delivers to the email address you signed up with — good for local testing, not for inviting real users.
   - *For real use:* go to **Domains → Add Domain**, enter the domain you'll send from (e.g. `cimg.example.edu`), and add the DNS records Resend shows you (SPF + DKIM). Verification usually takes a few minutes. Once green, any address on that domain works as a sender.
3. **Create an API key** at **API Keys → Create API Key**. Full access is fine for this use case. Copy it once — Resend won't show it again.
4. **Add the env vars** to `.env.local`:

   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   RESEND_FROM="CIMG Portfolio <noreply@yourdomain.com>"
   # or, for quick testing before domain verification:
   # RESEND_FROM="CIMG Portfolio <onboarding@resend.dev>"
   ```

   Mirror the same two variables into Vercel → **Project Settings → Environment Variables** for production.
5. **Restart the dev server** (`Ctrl+C`, `npm run dev`) so Next.js picks up the new env. Rebuild before redeploying to Vercel.
6. **Test** at `/admin/login`: enter your email, submit. You should see "Check your email" and receive the sign-in link within a few seconds. If the form returns a 503 "Email delivery is not configured", the env vars aren't being read — double-check the file and the restart.

While you're waiting to verify a domain, `npm run admin-link -- you@example.com --admin` still works as the fastest bootstrap path and doesn't depend on Resend at all.

## Troubleshooting

- **`PGRST125: Invalid path specified in request URL`** — `NEXT_PUBLIC_SUPABASE_URL` has `/rest/v1` or a trailing slash. Trim it to just `https://<ref>.supabase.co`.
- **`/admin/login` says "Check your email" but nothing arrives** — Resend accepted the send but delivery is failing (bounced, filtered, or the sender domain isn't verified). Check Resend → **Logs** for the specific error. As a temporary unblock, `npm run admin-link -- email@example.com --admin` prints a paste-able sign-in URL.
- **`/admin/login` returns 503 "Email delivery is not configured"** — `RESEND_API_KEY` or `RESEND_FROM` isn't set in the server env. Copy both into `.env.local` (and Vercel), then restart. Do *not* try to re-enable the old inline-link fallback; it was removed because it let anonymous callers generate session cookies for arbitrary emails.
- **Magic link opens but lands on the home page logged out** — `redirect_to` is pointing at `/` instead of `/auth/callback`. The Site URL alone isn't enough; add `/auth/callback` explicitly under Redirect URLs.
- **New user didn't get a `profiles` row** — confirm the `on_auth_user_created` trigger exists (Database → Triggers).
- **RLS blocking a query in dev** — you're probably hitting it with the anon key when you need the service role; double-check you're in a server route handler and that it's an admin-only path.
