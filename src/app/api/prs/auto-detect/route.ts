import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { detectPRsFromPlans, type CurrentPRMap } from "@/lib/pr-detect";
import type { PersonalRecord, PRExercise, TrainingPlan } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  return NextResponse.json({ proposals });
}
