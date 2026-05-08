import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { PR_EXERCISES, type PRExercise, type PersonalRecord } from "@/lib/types";

export const runtime = "nodejs";

const ALLOWED_UNITS = ["kg", "reps", "seconds", "minutes"] as const;
type Unit = (typeof ALLOWED_UNITS)[number];

function isPRExercise(s: string): s is PRExercise {
  return (PR_EXERCISES as readonly string[]).includes(s);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ exercise: string }> }
) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { exercise } = await params;
  if (!isPRExercise(exercise)) {
    return NextResponse.json({ error: "unknown exercise" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    value_numeric?: number | string;
    value_unit?: string;
    reps_at_pr?: number | null;
    set_at?: string;
    notes?: string | null;
    source?: string;
  };

  const value = Number(body.value_numeric);
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: "value_numeric must be positive" }, { status: 400 });
  }
  if (!body.value_unit || !(ALLOWED_UNITS as readonly string[]).includes(body.value_unit)) {
    return NextResponse.json(
      { error: `value_unit must be one of ${ALLOWED_UNITS.join("|")}` },
      { status: 400 }
    );
  }
  const unit = body.value_unit as Unit;

  if (!body.set_at || !/^\d{4}-\d{2}-\d{2}$/.test(body.set_at)) {
    return NextResponse.json({ error: "set_at must be YYYY-MM-DD" }, { status: 400 });
  }

  let reps: number | null = null;
  if (body.reps_at_pr != null) {
    const n = Number(body.reps_at_pr);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        { error: "reps_at_pr must be a non-negative integer" },
        { status: 400 }
      );
    }
    reps = n;
  }

  const source = body.source === "auto" ? "auto" : "manual";
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const row = {
    exercise,
    value_numeric: value,
    value_unit: unit,
    reps_at_pr: reps,
    set_at: body.set_at,
    notes,
    source,
    updated_at: new Date().toISOString(),
  };

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("personal_records")
    .upsert(row, { onConflict: "exercise" })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ pr: data as PersonalRecord });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ exercise: string }> }
) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { exercise } = await params;
  if (!isPRExercise(exercise)) {
    return NextResponse.json({ error: "unknown exercise" }, { status: 400 });
  }
  const sb = supabaseServer();
  const { error } = await sb.from("personal_records").delete().eq("exercise", exercise);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
