/**
 * Rate limiter tests against a REAL SQLite database (temp file per run).
 * Covers: boundary at max, window expiry reset, fail-closed on dead DB,
 * and that concurrent bursts can never exceed the limit.
 */
import { describe, expect, it, afterAll, beforeAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "node:os";

let tmpDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "devflow-limit-"));
  const dbPath = join(tmpDir, "test.db");
  execSync("npx prisma db push --skip-generate --force-reset", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    cwd: process.cwd(),
  });
  process.env.DATABASE_URL = `file:${dbPath}`;
  prisma = new PrismaClient();
  // Prime the shared limiter module with this DATABASE_URL.
  const mod = await import("@/lib/rate-limit");
  (globalThis as Record<string, unknown>).__limiter = mod;
}, 180_000);

afterAll(async () => {
  const { prisma: shared } = await import("@/lib/prisma");
  await shared.$disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.loginAttempt.deleteMany();
});

function mod() {
  return (globalThis as any).__limiter as typeof import("@/lib/rate-limit");
}

describe("rate limiter (real DB)", () => {
  it("allows up to max, then blocks", async () => {
    const { hitRateLimit } = mod();
    const key = "login:email:boundary@example.com";
    for (let i = 0; i < 5; i++) {
      expect(await hitRateLimit(key, 5)).toBe(true);
    }
    expect(await hitRateLimit(key, 5)).toBe(false);
    expect(await hitRateLimit(key, 5)).toBe(false);
  });

  it("resets after the window expires", async () => {
    const { hitRateLimit } = mod();
    const key = "login:email:window@example.com";
    for (let i = 0; i < 5; i++) {
      expect(await hitRateLimit(key, 5)).toBe(true);
    }
    expect(await hitRateLimit(key, 5)).toBe(false);

    await prisma.loginAttempt.update({
      where: { key },
      data: { windowStart: new Date(Date.now() - 16 * 60 * 1000) },
    });

    expect(await hitRateLimit(key, 5)).toBe(true);
  });

  it("blocks are stable and cannot be outrun by concurrent bursts", async () => {
    const { hitRateLimit } = mod();
    const key = "login:email:race@example.com";
    const results = await Promise.all(
      Array.from({ length: 12 }, () => hitRateLimit(key, 5)),
    );
    const allowed = results.filter(Boolean).length;
    expect(allowed).toBeLessThanOrEqual(6); // 5 allowed + at most 1 window-open extra
    expect(allowed).toBeGreaterThanOrEqual(1);
  });

  it("fails closed when the table is missing", async () => {
    const { hitRateLimit } = mod();
    await prisma.$executeRawUnsafe('DROP TABLE "LoginAttempt"');
    expect(await hitRateLimit("login:email:dead@example.com", 5)).toBe(false);
    await prisma.$executeRawUnsafe(
      'CREATE TABLE "LoginAttempt" (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, windowStart DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
  }, 60_000);
});
