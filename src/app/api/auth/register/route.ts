import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { guardMutation, cleanString, jsonError } from "@/lib/api";
import { EMAIL_RE, MAX_PASSWORD, MIN_PASSWORD } from "@/lib/validation";
import { clientIp, hitRateLimit, ipLimitEnabled } from "@/lib/rate-limit";

// S3 — sign-up spam protection: 10 accounts per IP per 15 min.
const MAX_PER_IP = 10;

export async function POST(req: NextRequest) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
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
  if (pass.length < MIN_PASSWORD || pass.length > MAX_PASSWORD) {
    return jsonError(400, `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
  }

  // S3 — account-creation spam protection (per IP).
  const ipKey = `register:ip:${clientIp(req.headers)}`;
  if (ipLimitEnabled() && !(await hitRateLimit(ipKey, MAX_PER_IP))) {
    return jsonError(429, "Too many attempts — try again in a few minutes");
  }

  // Same generic message whether the email is taken or the input is invalid
  // (no user enumeration). The unique constraint on email also covers
  // concurrent sign-ups (P2002).
  const GENERIC = "Could not create account with these details";
  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        passwordHash: await hashPassword(pass),
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return jsonError(400, GENERIC);
    }
    throw err;
  }

  await setSessionCookie({
    sub: user.id,
    email: user.email,
    name: user.name,
    tv: user.tokenVersion,
  });

  return NextResponse.json(
    { user: { id: user.id, name: user.name, email: user.email } },
    { status: 201 },
  );
}
