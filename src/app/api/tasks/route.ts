import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cleanString, jsonError } from "@/lib/api";
import { getOwnedColumn } from "@/lib/ownership";

const PRIORITIES = ["low", "medium", "high"];

export async function POST(req: NextRequest) {
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

  const cleanTitle = cleanString(title, 160);
  const cleanDescription = cleanString(description, 2000);
  const cleanPriority =
    typeof priority === "string" && PRIORITIES.includes(priority)
      ? priority
      : "medium";

  if (typeof columnId !== "string" || !cleanTitle) {
    return jsonError(400, "columnId and title are required");
  }

  const column = await getOwnedColumn(columnId, user.id);
  if (!column) return jsonError(404, "Column not found");

  const count = await prisma.task.count({ where: { columnId: column.id } });

  const task = await prisma.task.create({
    data: {
      title: cleanTitle,
      description: cleanDescription,
      priority: cleanPriority,
      columnId: column.id,
      position: count,
    },
  });

  return NextResponse.json({ task }, { status: 201 });
}
