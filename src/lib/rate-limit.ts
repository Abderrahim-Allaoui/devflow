import { prisma } from "./prisma";

/**
 * Fixed-window rate limiter backed by the LoginAttempt table (S3).
 *
 * Keys are namespaced by the caller, e.g. `login:email:<addr>` or
 * `register:ip:<ip>`. Counters reset when the window expires or when the
 * caller clears them after a success.
 *
 * A table (rather than process memory) keeps the limit effective across
 * serverless instances — on Vercel every instance would otherwise keep
 * its own counter.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Client IP behind a proxy / Vercel edge.
 *
 * S3 — IP spoofing: X-Forwarded-For is only trusted when TRUST_PROXY is set
 * (meaning the app sits behind a known reverse proxy that overwrites the
 * header). Without it, an attacker could send a different X-Forwarded-For
 * on each request and bypass the per-IP limit.
 */
export function clientIp(headers: Headers): string {
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    const fwd = headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return headers.get("x-real-ip") || "local";
  }
  // No trusted proxy: we cannot safely derive the client IP from headers.
  return "local";
}

/**
 * Counts one attempt against `key`.
 * Returns false when the key has already used up `max` attempts in the
 * current window (i.e. the caller must be rejected).
 *
 * S3 — fail-closed: a database error rejects the request instead of
 * silently disabling rate limiting.
 */
export async function hitRateLimit(key: string, max: number): Promise<boolean> {
  const now = new Date();
  try {
    const row = await prisma.loginAttempt.findUnique({ where: { key } });
    if (!row || now.getTime() - row.windowStart.getTime() > WINDOW_MS) {
      await prisma.loginAttempt.upsert({
        where: { key },
        update: { count: 1, windowStart: now },
        create: { key, count: 1, windowStart: now },
      });
      return true;
    }
    if (row.count >= max) return false;
    await prisma.loginAttempt.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return true;
  } catch {
    // Fail-closed: on DB error, reject the request rather than disabling the
    // limiter silently. This is a deliberate trade-off (availability vs.
    // security) chosen to protect against credential stuffing.
    return false;
  }
}

/** Drops the counters for `key` (called after a successful login). */
export async function clearRateLimit(...keys: string[]): Promise<void> {
  try {
    await prisma.loginAttempt.deleteMany({ where: { key: { in: keys } } });
  } catch {
    /* best effort */
  }
}
