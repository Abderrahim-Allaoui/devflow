import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Public health route — 200 so container healthchecks pass.
 * `GET /api/health?deep=1` additionally pings the database and returns
 * 503 when it is unreachable.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("deep") === "1") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return NextResponse.json({ status: "ok", db: "up" }, { status: 200 });
    } catch {
      return NextResponse.json(
        { status: "degraded", db: "down" },
        { status: 503 },
      );
    }
  }
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
