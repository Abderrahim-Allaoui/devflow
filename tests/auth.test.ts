import { describe, expect, it } from "vitest";
import {
  hashPassword,
  signToken,
  verifyPassword,
  verifyToken,
} from "@/lib/auth";

describe("password hashing", () => {
  it("hashes then verifies a password", async () => {
    const hash = await hashPassword("s3cure-password!");
    expect(hash).not.toBe("s3cure-password!");
    expect(await verifyPassword("s3cure-password!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cure-password!");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a unique hash per call (salt)", async () => {
    const a = await hashPassword("same-input");
    const b = await hashPassword("same-input");
    expect(a).not.toBe(b);
  });
});

describe("JWT session tokens", () => {
  const payload = { sub: "user_1", email: "a@b.co", name: "Ada" };

  it("signs and verifies a token", () => {
    const token = signToken(payload);
    expect(verifyToken(token)).toMatchObject(payload);
  });

  it("rejects a tampered token", () => {
    const token = signToken(payload);
    expect(verifyToken(token + "x")).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(verifyToken("not-a-token")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });
});
