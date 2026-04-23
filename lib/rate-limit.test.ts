import { describe, it, expect } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to `limit` hits inside the window", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, { limit: 3, windowSec: 60 }).allowed).toBe(true);
    }
    expect(rateLimit(key, { limit: 3, windowSec: 60 }).allowed).toBe(false);
  });

  it("returns retryAfterSec when denied", () => {
    const key = `t:${Math.random()}`;
    rateLimit(key, { limit: 1, windowSec: 60 });
    const r = rateLimit(key, { limit: 1, windowSec: 60 });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.retryAfterSec).toBeGreaterThan(0);
      expect(r.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });

  it("isolates buckets by key", () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    rateLimit(a, { limit: 1, windowSec: 60 });
    rateLimit(a, { limit: 1, windowSec: 60 });
    // b should still be allowed; a exhausted shouldn't leak.
    expect(rateLimit(b, { limit: 1, windowSec: 60 }).allowed).toBe(true);
  });
});
