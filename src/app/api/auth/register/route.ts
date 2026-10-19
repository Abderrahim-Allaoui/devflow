import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { cleanString, jsonError } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { name, email, password } = body as Record<string, unknown>;
  const cleanName = cleanString(name, 80);
  const cleanEmail = cleanString(email, 120)?.toLowerCase();
  const pass = typeof password === "string" ? password : "";

  if (!cleanName || !cleanEmail || !EMAIL_RE.test(cleanEmail)) {
    return jsonError(400, "Name and a valid email are required");
  }
  if (pass.length < 8) {
    return jsonError(400, "Password must be at least 8 characters");
  }

  const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (existing) {
    return jsonError(409, "An account with this email already exists");
  }

  const user = await prisma.user.create({
    data: {
      name: cleanName,
      email: cleanEmail,
      passwordHash: await hashPassword(pass),
    },
  });

  await setSessionCookie({ sub: user.id, email: user.email, name: user.name });

  return NextResponse.json(
    { user: { id: user.id, name: user.name, email: user.email } },
    { status: 201 },
  );
}
