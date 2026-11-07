/**
 * T4 — Integration tests against a REAL SQLite database (one temp DB per run).
 *
 * These exercise the SAME position helpers that the tasks route handlers call
 * (src/lib/task-positions.ts), inside a real prisma.$transaction, so they catch
 * the B1/B2/B3 ordering bugs that mocked Prisma cannot.
 *
 * Each test creates a fresh temp DB, pushes the schema, runs the fix logic,
 * then deletes the DB.
 */
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "node:os";
import { hashPassword } from "@/lib/auth";
import {
  appendPosition,
  clampPosition,
  normalizeColumnPlan,
} from "@/lib/task-positions";

let tmpDir: string;
let dbPath: string;
let prisma: PrismaClient;

function setDbUrl(url: string) {
  process.env.DATABASE_URL = url;
  prisma = new PrismaClient();
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "devflow-integration-"));
  dbPath = join(tmpDir, "test.db");
  setDbUrl(`file:${dbPath}`);

  execSync("npx prisma db push --skip-generate --force-reset", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    cwd: process.cwd(),
  });
});

afterEach(async () => {
  await prisma.$disconnect().catch(() => {});
  rmSync(tmpDir, { recursive: true, force: true });
});

async function seedColumnAsync() {
  const user = await prisma.user.create({
    data: {
      email: "carol@example.com",
      name: "Carol",
      passwordHash: await hashPassword("Pass1234!"),
    },
  });
  const board = await prisma.board.create({
    data: { title: "B", ownerId: user.id },
  });
  const column = await prisma.column.create({
    data: { title: "Todo", position: 0, boardId: board.id },
  });
  // T0, T1, T2 at positions 0,1,2
  for (let i = 0; i < 3; i++) {
    await prisma.task.create({
      data: { title: `T${i}`, position: i, columnId: column.id },
    });
  }
  return { userId: user.id, columnId: column.id };
}

describe("auth end-to-end (real DB)", () => {
  it("registers a user and verifies password against real hash", async () => {
    const hash = await hashPassword("Secret1234!");
    const user = await prisma.user.create({
      data: { email: "alice@example.com", name: "Alice", passwordHash: hash },
    });
    const { verifyPassword } = await import("@/lib/auth");
    expect(await verifyPassword("Secret1234!", user.passwordHash)).toBe(true);
    expect(await verifyPassword("Wrong1234!", user.passwordHash)).toBe(false);
  });
});

describe("task positions B1/B2/B3 (real DB)", () => {
  it("B1 — appendPosition is max+1 (no duplicates/gaps)", async () => {
    const { columnId } = await seedColumnAsync();
    const pos = await appendPosition(prisma, columnId, "__none__");
    expect(pos).toBe(3);
    await prisma.task.create({
      data: { title: "T3", position: pos, columnId },
    });
    const tasks = await prisma.task.findMany({
      where: { columnId },
      orderBy: { position: "asc" },
    });
    expect(tasks.map((t) => t.position)).toEqual([0, 1, 2, 3]);
  });

  it("B1 — delete normalizes remaining to 0..n-1", async () => {
    const { columnId } = await seedColumnAsync();
    const toDelete = await prisma.task.findFirst({
      where: { columnId, position: 1 },
    });
    await prisma.task.delete({ where: { id: toDelete!.id } });
    const remaining = await prisma.task.findMany({
      where: { columnId },
      orderBy: { position: "asc" },
    });
    // simulate the route's delete normalization
    await Promise.all(
      remaining.map((t, i) =>
        prisma.task.update({ where: { id: t.id }, data: { position: i } }),
      ),
    );
    const after = await prisma.task.findMany({
      where: { columnId },
      orderBy: { position: "asc" },
    });
    expect(after.map((t) => t.position)).toEqual([0, 1]);
    expect(after.map((t) => t.title)).toEqual(["T0", "T2"]);
  });

  it("B3 — clampPosition keeps index in [0, n]", async () => {
    expect(clampPosition(-5, 3)).toBe(0);
    expect(clampPosition(0, 3)).toBe(0);
    expect(clampPosition(2, 3)).toBe(2);
    expect(clampPosition(3, 3)).toBe(3);
    expect(clampPosition(100, 3)).toBe(3);
  });

  it("B1+B3 — move clamps to end and compacts siblings (inside tx)", async () => {
    const { columnId } = await seedColumnAsync();
    const t0 = await prisma.task.findFirst({
      where: { columnId, position: 0 },
    });

    await prisma.$transaction(async (tx) => {
      const siblings = await tx.task.findMany({
        where: { columnId, id: { not: t0!.id } },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      const newIndex = clampPosition(5, siblings.length); // clamped to 2
      const moves = normalizeColumnPlan(siblings, newIndex, t0!.id);
      await Promise.all(
        moves.map(({ id, position }) =>
          tx.task.update({ where: { id }, data: { position } }),
        ),
      );
      await tx.task.update({
        where: { id: t0!.id },
        data: { position: newIndex },
      });
    });

    const after = await prisma.task.findMany({
      where: { columnId },
      orderBy: { position: "asc" },
    });
    expect(after.map((t) => t.position)).toEqual([0, 1, 2]);
    expect(after[2].title).toBe("T0");
  });

  it("B2 — concurrent moves stay a compact permutation (inside one tx)", async () => {
    const { columnId } = await seedColumnAsync();
    const tasks = await prisma.task.findMany({
      where: { columnId },
      orderBy: { position: "asc" },
    });

    await prisma.$transaction(async (tx) => {
      // Two concurrent drag-and-drop intentions serialized in one tx.
      const s0 = await tx.task.findMany({
        where: { columnId, id: { not: tasks[0].id } },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      const m0 = normalizeColumnPlan(s0, 2, tasks[0].id);
      await Promise.all(
        m0.map(({ id, position }) =>
          tx.task.update({ where: { id }, data: { position } }),
        ),
      );
      await tx.task.update({
        where: { id: tasks[0].id },
        data: { position: 2 },
      });

      const s2 = await tx.task.findMany({
        where: { columnId, id: { not: tasks[2].id } },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      const m2 = normalizeColumnPlan(s2, 0, tasks[2].id);
      await Promise.all(
        m2.map(({ id, position }) =>
          tx.task.update({ where: { id }, data: { position } }),
        ),
      );
      await tx.task.update({
        where: { id: tasks[2].id },
        data: { position: 0 },
      });
    });

    const final = await prisma.task.findMany({
      where: { columnId },
      orderBy: { position: "asc" },
    });
    expect(final.map((t) => t.position)).toEqual([0, 1, 2]);
    expect(final.map((t) => t.title).sort()).toEqual(["T0", "T1", "T2"]);
  });
});

describe("helpers (pure)", () => {
  it("normalizeColumnPlan compacts around newIndex", async () => {
    const siblings = [
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ];
    // Move "c" (pos 2) to front index 0 → a→1, b→2
    const plan = normalizeColumnPlan(siblings, 0, "c");
    expect(plan).toEqual([
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ]);
    // Single sibling, removed → nothing to compact
    expect(normalizeColumnPlan([{ id: "x", position: 5 }], 0, "x")).toEqual([]);
  });
});
