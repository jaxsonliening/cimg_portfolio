# Deploying to Vercel

End-to-end walk-through for putting the dashboard on the internet with a real URL. Assumes you've already done `docs/setup-supabase.md` (schema + env + one admin).

## 0. Pre-flight

Confirm these pass locally before touching Vercel:

```bash
npm run build        # must finish without errors
npm run typecheck    # must pass
```

If either fails locally, the Vercel build will fail in the same place and waste a deployment slot.

## 1. Merge to `main`

Vercel's default production branch is `main`. The work in progress is on `claude/push-schema-updates-GfDSG`. Open a PR on GitHub and merge it (or, if you're the sole committer and confident, fast-forward locally and push):

```bash
git checkout main
git merge --ff-only claude/push-schema-updates-GfDSG
git push origin main
```

The branch doesn't *have* to be `main` — Vercel can promote any branch to production — but `main` is the convention and reduces cognitive load later.

## 2. Create the Vercel project

1. Go to [vercel.com](https://vercel.com) and sign up / log in with GitHub.
2. **Add New → Project**.
3. Pick the `culverhouse-investment-mangement/cimg_portfolio` repo.
4. On the configure page:
   - **Framework Preset**: Next.js (auto-detected).
   - **Root Directory**: leave as the repo root.
   - **Build Command**: leave default (`next build`).
   - **Output Directory**: leave default.
5. Expand **Environment Variables** and add every row from the table below before clicking Deploy — if you miss any, the first deploy will build but fail at runtime with exactly the errors you've seen locally when env was blank.

## 3. Environment variables

Copy into Vercel's **Project Settings → Environment Variables**. Set **Production, Preview, and Development** for each unless noted.

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | No trailing slash, no `/rest/v1`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon JWT from Supabase | Safe to expose — RLS protects writes. |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role JWT | **Server-only.** Never set `NEXT_PUBLIC_` on this. |
| `APP_URL` | `https://<your-vercel-domain>` | Used by `/api/admin/users/invite` and `/api/auth/email-link` for `redirect_to`. No trailing slash. |
| `CRON_SECRET` | output of `openssl rand -hex 32` | Must match the same secret stored in GitHub Actions secrets. |
| `FMP_API_KEY` | from financialmodelingprep.com | Optional if you haven't wired market data yet. |
| `ALPHA_VANTAGE_API_KEY` | from alphavantage.co | Fallback. Leave blank if you don't have one. |
| `RESEND_API_KEY` | from resend.com | Required if you want self-serve `/admin/login` to work. Without it, the form returns 503 and users must be invited by an admin from `/admin/team` or bootstrapped via `npm run admin-link`. |
| `RESEND_FROM` | e.g. `CIMG Portfolio <noreply@yourdomain.com>` | Must be a verified sender in Resend. Required alongside `RESEND_API_KEY`. |

`APP_URL` is the circular-dependency variable: you don't know it until Vercel assigns it, but the app needs it. Two options:

- **Easier path**: deploy once with `APP_URL` left blank. The code falls back to the request origin, which works for everything except the admin-link CLI. After the first deploy, set `APP_URL` to the assigned URL and redeploy.
- **Cleaner path**: you pick the custom domain first (step 7), set `APP_URL` to that, then deploy.

## 4. First deploy

Click **Deploy**. Watch the logs — a clean build ends with something like:

```
Route (app)                              Size     First Load JS
┌ ○ /                                    ...      ...
├ ○ /admin/login
├ ƒ /api/portfolio/summary
...
```

If it fails, the error in the log is the same one you'd see from `npm run build` locally.

Once it's live, open the URL. You should see:
- The public dashboard rendering (seed data if you haven't run the cron yet).
- The `Admin Sign In` button.
- No console errors in the browser.

## 5. Update Supabase redirect URLs

Auth flows won't work until Supabase knows to trust the new domain.

Go to **Supabase → Authentication → URL Configuration**:

- **Site URL**: your Vercel URL (`https://<your-vercel-domain>`). If you're keeping local dev too, set this to the production URL — the Site URL is the *default* and admin links override it per-request.
- **Redirect URLs**: add `https://<your-vercel-domain>/auth/callback` and `https://<your-vercel-domain>/auth/confirm` (both paths — callback handles PKCE from `/admin/login`, confirm handles admin-generated links). Keep your `http://localhost:3000/*` entries too so local dev still works.

Save.

## 6. Point GitHub Actions at the deployed app

The two cron workflows (`.github/workflows/snapshot-*.yml`) POST to your deployed app every 15 minutes / once daily. They need two repo secrets.

**GitHub → Settings → Secrets and variables → Actions → New repository secret**:

- `APP_URL` = your Vercel URL (no trailing slash, same value as in Vercel).
- `CRON_SECRET` = the same hex string you set in Vercel.

Trigger the workflow manually to confirm: **GitHub → Actions → snapshot-ticks → Run workflow → Run workflow**. It should finish green within a minute. Check Vercel's **Deployments → Logs** to see the `POST /api/cron/tick` requests arriving.

## 7. Custom domain (optional)

Vercel gives you `<project>.vercel.app` for free. If you want `portfolio.cimg.example.edu` or similar:

1. In Vercel → **Settings → Domains**, add the domain.
2. Vercel shows a CNAME (or A + AAAA) record. Add it at your DNS host — if CIMG's domain is managed by UA IT, this is a ticket: "Please add a CNAME record `portfolio → cname.vercel-dns.com`."
3. Once verification lights green:
   - Update `APP_URL` in Vercel env to the custom domain and redeploy.
   - Update Supabase **Site URL** + **Redirect URLs** with the custom domain.
   - Update `APP_URL` in GitHub Actions secrets.
   - Update `RESEND_FROM` if it was using a Vercel-specific domain.

## 8. Smoke test

Once everything's wired:

1. Visit the URL in incognito. Dashboard loads. Seed numbers match the Excel snapshot.
2. Click **Admin Sign In** → enter your email → if Resend is configured, you'll get a sign-in email; otherwise the form returns 503 and you should use `npm run admin-link` (local) or have an existing admin invite you from `/admin/team`.
3. On `/admin/team`, confirm your role is `admin` and try inviting a test email.
4. If market data is wired: trigger a manual tick via GitHub Actions and watch the Day Change column update within a minute.

## Troubleshooting

- **Build fails with `Cannot find module '@supabase/ssr'`** — dependencies didn't install. Check Vercel build log for npm errors. Usually fixed by clicking **Redeploy** with "Clear cache" checked.
- **`500` on every page, logs say "missing NEXT_PUBLIC_SUPABASE_URL"** — you forgot to tick "Production" on the env vars. Go back, tick all three environments, redeploy.
- **Admin sign-in link lands on home page signed out** — Supabase redirect URLs don't include `/auth/confirm`. Add it and try again; the old link is now expired, generate a new one from `/admin/login`.
- **GitHub Actions cron runs fail 401** — `CRON_SECRET` in GitHub secrets doesn't match Vercel env. Both have to be the exact same string. Regenerate, update both, retry.
- **`PGRST125: Invalid path`** in production but not local — trailing slash or `/rest/v1` on the Vercel value of `NEXT_PUBLIC_SUPABASE_URL`. Trim it.
- **Preview deployments work, production doesn't** — a var was set to "Preview" only. Env vars are per-environment; promote the set to Production.

## When you need to roll back

Every Vercel deployment is immutable and stays accessible via its URL. To revert:

**Deployments → find the last known-good build → ⋯ menu → Promote to Production.**

Redeployment takes ~10 seconds because it's just a pointer flip, no new build.
