import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    // S4 — invalidate every outstanding JWT for this user (stateless logout).
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
