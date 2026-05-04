import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

const FIELDS = [
  "background",
  "current_state",
  "personal_records",
  "goals_short_term",
  "goals_long_term",
  "injuries",
  "constraints",
  "diet_reality",
  "preferences",
  "lifestyle",
  "freeform",
] as const;

export async function GET(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("coach_knowledge")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details, hint: error.hint },
      { status: 500 }
    );
  }
  return NextResponse.json({ knowledge: data ?? null });
}

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const row: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
  for (const f of FIELDS) {
    const v = body[f];
    row[f] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("coach_knowledge")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) {
    console.error("[/api/knowledge] upsert failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details, hint: error.hint },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, knowledge: data });
}
