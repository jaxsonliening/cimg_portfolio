#!/usr/bin/env node
// Generate a sign-in link for an admin, bypassing email entirely.
//
//   npm run admin-link -- you@example.com          # link only
//   npm run admin-link -- you@example.com --admin  # link + promote to admin
//
// Uses the service-role key from .env.local (loaded via --env-file).
// Creates the auth user on first use; the auth trigger seeds profiles.
// Prints the sign-in URL to stdout — paste it in a browser.

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const email = positional[0];
const promote = flags.has("--admin");

if (!email || !email.includes("@")) {
  console.error("usage: npm run admin-link -- <email> [--admin]");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const origin = process.env.APP_URL ?? "http://localhost:3000";

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  process.exit(1);
}

const authHeaders = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    type: "magiclink",
    email,
    redirect_to: `${origin}/auth/callback?next=/admin`,
  }),
});

if (!linkRes.ok) {
  console.error(`generate_link ${linkRes.status}: ${await linkRes.text()}`);
  process.exit(1);
}

const body = await linkRes.json();
const link = body.action_link ?? body.properties?.action_link;
const userId = body.user?.id ?? body.id;

if (!link || !userId) {
  console.error("Unexpected response from generate_link:");
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (promote) {
  const upsertRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?on_conflict=user_id`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ user_id: userId, role: "admin" }),
    },
  );
  if (!upsertRes.ok) {
    console.error(`promote ${upsertRes.status}: ${await upsertRes.text()}`);
    process.exit(1);
  }
}

console.log(`\nSign-in link for ${email}${promote ? " (admin)" : ""}:\n`);
console.log(link);
console.log("\nPaste the URL above into a browser. Valid for ~1 hour.\n");
