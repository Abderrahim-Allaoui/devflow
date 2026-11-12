/**
 * Route-level handler tests for boards / columns / tasks — mocked Prisma,
 * so they run fast and cover the HTTP contract without a database.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createBoard, GET as listBoards } from "@/app/api/boards/route";
import { POST as createColumn } from "@/app/api/boards/[id]/columns/route";
import { PATCH as patchColumn, DELETE as deleteColumn } from "@/app/api/boards/[id]/columns/[columnId]/route";
import { POST as createTask } from "@/app/api/tasks/route";

const user = { id: "u1", email: "ada@x.co", name: "Ada" };

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => user),
}));

const boardRecord = {
  id: "b1",
  title: "B",
  ownerId: "u1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  columns: [
    {
      id: "c1",
      title: "Backlog",
      position: 0,
      boardId: "b1",
      tasks: [],
      _count: { tasks: 0 },
    },
  ],
};
const state = {
  board: { ...boardRecord } as Record<string, unknown>,
  column: { id: "c9", title: "Tests", position: 3, boardId: "b1" } as Record<string, unknown>,
  task: { id: "t1", title: "T", columnId: "c1", position: 0 } as Record<string, unknown>,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    board: {
      create: vi.fn(async () => boardRecord),
      findMany: vi.fn(async () => [boardRecord]),
      findFirst: vi.fn(async () => boardRecord),
      update: vi.fn(async () => boardRecord),
      updateMany: vi.fn(async () => ({ count: 1 })),
      delete: vi.fn(async () => boardRecord),
    },
    column: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...state.column, ...data })),
      findFirst: vi.fn(async () => state.column),
      findMany: vi.fn(async () => [state.column]),
      update: vi.fn(async () => state.column),
      delete: vi.fn(async () => state.column),
      aggregate: vi.fn(async () => ({ _max: { position: 2 } })),
    },
    task: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t1", ...data })),
      aggregate: vi.fn(async () => ({ _max: { position: 0 } })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>, _options?: unknown) =>
      fn({
        column: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c9", ...data })),
          findMany: vi.fn(async () => [state.column]),
          update: vi.fn(async () => state.column),
          delete: vi.fn(async () => state.column),
          aggregate: vi.fn(async () => ({ _max: { position: 2 } })),
        },
        task: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t1", ...data })),
          aggregate: vi.fn(async () => ({ _max: { position: 0 } })),
        },
      }),
    ),
  },
}));

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => vi.clearAllMocks());

describe("boards routes (mocked Prisma)", () => {
  it("POST /api/boards creates and returns 201", async () => {
    const res = await createBoard(req("/api/boards", "POST", { title: "Nova" }));
    expect(res.status).toBe(201);
  });

  it("GET /api/boards returns 200 with boards array", async () => {
    const res = await listBoards(req("/api/boards", "GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.boards)).toBe(true);
  });

  it("POST /api/boards with empty title returns 400", async () => {
    const res = await createBoard(req("/api/boards", "POST", { title: "" }));
    expect(res.status).toBe(400);
  });
});

describe("columns routes (mocked Prisma)", () => {
  it("POST /api/boards/:id/columns creates a column (201)", async () => {
    const res = await createColumn(
      req("/api/boards/b1/columns", "POST", { title: "Tests" }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    expect(res.status).toBe(201);
  });

  it("PATCH /api/boards/:id/columns/:cid renames (200)", async () => {
    const res = await patchColumn(
      req("/api/boards/b1/columns/c9", "PATCH", { title: "Renamed" }),
      { params: Promise.resolve({ id: "b1", columnId: "c9" }) },
    );
    expect(res.status).toBe(200);
  });

  it("DELETE /api/boards/:id/columns/:cid deletes (200)", async () => {
    const res = await deleteColumn(
      req("/api/boards/b1/columns/c9", "DELETE"),
      { params: Promise.resolve({ id: "b1", columnId: "c9" }) },
    );
    expect(res.status).toBe(200);
  });
});

describe("tasks routes (mocked Prisma)", () => {
  it("POST /api/tasks creates a task (201)", async () => {
    const res = await createTask(
      req("/api/tasks", "POST", { columnId: "c1", title: "X" }),
    );
    expect(res.status).toBe(201);
  });

  it("POST /api/tasks with invalid priority returns 400", async () => {
    const res = await createTask(
      req("/api/tasks", "POST", { columnId: "c1", title: "X", priority: "urgent" }),
    );
    expect(res.status).toBe(400);
  });
});
