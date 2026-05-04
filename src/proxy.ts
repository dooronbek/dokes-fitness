import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";

const PUBLIC_PATHS = new Set<string>(["/login"]);
const PUBLIC_API = new Set<string>(["/api/login"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_API.has(pathname)) {
    return NextResponse.next();
  }

  if (isAuthedFromRequest(req)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Run on every request except Next assets and obvious public files.
    "/((?!_next/|favicon.ico|manifest.json|icons/|apple-touch-icon.*|robots.txt|sitemap.xml).*)",
  ],
};
