import { NextResponse, type NextRequest } from "next/server";

// Cheap first gate for responder pages: no session cookie → sign-in page.
// The session itself is verified on the server in every page and route handler.

const SESSION_COOKIE = "av_session";

export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/reports/:path*",
    "/incidents/:path*",
    "/alerts/:path*",
    "/evaluation/:path*",
    "/timeline/:path*",
    "/activity/:path*",
    "/settings/:path*",
    "/data/:path*",
  ],
};
