// Per-instance in-memory sliding-window rate limiter.
//
// Lives in the serverless function's module memory, so limits are
// per-instance (Vercel may spin up several) and reset when the instance
// shuts down. That's fine for cheap abuse prevention — an attacker who
// wants to burn the SendGrid quota has to keep hammering different cold
// instances, which Vercel's edge already rate-limits separately. This
// isn't a substitute for a durable store if we ever need strict caps.

const BUCKETS = new Map<string, number[]>();

type CheckResult = { allowed: true } | { allowed: false; retryAfterSec: number };

export function rateLimit(
  key: string,
  { limit, windowSec }: { limit: number; windowSec: number },
): CheckResult {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const cutoff = now - windowMs;

  const hits = (BUCKETS.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    const oldest = hits[0];
    const retryAfterMs = oldest + windowMs - now;
    BUCKETS.set(key, hits);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  hits.push(now);
  BUCKETS.set(key, hits);
  return { allowed: true };
}

// Best-effort client-IP resolver for a serverless fetch Request.
// Trusts the left-most X-Forwarded-For hop since Vercel terminates TLS
// and prepends the real client IP.
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
