import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const COOKIE_NAME = "dokes_auth";
const ONE_YEAR = 60 * 60 * 24 * 365;

function expectedToken(): string {
  const pwd = process.env.APP_PASSWORD;
  if (!pwd) throw new Error("Missing APP_PASSWORD");
  // The cookie value is the password itself; httpOnly + middleware-checked,
  // single-user app. No need for hashing/sessions.
  return pwd;
}

export function checkPassword(input: string): boolean {
  const pwd = process.env.APP_PASSWORD;
  if (!pwd) return false;
  return input === pwd;
}

export function buildAuthCookie() {
  return {
    name: COOKIE_NAME,
    value: expectedToken(),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  };
}

export function clearAuthCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  };
}

export function isAuthedFromRequest(req: NextRequest): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const got = req.cookies.get(COOKIE_NAME)?.value;
  return !!got && got === expected;
}

export async function isAuthedServer(): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const jar = await cookies();
  const got = jar.get(COOKIE_NAME)?.value;
  return !!got && got === expected;
}

export function loginRedirect(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
