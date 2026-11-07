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

/** Client IP behind a proxy / Vercel edge. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") || "local";
}

/**
 * Counts one attempt against `key`.
 * Returns false when the key has already used up `max` attempts in the
 * current window (i.e. the caller must be rejected).
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
    // Limiter errors must not lock everyone out — fail open.
    return true;
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
