import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cleanString, jsonError } from "@/lib/api";
import { getOwnedBoard } from "@/lib/ownership";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const { id } = await params;
  const board = await getOwnedBoard(id, user.id);
  if (!board) return jsonError(404, "Board not found");

  return NextResponse.json({ board });
}

export async function PATCH(req: NextRequest, { params }: Params) {
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

  const title =
    body && typeof body === "object"
      ? cleanString((body as Record<string, unknown>).title, 120)
      : null;
  if (!title) return jsonError(400, "Board title is required");

  const updated = await prisma.board.update({
    where: { id: board.id },
    data: { title },
    include: {
      columns: { orderBy: { position: "asc" }, include: { tasks: { orderBy: { position: "asc" } } } },
    },
  });

  return NextResponse.json({ board: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const { id } = await params;
  const board = await getOwnedBoard(id, user.id);
  if (!board) return jsonError(404, "Board not found");

  await prisma.board.delete({ where: { id: board.id } });
  return NextResponse.json({ ok: true });
}
