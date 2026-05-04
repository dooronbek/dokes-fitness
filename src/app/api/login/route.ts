import { NextRequest, NextResponse } from "next/server";
import { buildAuthCookie, checkPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!checkPassword(body.password ?? "")) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  const c = buildAuthCookie();
  res.cookies.set(c);
  return res;
}
