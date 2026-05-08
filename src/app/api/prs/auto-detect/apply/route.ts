import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { detectPRsFromPlans, type CurrentPRMap } from "@/lib/pr-detect";
import {
  PR_EXERCISES,
  type PersonalRecord,
  type PRExercise,
  type TrainingPlan,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { approved?: string[] };
  const approvedRaw = Array.isArray(body.approved) ? body.approved : [];
  const approved = approvedRaw.filter((e): e is PRExercise =>
    (PR_EXERCISES as readonly string[]).includes(e)
  );
  if (approved.length === 0) {
    return NextResponse.json({ error: "approved must be a non-empty array" }, { status: 400 });
  }

  const sb = supabaseServer();

  const [plansRes, prsRes] = await Promise.all([
    sb
      .from("training_plans")
      .select("*")
      .eq("completed", true)
      .order("plan_date", { ascending: false }),
    sb.from("personal_records").select("*"),
  ]);

  if (plansRes.error) {
    return NextResponse.json({ error: plansRes.error.message }, { status: 500 });
  }
  if (prsRes.error) {
    return NextResponse.json({ error: prsRes.error.message }, { status: 500 });
  }

  const plans = (plansRes.data ?? []) as TrainingPlan[];
  const currentPRs: CurrentPRMap = {};
  for (const pr of (prsRes.data ?? []) as PersonalRecord[]) {
    currentPRs[pr.exercise as PRExercise] = {
      value: Number(pr.value_numeric),
      reps: pr.reps_at_pr,
    };
  }

  const proposals = detectPRsFromPlans(plans, currentPRs);
  const toApply = proposals.filter((p) => approved.includes(p.exercise));

  const now = new Date().toISOString();
  const rows = toApply.map((p) => ({
    exercise: p.exercise,
    value_numeric: p.value_numeric,
    value_unit: p.value_unit,
    reps_at_pr: p.reps_at_pr,
    set_at: p.set_at,
    source: "auto" as const,
    notes: `Auto-detected from plan ${p.source_plan_date}`,
    updated_at: now,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ applied: [] });
  }

  const { data, error } = await sb
    .from("personal_records")
    .upsert(rows, { onConflict: "exercise" })
    .select();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ applied: data as PersonalRecord[] });
}
