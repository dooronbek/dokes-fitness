import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & {
    log_date?: string;
  };
  if (!body.log_date) {
    return NextResponse.json({ error: "log_date required" }, { status: 400 });
  }
  const sb = supabaseServer();
  const { error } = await sb
    .from("daily_log")
    .upsert(
      {
        log_date: body.log_date,
        weight_kg: body.weight_kg ?? null,
        waist_cm: body.waist_cm ?? null,
        sleep_hours: body.sleep_hours ?? null,
        sleep_quality: body.sleep_quality ?? null,
        mood: body.mood ?? null,
        energy: body.energy ?? null,
        soreness_notes: body.soreness_notes ?? null,
        notes: body.notes ?? null,
      },
      { onConflict: "log_date" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
