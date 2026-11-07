import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cleanString, jsonError } from "@/lib/api";
import { PRIORITIES } from "@/lib/validation";
import { getOwnedColumn, getOwnedTask } from "@/lib/ownership";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
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
    if (!title) return jsonError(400, "Title cannot be empty");
    data.title = title;
  }
  if (patch.description !== undefined) {
    data.description = cleanString(patch.description, 2000) ?? null;
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

  if (targetColumnId || targetIndex !== null) {
    const finalColumnId = targetColumnId ?? task.columnId;

    const updated = await prisma.$transaction(async (tx) => {
      // B2 — both writes inside one transaction: concurrent drag-and-drop
      // requests cannot interleave and corrupt ordering.
      const siblings = await tx.task.findMany({
        where: { columnId: finalColumnId, id: { not: task.id } },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });

      let newIndex: number;
      if (targetIndex !== null) {
        newIndex = Math.min(Math.max(targetIndex, 0), siblings.length);
      } else {
        // B1 — append at max(position) + 1 instead of count (no duplicates).
        const max = siblings.reduce((m, t) => Math.max(m, t.position), -1);
        newIndex = max + 1;
      }

      // Normalize siblings around newIndex (positions stay 0..n-1 compact).
      siblings.forEach((t, i) => {
        const desired = i < newIndex ? i : i + 1;
        if (t.position !== desired) {
          void tx.task.update({
            where: { id: t.id },
            data: { position: desired },
          });
        }
      });

      const taskUpdate: Record<string, unknown> = { position: newIndex };
      if (finalColumnId !== task.columnId) {
        taskUpdate.columnId = finalColumnId;
      }
      if (data.title !== undefined) taskUpdate.title = data.title;
      if (data.description !== undefined)
        taskUpdate.description = data.description;
      if (data.priority !== undefined) taskUpdate.priority = data.priority;

      await tx.task.update({ where: { id: task.id }, data: taskUpdate });

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

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const { id } = await params;
  const task = await getOwnedTask(id, user.id);
  if (!task) return jsonError(404, "Task not found");

  const columnId = task.columnId;

  await prisma.$transaction(async (tx) => {
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
