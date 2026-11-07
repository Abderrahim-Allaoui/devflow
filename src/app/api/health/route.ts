import { NextResponse } from "next/server";

/** Public health route — returns 200 so container healthchecks pass. */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
