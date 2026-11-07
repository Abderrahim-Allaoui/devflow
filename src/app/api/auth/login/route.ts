import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { clearRateLimit, clientIp, hitRateLimit } from "@/lib/rate-limit";
import { MAX_PASSWORD } from "@/lib/validation";

// Dummy hash so unknown emails cost the same bcrypt time as real ones.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4Dg0wG9pJ9ZyZkHlMhp7F4mYOc6e";

// S3 — 5 attempts per 15 min for an email and for an IP.
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

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
  if (pass.length > MAX_PASSWORD) {
    return jsonError(400, `Password must be at most ${MAX_PASSWORD} characters`);
  }

  // S3 — brute-force protection (per email, per IP, and per IP+email).
  // The IP+email key prevents an attacker from locking out all users of a
  // known email address (denial of service via per-email lockout).
  const ip = clientIp(req.headers);
  const emailKey = `login:email:${cleanEmail}`;
  const ipKey = `login:ip:${ip}`;
  const ipEmailKey = `login:ip+email:${ip}:${cleanEmail}`;
  const MAX_PER_EMAIL = 5;
  const MAX_PER_IP = 20;
  const MAX_PER_IP_EMAIL = 3;

  const emailOk = await hitRateLimit(emailKey, MAX_PER_EMAIL);
  const ipOk = await hitRateLimit(ipKey, MAX_PER_IP);
  const ipEmailOk = await hitRateLimit(ipEmailKey, MAX_PER_IP_EMAIL);
  if (!emailOk || !ipOk || !ipEmailOk) {
    return jsonError(429, "Too many attempts — try again in a few minutes");
  }

  const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
  // Same message for unknown email and wrong password (no user enumeration).
  const ok = await verifyPassword(pass, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    return jsonError(401, "Invalid email or password");
  }

  await clearRateLimit(emailKey, ipKey, ipEmailKey);
  await setSessionCookie({
    sub: user.id,
    email: user.email,
    name: user.name,
    tv: user.tokenVersion,
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
  });
}
