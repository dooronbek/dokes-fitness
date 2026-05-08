import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

export const runtime = "nodejs";

const STRING_FIELDS = [
  "name",
  "primary_goal_short",
  "primary_goal_long",
  "athletic_background",
  "current_state",
  "lifestyle",
  "equipment_constraints_general",
  "preferences_psychology",
  "diet_pattern",
  "injuries_active",
  "injuries_history",
  "other_conditions",
] as const;

const NUMBER_FIELDS = [
  "age",
  "height_cm",
  "preferred_training_days_per_week",
  "preferred_session_minutes",
] as const;

export async function GET(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("user_profile")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details, hint: error.hint },
      { status: 500 }
    );
  }
  return NextResponse.json({ profile: (data ?? null) as UserProfile | null });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };

  for (const f of STRING_FIELDS) {
    if (f in body) {
      const v = body[f];
      patch[f] = typeof v === "string" && v.trim() ? v.trim() : null;
    }
  }
  for (const f of NUMBER_FIELDS) {
    if (f in body) {
      const v = body[f];
      if (v === null || v === "" || v === undefined) {
        patch[f] = null;
      } else {
        const n = Number(v);
        patch[f] = Number.isFinite(n) ? Math.round(n) : null;
      }
    }
  }
  if ("sex" in body) {
    const v = body.sex;
    if (v === "male" || v === "female" || v === "other") {
      patch.sex = v;
    } else if (v === null || v === "" || v === undefined) {
      patch.sex = null;
    } else {
      return NextResponse.json(
        { error: "sex must be one of male|female|other" },
        { status: 400 }
      );
    }
  }

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("user_profile")
    .upsert(patch, { onConflict: "id" })
    .select()
    .single();
  if (error) {
    console.error("[/api/profile] upsert failed:", {
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
  return NextResponse.json({ profile: data as UserProfile });
}
