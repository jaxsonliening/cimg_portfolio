// Safe post-auth redirect target resolver.
//
// `next` comes from query string, meaning it's attacker-controlled. Passing
// it directly to `new URL(next, origin)` silently accepts absolute URLs
// (`https://evil.com`) and protocol-relative URLs (`//evil.com`),
// producing an open-redirect: user verifies auth on our domain, gets
// redirected off-domain with the trust of having just signed in.
//
// Accept only single-leading-slash same-origin paths. Anything else
// falls back to `fallback` (default /admin).

const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9/_\-?=&.%]*$/;

export function resolveSafeNext(next: string | null, fallback = "/admin"): string {
  if (!next) return fallback;
  if (!SAFE_PATH.test(next)) return fallback;
  return next;
}
