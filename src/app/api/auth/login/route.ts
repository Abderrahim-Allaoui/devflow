import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  if (body === null || typeof body !== "object") {
    return jsonError(400, "Invalid payload");
  }

  const { email, password } = body as Record<string, unknown>;
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const pass = typeof password === "string" ? password : "";

  if (!cleanEmail || !pass) {
    return jsonError(400, "Email and password are required");
  }

  const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
  // Same message for unknown email and wrong password (no user enumeration).
  if (!user || !(await verifyPassword(pass, user.passwordHash))) {
    return jsonError(401, "Invalid email or password");
  }

  await setSessionCookie({ sub: user.id, email: user.email, name: user.name });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
  });
}
