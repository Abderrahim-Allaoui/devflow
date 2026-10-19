import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Not authenticated");
  return NextResponse.json({ user });
}
