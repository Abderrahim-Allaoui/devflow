import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PATCH, DELETE } from "@/app/api/tasks/[id]/route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn(), delete: vi.fn() },
    column: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/tasks/task_A", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

// User B is logged in; task_A belongs to user A.
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "user_B", email: "b@x.co", name: "B" } as never);
});

describe("cross-user access on tasks is refused", () => {
  it("DELETE another user's task -> 404, nothing deleted", async () => {
    db.task.findFirst.mockResolvedValue(null); // ownership guard: not B's task
    const res = await DELETE(new NextRequest("http://localhost/api/tasks/task_A", { method: "DELETE" }), ctx("task_A"));
    expect(res.status).toBe(404);
    expect(db.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "task_A", column: { board: { ownerId: "user_B" } } } }),
    );
    expect(db.task.delete).not.toHaveBeenCalled();
  });

  it("PATCH another user's task -> 404, nothing updated", async () => {
    db.task.findFirst.mockResolvedValue(null);
    const res = await PATCH(req({ title: "pwned" }), ctx("task_A"));
    expect(res.status).toBe(404);
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("PATCH moving B's task into A's column -> 404, no move", async () => {
    db.task.findFirst.mockResolvedValue({ id: "task_B", columnId: "col_B" });
    db.column.findFirst.mockResolvedValue(null); // target column not owned by B
    const res = await PATCH(req({ columnId: "col_A" }), ctx("task_B"));
    expect(res.status).toBe(404);
    expect(db.column.findFirst).toHaveBeenCalledWith({
      where: { id: "col_A", board: { ownerId: "user_B" } },
    });
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("unauthenticated request -> 401 before any DB access", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await DELETE(new NextRequest("http://localhost/api/tasks/task_A", { method: "DELETE" }), ctx("task_A"));
    expect(res.status).toBe(401);
    expect(db.task.findFirst).not.toHaveBeenCalled();
  });
});
