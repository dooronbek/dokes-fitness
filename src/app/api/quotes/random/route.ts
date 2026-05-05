import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseServer();
  // Pick a random row. order=random() isn't supported via PostgREST, so pull
  // an ID range and sample. For our small (~tens to hundreds) table this is
  // cheap and avoids loading the full text column for every call.
  const { count, error: countErr } = await sb
    .from("quotes")
    .select("*", { count: "exact", head: true });

  if (countErr || !count || count === 0) {
    return NextResponse.json({ text: null, author: null });
  }

  const offset = Math.floor(Math.random() * count);
  const { data, error } = await sb
    .from("quotes")
    .select("text, author")
    .order("id", { ascending: true })
    .range(offset, offset);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ text: null, author: null });
  }

  return NextResponse.json({
    text: data[0].text,
    author: data[0].author,
  });
}
