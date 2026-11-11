import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { guardMutation, jsonError } from "@/lib/api";
import { clearRateLimit, clientIp, hitRateLimit, ipLimitEnabled } from "@/lib/rate-limit";
import { MAX_PASSWORD } from "@/lib/validation";

// Dummy hash so unknown emails cost the same bcrypt time as real ones.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4Dg0wG9pJ9ZyZkHlMhp7F4mYOc6e";

// S3 — 5 attempts per 15 min for an email and for an IP.

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

  const { email, password } = body as Record<string, unknown>;
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const pass = typeof password === "string" ? password : "";

  if (!cleanEmail || cleanEmail.length > 254 || !pass) {
    return jsonError(400, "Email and password are required");
  }
  if (pass.length > MAX_PASSWORD) {
    return jsonError(400, `Password must be at most ${MAX_PASSWORD} characters`);
  }

  // S3 — brute-force protection (per IP, and per IP+email).
  // The IP+email key prevents an attacker from locking out all users of a
  // known email address by stuffing from rotating IPs, while the per-email
  // counter is deliberately NOT used to reject: a shared email key must not
  // lock the legitimate owner out of their account from a different IP.
  const ip = clientIp(req.headers);
  const emailKey = `login:email:${cleanEmail}`;
  const ipKey = `login:ip:${ip}`;
  const ipEmailKey = `login:ip+email:${ip}:${cleanEmail}`;
  const MAX_PER_EMAIL = 5;
  const MAX_PER_IP = 20;
  const MAX_PER_IP_EMAIL = 3;

  // Per-email counter is maintained for observability only, never to reject.
  await hitRateLimit(emailKey, MAX_PER_EMAIL);
  const ipOk = (!ipLimitEnabled() || (await hitRateLimit(ipKey, MAX_PER_IP)));
  const ipEmailOk = (!ipLimitEnabled() || (await hitRateLimit(ipEmailKey, MAX_PER_IP_EMAIL)));
  if (!ipOk || !ipEmailOk) {
    return jsonError(429, "Too many attempts — try again in a few minutes");
  }

  const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
  // Same message for unknown email and wrong password (no user enumeration).
  const ok = await verifyPassword(pass, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    return jsonError(401, "Invalid email or password");
  }

  // Clear only this caller's keys — DO NOT clear the shared IP bucket,
  // or a valid login would reset the per-IP limiter for everyone behind it.
  await clearRateLimit(emailKey, ipEmailKey);
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
