import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cleanString, jsonError } from "@/lib/api";
import { getOwnedColumn, getOwnedTask } from "@/lib/ownership";

const PRIORITIES = ["low", "medium", "high"];
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
    if (typeof patch.position !== "number" || !Number.isInteger(patch.position) || patch.position < 0) {
      return jsonError(400, "position must be a positive integer");
    }
    targetIndex = patch.position;
  }

  if (targetColumnId || targetIndex !== null) {
    const finalColumnId = targetColumnId ?? task.columnId;

    // Make room in the destination column
    if (targetIndex !== null) {
      await prisma.task.updateMany({
        where: { columnId: finalColumnId, id: { not: task.id }, position: { gte: targetIndex } },
        data: { position: { increment: 1 } },
      });
    } else {
      const count = await prisma.task.count({ where: { columnId: finalColumnId } });
      targetIndex = count;
    }

    data.columnId = finalColumnId;
    data.position = targetIndex;
  }

  const updated = await prisma.task.update({ where: { id: task.id }, data });
  return NextResponse.json({ task: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const { id } = await params;
  const task = await getOwnedTask(id, user.id);
  if (!task) return jsonError(404, "Task not found");

  await prisma.task.delete({ where: { id: task.id } });
  return NextResponse.json({ ok: true });
}
