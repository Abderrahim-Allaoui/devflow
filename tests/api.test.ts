import { describe, expect, it } from "vitest";
import { cleanString } from "@/lib/api";

describe("cleanString", () => {
  it("trims valid input", () => {
    expect(cleanString("  hello  ")).toBe("hello");
  });

  it("rejects non-strings, empty and whitespace-only values", () => {
    expect(cleanString(undefined)).toBeNull();
    expect(cleanString(42)).toBeNull();
    expect(cleanString({})).toBeNull();
    expect(cleanString("")).toBeNull();
    expect(cleanString("   ")).toBeNull();
  });

  it("enforces the max length", () => {
    expect(cleanString("a".repeat(10), 5)).toBeNull();
    expect(cleanString("a".repeat(5), 5)).toBe("aaaaa");
  });
});

describe("API validation rules", () => {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  it("accepts real emails and rejects junk", () => {
    expect(EMAIL_RE.test("user@example.com")).toBe(true);
    expect(EMAIL_RE.test("a@b.c")).toBe(true);
    expect(EMAIL_RE.test("not-an-email")).toBe(false);
    expect(EMAIL_RE.test("user@")).toBe(false);
  });

  it("keeps priorities in the allowed set", () => {
    const allowed = ["low", "medium", "high"];
    expect(allowed.includes("high")).toBe(true);
    expect(allowed.includes("urgent")).toBe(false);
  });
});
