import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { guardMutation, cleanString, jsonError } from "@/lib/api";
import { withSerializableTx } from "@/lib/tx";

type Params = { params: Promise<{ id: string; columnId: string }> };

/** Rename a column (position is untouched). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const { id, columnId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (
    body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).title === "string" &&
    ((body as Record<string, unknown>).title as string).trim().length > 80
  ) {
    return jsonError(400, "Column title must be at most 80 characters");
  }
  const title =
    body && typeof body === "object"
      ? cleanString((body as Record<string, unknown>).title, 80)
      : null;
  if (!title) return jsonError(400, "Column title is required");

  // Ownership: column must belong to a board owned by this user AND to board :id.
  const column = await prisma.column.findFirst({
    where: { id: columnId, boardId: id, board: { ownerId: user.id } },
  });
  if (!column) return jsonError(404, "Column not found");

  const updated = await prisma.column.update({
    where: { id: column.id },
    data: { title },
  });
  return NextResponse.json({ column: updated });
}

/**
 * Delete a column and its tasks; sibling columns are compacted to 0..n-1
 * inside the same transaction.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const { id, columnId } = await params;
  const column = await prisma.column.findFirst({
    where: { id: columnId, boardId: id, board: { ownerId: user.id } },
  });
  if (!column) return jsonError(404, "Column not found");

  await withSerializableTx(async (tx) => {
    await tx.column.delete({ where: { id: column.id } });
    // Re-compact sibling column positions.
    const siblings = await tx.column.findMany({
      where: { boardId: id },
      orderBy: { position: "asc" },
    });
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i].position !== i) {
        await tx.column.update({
          where: { id: siblings[i].id },
          data: { position: i },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
