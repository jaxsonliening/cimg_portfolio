import { NextResponse } from "next/server";
import { z } from "zod";
import { isConfigured as emailConfigured, sendEmail } from "@/lib/email/sendgrid";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Public self-serve sign-in. Replaces Supabase's default-SMTP
// magic-link flow (which is rate-limited and routinely blocked by
// .edu MX). We generate the link server-side with the service-role
// key, then deliver it via our configured email provider (SendGrid).
//
// The link MUST only reach the address being signed into, never the
// caller. Returning it to the anonymous HTTP caller would let anyone
// produce a valid session cookie for any email they type. When email
// isn't configured or delivery fails, we fail closed with 503/502 so
// the operator sees it during setup. The /admin/team invite UI is
// gated by requireAdmin() and legitimately hands the URL to the admin
// who forwards it out-of-band; scripts/admin-link.mjs is the bootstrap
// path that doesn't depend on email at all.

const BodySchema = z.object({
  email: z.string().email().trim().toLowerCase(),
});

type GenerateLinkResponse = {
  hashed_token?: unknown;
  action_link?: unknown;
  properties?: {
    hashed_token?: unknown;
    action_link?: unknown;
  };
  user?: { id?: unknown };
  id?: unknown;
};

export async function POST(request: Request) {
  // Per-IP and per-email throttles. The public endpoint touches our
  // SendGrid quota and the target user's inbox; a loose limit here
  // keeps casual abuse from burning through 100 emails/day or spamming
  // any one address. Not a substitute for infra-level DDoS protection.
  const ip = clientIp(request);
  const ipLimit = rateLimit(`email-link:ip:${ip}`, { limit: 5, windowSec: 60 });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
    );
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  const emailLimit = rateLimit(`email-link:addr:${parsed.email}`, {
    limit: 3,
    windowSec: 300,
  });
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in requests for that address. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSec) } },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appOrigin = process.env.APP_URL ?? new URL(request.url).origin;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "server not configured" },
      { status: 500 },
    );
  }

  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "magiclink",
      email: parsed.email,
      redirect_to: `${appOrigin}/auth/confirm?next=/admin`,
    }),
  });
  if (!linkRes.ok) {
    // Don't echo the raw Supabase error body — could leak internals.
    return NextResponse.json(
      { error: `generate_link failed with ${linkRes.status}` },
      { status: 502 },
    );
  }

  const body = (await linkRes.json()) as GenerateLinkResponse;
  const hashedToken = extractHashedToken(body);
  const userId = extractUserId(body);

  if (!hashedToken || !userId) {
    return NextResponse.json(
      { error: "unexpected generate_link response" },
      { status: 502 },
    );
  }

  if (!emailConfigured()) {
    // Fail closed: see the file header. Without email delivery we have
    // no channel that proves the caller controls this mailbox.
    return NextResponse.json(
      {
        error:
          "Email delivery is not configured on this deployment. Ask an admin to invite you from /admin/team, or use the npm run admin-link CLI.",
      },
      { status: 503 },
    );
  }

  const confirmUrl = new URL(`${appOrigin}/auth/confirm`);
  confirmUrl.searchParams.set("token_hash", hashedToken);
  confirmUrl.searchParams.set("type", "magiclink");
  confirmUrl.searchParams.set("next", "/admin");
  const url = confirmUrl.toString();

  try {
    await sendEmail({
      to: parsed.email,
      subject: "Your CIMG Portfolio sign-in link",
      text: textBody(url),
      html: htmlBody(url),
    });
  } catch (err) {
    // Don't leak the provider error to the client or downgrade to
    // inline delivery. Server-side log only.
    console.error("email send failed:", err);
    return NextResponse.json(
      { error: "Couldn't send the sign-in email. Try again in a minute." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, delivery: "email" });
}

function extractHashedToken(body: GenerateLinkResponse): string | null {
  if (typeof body.hashed_token === "string") return body.hashed_token;
  if (typeof body.properties?.hashed_token === "string") {
    return body.properties.hashed_token;
  }
  const rawLink =
    typeof body.action_link === "string"
      ? body.action_link
      : typeof body.properties?.action_link === "string"
        ? body.properties.action_link
        : null;
  if (!rawLink) return null;
  try {
    return new URL(rawLink).searchParams.get("token");
  } catch {
    return null;
  }
}

function extractUserId(body: GenerateLinkResponse): string | null {
  if (typeof body.user?.id === "string") return body.user.id;
  if (typeof body.id === "string") return body.id;
  return null;
}

function textBody(url: string): string {
  return [
    "Click the link below to sign in to CIMG Portfolio:",
    "",
    url,
    "",
    "This link expires in 1 hour. If you didn't request it, ignore this email.",
  ].join("\n");
}

function htmlBody(url: string): string {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html>
  <body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; line-height: 1.5;">
    <p>Click the link below to sign in to <strong>CIMG Portfolio</strong>:</p>
    <p><a href="${safeUrl}" style="display: inline-block; padding: 10px 16px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">Sign in</a></p>
    <p style="font-size: 12px; color: #555;">Or paste this URL into your browser:<br><code style="word-break: break-all;">${safeUrl}</code></p>
    <p style="font-size: 12px; color: #555;">This link expires in 1 hour. If you didn&apos;t request it, ignore this email.</p>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
