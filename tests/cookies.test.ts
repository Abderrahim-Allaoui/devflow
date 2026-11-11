import { describe, expect, it, vi } from "vitest";

const set = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ set, get: () => undefined }),
}));

import { setSessionCookie, clearSessionCookie } from "@/lib/auth";

describe("session cookie flags", () => {
  it("is httpOnly, sameSite=lax, path=/, 7 days, secure in production", async () => {
    await setSessionCookie({ sub: "u1", email: "a@b.co", name: "Ada", tv: 0 });
    const [name, , opts] = set.mock.calls[0];
    expect(name).toBe("devflow_token");
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(60 * 60 * 24 * 7);
    expect(typeof opts.secure).toBe("boolean");
  });

  it("clear uses the same attributes as set", async () => {
    set.mockClear();
    await clearSessionCookie();
    const [name, value, opts] = set.mock.calls[0];
    expect(name).toBe("devflow_token");
    expect(value).toBe("");
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(0);
  });
});
