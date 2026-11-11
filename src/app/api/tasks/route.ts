import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { guardMutation, cleanString, jsonError } from "@/lib/api";
import { PRIORITIES } from "@/lib/validation";
import { getOwnedColumn } from "@/lib/ownership";
import { withSerializableTx } from "@/lib/tx";


export async function POST(req: NextRequest) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (body === null || typeof body !== "object") {
    return jsonError(400, "Invalid payload");
  }

  const { columnId, title, description, priority } = body as Record<
    string,
    unknown
  >;

  if (typeof title === "string" && title.trim().length > 160) {
    return jsonError(400, "Title must be at most 160 characters");
  }
  const cleanTitle = cleanString(title, 160);
  if (
    description !== undefined &&
    description !== null &&
    (typeof description !== "string" || description.length > 2000)
  ) {
    return jsonError(400, "description must be a string of at most 2000 characters");
  }
  const cleanDescription =
    description === null || description === undefined
      ? null
      : cleanString(description, 2000);
  if (
    priority !== undefined &&
    (typeof priority !== "string" || !PRIORITIES.includes(priority))
  ) {
    return jsonError(400, "priority must be low, medium or high");
  }
  const cleanPriority =
    typeof priority === "string" && PRIORITIES.includes(priority)
      ? priority
      : "medium";

  if (typeof columnId !== "string" || !cleanTitle) {
    return jsonError(400, "columnId and title are required");
  }

  const column = await getOwnedColumn(columnId, user.id);
  if (!column) return jsonError(404, "Column not found");

  // B1 — append at max(position) + 1, atomically with the create.
  const task = await withSerializableTx(async (tx) => {
    const max = await tx.task.aggregate({
      where: { columnId: column.id },
      _max: { position: true },
    });
    const position = (max._max.position ?? -1) + 1;
    return tx.task.create({
      data: {
        title: cleanTitle,
        description: cleanDescription,
        priority: cleanPriority,
        columnId: column.id,
        position,
      },
    });
  });

  return NextResponse.json({ task }, { status: 201 });
}
