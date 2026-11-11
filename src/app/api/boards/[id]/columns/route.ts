import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cleanString, jsonError } from "@/lib/api";
import { getOwnedBoard } from "@/lib/ownership";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const { id } = await params;
  const board = await getOwnedBoard(id, user.id);
  if (!board) return jsonError(404, "Board not found");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (typeof (body as Record<string, unknown>)?.title === "string" &&
      ((body as Record<string, unknown>).title as string).trim().length > 80) {
    return jsonError(400, "Column title must be at most 80 characters");
  }
  const title =
    body && typeof body === "object"
      ? cleanString((body as Record<string, unknown>).title, 80)
      : null;
  if (!title) return jsonError(400, "Column title is required");

  const column = await prisma.$transaction(async (tx) => {
    const max = await tx.column.aggregate({
      where: { boardId: board.id },
      _max: { position: true },
    });
    return tx.column.create({
      data: { title, boardId: board.id, position: (max._max.position ?? -1) + 1 },
    });
  });

  return NextResponse.json({ column }, { status: 201 });
}
