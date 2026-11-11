import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { guardMutation, cleanString, jsonError } from "@/lib/api";
import { PRIORITIES } from "@/lib/validation";
import { getOwnedColumn, getOwnedTask } from "@/lib/ownership";
import {
  appendPosition,
  clampPosition,
  normalizeColumnPlan,
} from "@/lib/task-positions";
import { withSerializableTx } from "@/lib/tx";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const { id } = await params;
  const task = await getOwnedTask(id, user.id);
  if (!task) return jsonError(404, "Task not found");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (body === null || typeof body !== "object") {
    return jsonError(400, "Invalid payload");
  }

  const patch = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  const title = cleanString(patch.title, 160);
  if (patch.title !== undefined) {
    if (typeof patch.title === "string" && patch.title.trim().length > 160) {
      return jsonError(400, "Title must be at most 160 characters");
    }
    if (!title) return jsonError(400, "Title cannot be empty");
    data.title = title;
  }
  if (patch.description !== undefined) {
    if (
      patch.description !== null &&
      (typeof patch.description !== "string" || patch.description.length > 2000)
    ) {
      return jsonError(400, "description must be a string of at most 2000 characters");
    }
    data.description = patch.description === null
      ? null
      : cleanString(patch.description, 2000);
  }
  if (patch.priority !== undefined) {
    if (typeof patch.priority !== "string" || !PRIORITIES.includes(patch.priority)) {
      return jsonError(400, "priority must be low, medium or high");
    }
    data.priority = patch.priority;
  }

  // Optional move (drag & drop): target column and/or index
  let targetColumnId: string | null = null;
  let targetIndex: number | null = null;

  if (patch.columnId !== undefined) {
    if (typeof patch.columnId !== "string") {
      return jsonError(400, "columnId must be a string");
    }
    const column = await getOwnedColumn(patch.columnId, user.id);
    if (!column) return jsonError(404, "Target column not found");
    targetColumnId = column.id;
  }

  if (patch.position !== undefined) {
    // B3 — clamp to the column length inside the transaction (no holes).
    if (
      typeof patch.position !== "number" ||
      !Number.isInteger(patch.position) ||
      patch.position < 0
    ) {
      return jsonError(400, "position must be a non-negative integer");
    }
    targetIndex = patch.position;
  }

  // Same column, no explicit index → no move at all (never reorder to end).
  if (targetColumnId === task.columnId && targetIndex === null) {
    targetColumnId = null;
  }

  if (targetColumnId || targetIndex !== null) {
    const finalColumnId = targetColumnId ?? task.columnId;
    const sourceColumnId = task.columnId;

    const updated = await withSerializableTx(async (tx) => {
      // B2 — both writes inside one transaction: concurrent drag-and-drop
      // requests cannot interleave and corrupt ordering.
      const siblings = await tx.task.findMany({
        where: { columnId: finalColumnId, id: { not: task.id } },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });

      let newIndex: number;
      if (targetIndex !== null) {
        // B3 — clamp to the column length (no holes accepted).
        newIndex = clampPosition(targetIndex, siblings.length);
      } else {
        // B1 — append at max(position) + 1 instead of count (no duplicates).
        newIndex = await appendPosition(tx, finalColumnId, task.id);
      }

      // Normalize siblings around newIndex (positions stay 0..n-1 compact).
      const moves = normalizeColumnPlan(siblings, newIndex, task.id);
      await Promise.all(
        moves.map(({ id, position }) =>
          tx.task.update({ where: { id }, data: { position } }),
        ),
      );

      const taskUpdate: Record<string, unknown> = { position: newIndex };
      if (finalColumnId !== task.columnId) {
        taskUpdate.columnId = finalColumnId;
      }
      if (data.title !== undefined) taskUpdate.title = data.title;
      if (data.description !== undefined)
        taskUpdate.description = data.description;
      if (data.priority !== undefined) taskUpdate.priority = data.priority;

      await tx.task.update({ where: { id: task.id }, data: taskUpdate });

      // Compact the SOURCE column too (the moved task left a gap there).
      if (finalColumnId !== sourceColumnId) {
        const sourceSiblings = await tx.task.findMany({
          where: { columnId: sourceColumnId },
          orderBy: { position: "asc" },
          select: { id: true, position: true },
        });
        for (let i = 0; i < sourceSiblings.length; i++) {
          if (sourceSiblings[i].position !== i) {
            await tx.task.update({
              where: { id: sourceSiblings[i].id },
              data: { position: i },
            });
          }
        }
      }

      return tx.task.findUnique({ where: { id: task.id } });
    });

    return NextResponse.json({ task: updated });
  }

  // Plain field update without move.
  if (Object.keys(data).length > 0) {
    const updated = await prisma.task.update({ where: { id: task.id }, data });
    return NextResponse.json({ task: updated });
  }

  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const { id } = await params;
  const task = await getOwnedTask(id, user.id);
  if (!task) return jsonError(404, "Task not found");

  const columnId = task.columnId;

  await withSerializableTx(async (tx) => {
    await tx.task.delete({ where: { id: task.id } });
    // B1 — normalize remaining positions to 0..n-1 after deletion.
    const remaining = await tx.task.findMany({
      where: { columnId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    await Promise.all(
      remaining.map((t, i) =>
        tx.task.update({ where: { id: t.id }, data: { position: i } }),
      ),
    );
  });

  return NextResponse.json({ ok: true });
}
