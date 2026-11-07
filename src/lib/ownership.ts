import { prisma } from "./prisma";

/** Returns the board only if it belongs to the user, else null.
 *
 * B7 — `taskLimit` caps tasks loaded per column so a single board view
 * never pulls an unbounded number of tasks.
 */
export async function getOwnedBoard(
  boardId: string,
  userId: string,
  taskLimit = 50,
) {
  return prisma.board.findFirst({
    where: { id: boardId, ownerId: userId },
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: { tasks: { orderBy: { position: "asc" }, take: taskLimit } },
      },
    },
  });
}

/** Returns the column only if its board belongs to the user, else null. */
export async function getOwnedColumn(columnId: string, userId: string) {
  return prisma.column.findFirst({
    where: { id: columnId, board: { ownerId: userId } },
  });
}

/** Returns a task only if its column's board belongs to the user, else null. */
export async function getOwnedTask(taskId: string, userId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, column: { board: { ownerId: userId } } },
  });
}
