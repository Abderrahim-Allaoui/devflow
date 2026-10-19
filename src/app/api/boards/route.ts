import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cleanString, jsonError } from "@/lib/api";

const DEFAULT_COLUMNS = ["Backlog", "In progress", "Done"];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  const boards = await prisma.board.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: { tasks: { orderBy: { position: "asc" } } },
      },
    },
  });

  return NextResponse.json({ boards });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

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

  const board = await prisma.board.create({
    data: {
      title,
      ownerId: user.id,
      columns: {
        create: DEFAULT_COLUMNS.map((t, i) => ({ title: t, position: i })),
      },
    },
    include: {
      columns: { orderBy: { position: "asc" }, include: { tasks: true } },
    },
  });

  return NextResponse.json({ board }, { status: 201 });
}
