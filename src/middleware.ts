import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "devflow_token";

export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const { pathname } = req.nextUrl;

  if (!token && (pathname === "/board" || pathname.startsWith("/board/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/board/:path*", "/board"],
};
