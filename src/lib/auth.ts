import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "devflow_token";

/** Dev/test-only fallback. NEVER valid outside development/test (see guard below). */
const DEV_FALLBACK_SECRET = "dev-only-secret-change-me";
const RAW_SECRET = process.env.JWT_SECRET;

// S1 — fail fast in production when the secret is missing, too short, or a
// known placeholder (e.g. the example shipped in .env.example). A JWT signed
// with a public secret is forgeable by anyone.
const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";
const KNOWN_WEAK = new Set([
  "change-me-to-a-long-random-string",
  "dev-only-secret-change-me",
  "ci-only-secret-not-used-in-production",
]);
const IS_DEV = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
if (
  !IS_BUILD_PHASE &&
  (process.env.NODE_ENV === "production" || !IS_DEV) &&
  (!RAW_SECRET || RAW_SECRET.length < 32 || KNOWN_WEAK.has(RAW_SECRET) || /change-?me/i.test(RAW_SECRET))
) {
  throw new Error(
    "JWT_SECRET must be set to a random string of at least 32 characters outside development/test. " +
      "Generate one with: openssl rand -hex 32",
  );
}

export const JWT_SECRET =
  RAW_SECRET ??
  (IS_DEV ? DEV_FALLBACK_SECRET : "build-placeholder-do-not-use");

/** Startup notice: IP-rate-limit needs TRUST_PROXY=true behind a proxy. */
if (process.env.NODE_ENV === "production" && process.env.TRUST_PROXY !== "true") {
  console.warn(
    "[devflow] WARNING: TRUST_PROXY is not 'true'. Per-IP rate limits are disabled; " +
      "leave this unset only if users do not share a proxy bucket, and see docs/SETUP.md.",
  );
}

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
