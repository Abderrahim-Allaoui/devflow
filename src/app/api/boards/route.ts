import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { guardMutation, cleanString, jsonError } from "@/lib/api";

const DEFAULT_COLUMNS = ["Backlog", "In progress", "Done"];

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");

  // B7 — paginate the board list (cursor-based). Default page size 20.
  // Deterministic order (createdAt + id tie-breaker) so the cursor can never
  // skip or duplicate rows that share a millisecond timestamp.
  const { searchParams } = new URL(req.url);
  const cursorParam = searchParams.get("cursor");
  const take = 20;
  let cursorWhere: unknown = undefined;
  if (cursorParam) {
    try {
      const c = JSON.parse(Buffer.from(cursorParam, "base64url").toString("utf8"));
      const date = new Date(c?.c);
      if (typeof c?.i !== "string" || Number.isNaN(date.getTime())) {
        return jsonError(400, "Invalid cursor");
      }
      cursorWhere = {
        OR: [
          { createdAt: { lt: date } },
          { createdAt: date, id: { lt: c.i } },
        ],
      };
    } catch {
      return jsonError(400, "Invalid cursor");
    }
  }
  const boardsRaw = await prisma.board.findMany({
    where: { ownerId: user.id, ...(cursorWhere as Record<string, unknown>) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: {
          tasks: { orderBy: { position: "asc" }, take: 50 },
          _count: { select: { tasks: true } },
        },
      },
    },
  });

  const boards = boardsRaw.map(({ columns, ...board }) => ({
    ...board,
    columns: (columns ?? []).map(({ _count, tasks, ...column }) => ({
      ...column,
      tasks,
      taskCount: _count?.tasks ?? tasks?.length ?? 0,
    })),
  }));

  const hasMore = boards.length > take;
  const page = boards.slice(0, take);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ c: last.createdAt, i: last.id })).toString("base64url")
    : null;

  return NextResponse.json({ boards: page, nextCursor });
}

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

  if (typeof (body as Record<string, unknown>)?.title === "string" &&
      ((body as Record<string, unknown>).title as string).trim().length > 120) {
    return jsonError(400, "Board title must be at most 120 characters");
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
