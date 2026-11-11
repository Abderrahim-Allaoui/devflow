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
 * The deployment proxy is assumed to APPEND its observed peer to
 * X-Forwarded-For (the common `proxy_add_x_forwarded_for` behaviour), so the
 * LAST entry is the one the proxy added — the first entry is entirely
 * client-controlled and must not be trusted for bucketing. Vercel sets a
 * single-entry header, so last === first there either way.
 */
export function clientIp(headers: Headers): string {
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    const fwd = headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",").pop()!.trim();
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
 * The counter is bumped with a single conditional UPDATE (fast path) and the
 * window is opened with a single upsert — two concurrent requests cannot both
 * pass at (max - 1) anymore. Fails closed on DB error.
 */
export async function hitRateLimit(key: string, max: number): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  // Cap stored key size — attackers control this string.
  const safeKey = key.length > 256 ? key.slice(0, 256) : key;
  try {
    // 1. Fresh window with headroom — atomic bump.
    const bumpFresh = () =>
      prisma.loginAttempt.updateMany({
        where: { key: safeKey, windowStart: { gt: cutoff }, count: { lt: max } },
        data: { count: { increment: 1 } },
      });
    if ((await bumpFresh()).count === 1) return true;

    // 2. No usable fresh window: try to open one. Create if absent; one caller
    //    wins. If the row exists but is stale, reset it — one caller wins.
    try {
      await prisma.loginAttempt.create({
        data: { key: safeKey, count: 1, windowStart: now },
      });
      return true;
    } catch {
      const reset = await prisma.loginAttempt.updateMany({
        where: { key: safeKey, windowStart: { lte: cutoff } },
        data: { count: 1, windowStart: now },
      });
      if (reset.count === 1) return true;
    }

    // 3. Someone else opened/reset the window meanwhile — retry the bump once.
    if ((await bumpFresh()).count === 1) return true;

    // Fresh window already at/over the limit (or another thread filled it).
    return false;
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
    // Opportunistic sweep of expired windows so the table does not grow
    // unboundedly. Best-effort piggybacked on a rare write path.
    const cutoff = new Date(Date.now() - WINDOW_MS);
    await prisma.loginAttempt.deleteMany({
      where: { windowStart: { lt: cutoff } },
    });
  } catch {
    /* best effort */
  }
}

/**
 * IP-based limits are only meaningful behind a proxy that overwrites the
 * client IP header. Without TRUST_PROXY=true every request would share one
 * "local" bucket, so one attacker could lock out all users. Callers skip the
 * IP buckets when this returns false.
 */
export function ipLimitEnabled(): boolean {
  return process.env.TRUST_PROXY === "true";
}
