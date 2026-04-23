import { describe, it, expect } from "vitest";
import { resolveSafeNext } from "./safe-next";

describe("resolveSafeNext", () => {
  it("passes through a simple same-origin path", () => {
    expect(resolveSafeNext("/admin")).toBe("/admin");
    expect(resolveSafeNext("/admin/team")).toBe("/admin/team");
    expect(resolveSafeNext("/admin?x=1")).toBe("/admin?x=1");
  });

  it("falls back when next is missing", () => {
    expect(resolveSafeNext(null)).toBe("/admin");
    expect(resolveSafeNext("")).toBe("/admin");
  });

  it("rejects absolute URLs (open-redirect attempt)", () => {
    expect(resolveSafeNext("https://evil.com")).toBe("/admin");
    expect(resolveSafeNext("http://evil.com")).toBe("/admin");
  });

  it("rejects protocol-relative URLs", () => {
    // //evil.com expands to the request scheme + evil.com
    expect(resolveSafeNext("//evil.com")).toBe("/admin");
    expect(resolveSafeNext("//evil.com/admin")).toBe("/admin");
  });

  it("rejects backslash-prefixed URLs (browser normalization trick)", () => {
    expect(resolveSafeNext("\\evil.com")).toBe("/admin");
  });

  it("rejects non-slash-leading values", () => {
    expect(resolveSafeNext("admin")).toBe("/admin");
    expect(resolveSafeNext("javascript:alert(1)")).toBe("/admin");
  });

  it("honors a custom fallback", () => {
    expect(resolveSafeNext(null, "/")).toBe("/");
    expect(resolveSafeNext("https://evil.com", "/")).toBe("/");
  });
});
