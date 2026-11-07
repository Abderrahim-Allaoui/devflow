import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOwnedBoard, getOwnedColumn, getOwnedTask } from "@/lib/ownership";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    board: { findFirst: vi.fn() },
    column: { findFirst: vi.fn() },
    task: { findFirst: vi.fn() },
  },
}));

const db = prisma as unknown as {
  board: { findFirst: ReturnType<typeof vi.fn> };
  column: { findFirst: ReturnType<typeof vi.fn> };
  task: { findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe("ownership guards scope every lookup to the owner", () => {
  it("getOwnedBoard filters by ownerId", async () => {
    db.board.findFirst.mockResolvedValue(null);
    await getOwnedBoard("board_1", "user_B");
    expect(db.board.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "board_1", ownerId: "user_B" } }),
    );
  });

  it("getOwnedColumn walks through the board owner", async () => {
    db.column.findFirst.mockResolvedValue(null);
    await getOwnedColumn("col_1", "user_B");
    expect(db.column.findFirst).toHaveBeenCalledWith({
      where: { id: "col_1", board: { ownerId: "user_B" } },
    });
  });

  it("getOwnedTask walks through column -> board owner", async () => {
    db.task.findFirst.mockResolvedValue(null);
    await getOwnedTask("task_1", "user_B");
    expect(db.task.findFirst).toHaveBeenCalledWith({
      where: { id: "task_1", column: { board: { ownerId: "user_B" } } },
    });
  });

  it("returns null when the resource is not owned", async () => {
    db.task.findFirst.mockResolvedValue(null);
    expect(await getOwnedTask("task_1", "user_B")).toBeNull();
  });
});
