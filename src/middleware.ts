import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/setup", "/invite", "/reset-password", "/forgot-password", "/api/health", "/manifest.webmanifest", "/icon.svg", "/apple-icon", "/sw.js"];

/** Fast redirect for anonymous visitors. Real authorization happens on the server per request. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get("rayed_sid")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
