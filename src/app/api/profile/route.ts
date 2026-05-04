import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & {
    finish?: boolean;
  };
  const sb = supabaseServer();

  const row: Record<string, unknown> = {
    id: 1,
    goals: body.goals ?? null,
    height_cm: body.height_cm ?? null,
    age: body.age ?? null,
    sex: body.sex ?? null,
    activity_level: body.activity_level ?? null,
    dietary_preferences: body.dietary_preferences ?? null,
    injuries_notes: body.injuries_notes ?? null,
    coaching_style: body.coaching_style ?? null,
  };
  if (body.finish) row.onboarded_at = new Date().toISOString();

  const { data, error } = await sb
    .from("profile")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) {
    console.error("[/api/profile] upsert failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      row,
    });
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details, hint: error.hint },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, profile: data });
}
