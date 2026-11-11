import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "devflow_token";

/** Dev-only fallback. NEVER valid in production (see the guard below). */
const DEV_FALLBACK_SECRET = "dev-only-secret-change-me";
const RAW_SECRET = process.env.JWT_SECRET;

// S1 — fail fast in production when the secret is missing or too short.
// Skipped while `next build` is collecting pages (no runtime secrets there);
// the same check runs on the first runtime import, so a misconfigured
// production deployment crashes loudly instead of signing forgeable JWTs.
const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";
if (
  process.env.NODE_ENV === "production" &&
  !IS_BUILD_PHASE &&
  (!RAW_SECRET || RAW_SECRET.length < 32)
) {
  throw new Error(
    "JWT_SECRET must be set to a random string of at least 32 characters in production. " +
      "Generate one with: openssl rand -hex 32",
  );
}

export const JWT_SECRET = RAW_SECRET || DEV_FALLBACK_SECRET;

/**
 * Secure flag for the session cookie.
 * Defaults to true in production (HTTPS); set COOKIE_SECURE=false for
 * local `npm start` over plain http://localhost.
 */
export const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === "true"
  : process.env.NODE_ENV === "production";

export type TokenPayload = {
  sub: string;
  email: string;
  name: string;
  /** User.tokenVersion at sign time — must still match at verify time (S4). */
  tv: number;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d", algorithm: "HS256" });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    // S6 — pin the algorithm (defence in depth against `none`/RS256 confusion).
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as TokenPayload;
    if (typeof payload.tv !== "number") return null; // legacy/forged token
    return payload;
  } catch {
    return null;
  }
}

/** Reads the session cookie and returns the authenticated user (or null). */
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, tokenVersion: true },
  });
  // S4 — revoked token (logout bumped tokenVersion after this JWT was issued).
  if (!user || user.tokenVersion !== payload.tv) return null;

  return { id: user.id, email: user.email, name: user.name };
}

export async function setSessionCookie(payload: TokenPayload) {
  const store = await cookies();
  store.set(SESSION_COOKIE, signToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: 0,
  });
}
