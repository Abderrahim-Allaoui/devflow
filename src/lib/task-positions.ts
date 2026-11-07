/**
 * Task position helpers — used by src/app/api/tasks routes so the drag & drop
 * ordering logic lives in one place (and can be integration-tested against a
 * real database without spinning up Next.js).
 *
 * Invariants kept inside a column:
 *   - positions are a compact permutation of 0..n-1 (no gaps, no duplicates)
 *   - a move clamps to the column length (B3)
 *   - every multi-step change runs inside prisma.$transaction (B2)
 */
import { PrismaClient } from "@prisma/client";

/** Minimal shape the helpers need from a PrismaClient or $transaction client. */
type TaskDb = {
  task: PrismaClient["task"];
};

/** Position for a newly appended task: max(position) + 1 (B1 — no duplicates). */
export async function appendPosition(
  tx: TaskDb,
  columnId: string,
  excludeId: string,
): Promise<number> {
  const max = await tx.task.aggregate({
    where: { columnId, id: { not: excludeId } },
    _max: { position: true },
  });
  return (max._max.position ?? -1) + 1;
}

/** Clamp a target index into [0, siblingCount] (B3). */
export function clampPosition(target: number, siblingCount: number): number {
  return Math.min(Math.max(target, 0), siblingCount);
}

/**
 * Compact siblings around `newIndex` so positions become 0..n-1 (B1/B3).
 * Returns the list of (id, desiredPosition) updates to apply.
 */
export function normalizeColumnPlan(
  siblings: { id: string; position: number }[],
  newIndex: number,
  excludeId: string,
): { id: string; position: number }[] {
  return siblings
    .filter((t) => t.id !== excludeId)
    .map((t, i) => ({
      id: t.id,
      position: i < newIndex ? i : i + 1,
    }))
    .filter((u) => {
      const cur = siblings.find((t) => t.id === u.id);
      return cur && cur.position !== u.position;
    });
}
