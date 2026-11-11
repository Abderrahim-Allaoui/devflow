import { NextRequest, NextResponse } from "next/server";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Simple non-empty string check with a max length guard. */
export function cleanString(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

const MAX_BODY_BYTES = 64 * 1024; // a kanban payload is never bigger

/**
 * Guard for mutating JSON routes: body-size cap, JSON content-type,
 * and same-origin Origin enforcement (CSRF defence in depth — SameSite=lax
 * already blocks cross-site POST cookies, this catches the rest).
 * Returns null when the request is fine, else a ready-to-return response.
 */
export function guardMutation(req: NextRequest): NextResponse | null {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    return jsonError(413, "Request body too large");
  }
  // Content-Type is only enforced when a body is actually being sent.
  const hasBody = Number.isFinite(len) && len > 0;
  const ct = req.headers.get("content-type") ?? "";
  if (hasBody && !ct.includes("application/json")) {
    return jsonError(415, "Content-Type must be application/json");
  }
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const o = new URL(origin);
      const host = req.headers.get("host");
      if (host && o.host !== host) {
        return jsonError(403, "Cross-origin request not allowed");
      }
    } catch {
      return jsonError(400, "Invalid Origin header");
    }
  }
  return null;
}
