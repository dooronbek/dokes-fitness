import type { PRExercise, PlanExercise, TrainingPlan } from "./types";

const exerciseSynonyms: Record<PRExercise, string[]> = {
  deadlift: [
    "deadlift",
    "conventional deadlift",
    "sumo deadlift",
    "romanian deadlift",
    "rdl",
    "dl",
  ],
  bench_press: ["bench press", "flat bench", "barbell bench"],
  barbell_squat: [
    "barbell squat",
    "back squat",
    "front squat",
    "low bar squat",
    "high bar squat",
  ],
  pullups: ["pull-up", "pullup", "pull up", "pullups", "chin-up", "chinup", "chin up"],
  pushups: ["push-up", "pushup", "push up", "pushups"],
  plank: ["plank", "front plank"],
  run_5k: [],
  run_1k: [],
};

function matchesExercise(exerciseName: string, key: PRExercise): boolean {
  const synonyms = exerciseSynonyms[key];
  if (!synonyms.length) return false;
  const lower = exerciseName.toLowerCase();
  return synonyms.some((s) => lower.includes(s));
}

function parseKgFromLoad(load: string | null | undefined): number | null {
  if (!load) return null;
  const match = load.match(/(\d+(?:\.\d+)?)\s*kg/i);
  return match ? parseFloat(match[1]) : null;
}

function parseRepsFromReps(reps: string | number | null | undefined): number | null {
  if (typeof reps === "number") return reps;
  if (!reps) return null;
  const rangeMatch = String(reps).match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) return parseInt(rangeMatch[2]);
  const singleMatch = String(reps).match(/(\d+)/);
  return singleMatch ? parseInt(singleMatch[1]) : null;
}

function parseSecondsFromReps(reps: string | number | null | undefined): number | null {
  if (typeof reps === "number") return null;
  if (!reps) return null;
  const secMatch = String(reps).match(/(\d+)\s*s(?:ec)?(?:onds?)?/i);
  if (secMatch) return parseInt(secMatch[1]);
  const minMatch = String(reps).match(/(\d+)\s*min/i);
  if (minMatch) return parseInt(minMatch[1]) * 60;
  return null;
}

export function epley1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export type PRProposal = {
  exercise: PRExercise;
  value_numeric: number;
  value_unit: "kg" | "reps" | "seconds";
  reps_at_pr: number | null;
  set_at: string;
  source_plan_date: string;
  beats_current: boolean;
  current_value: number | null;
  current_reps: number | null;
};

export type CurrentPRMap = Partial<
  Record<PRExercise, { value: number; reps: number | null } | null>
>;

export function detectPRsFromPlans(
  plans: TrainingPlan[],
  currentPRs: CurrentPRMap
): PRProposal[] {
  const proposals: PRProposal[] = [];

  // Weighted lifts: rank by Epley e1RM
  for (const key of ["deadlift", "bench_press", "barbell_squat"] as const) {
    let best: { weight: number; reps: number; date: string; e1rm: number } | null =
      null;
    for (const plan of plans) {
      if (!plan.main || !Array.isArray(plan.main)) continue;
      for (const ex of plan.main as PlanExercise[]) {
        if (!matchesExercise(ex.exercise, key)) continue;
        const weight = parseKgFromLoad(ex.load_guidance);
        const reps = parseRepsFromReps(ex.reps);
        if (weight === null || reps === null || reps < 1) continue;
        const e1rm = epley1RM(weight, reps);
        if (!best || e1rm > best.e1rm) {
          best = { weight, reps, date: plan.plan_date, e1rm };
        }
      }
    }
    if (best) {
      const current = currentPRs[key] ?? null;
      const currentE1rm =
        current && current.reps != null
          ? epley1RM(current.value, current.reps)
          : current?.value ?? null;
      const beats = currentE1rm === null || best.e1rm > currentE1rm;
      proposals.push({
        exercise: key,
        value_numeric: best.weight,
        value_unit: "kg",
        reps_at_pr: best.reps,
        set_at: best.date,
        source_plan_date: best.date,
        beats_current: beats,
        current_value: current?.value ?? null,
        current_reps: current?.reps ?? null,
      });
    }
  }

  // Pull-ups, push-ups: max reps
  for (const key of ["pullups", "pushups"] as const) {
    let best: { reps: number; date: string } | null = null;
    for (const plan of plans) {
      if (!plan.main || !Array.isArray(plan.main)) continue;
      for (const ex of plan.main as PlanExercise[]) {
        if (!matchesExercise(ex.exercise, key)) continue;
        const reps = parseRepsFromReps(ex.reps);
        if (reps === null) continue;
        if (!best || reps > best.reps) {
          best = { reps, date: plan.plan_date };
        }
      }
    }
    if (best) {
      const current = currentPRs[key] ?? null;
      const beats = !current || best.reps > current.value;
      proposals.push({
        exercise: key,
        value_numeric: best.reps,
        value_unit: "reps",
        reps_at_pr: null,
        set_at: best.date,
        source_plan_date: best.date,
        beats_current: beats,
        current_value: current?.value ?? null,
        current_reps: null,
      });
    }
  }

  // Plank: max seconds
  {
    let best: { seconds: number; date: string } | null = null;
    for (const plan of plans) {
      if (!plan.main || !Array.isArray(plan.main)) continue;
      for (const ex of plan.main as PlanExercise[]) {
        if (!matchesExercise(ex.exercise, "plank")) continue;
        const seconds = parseSecondsFromReps(ex.reps);
        if (seconds === null) continue;
        if (!best || seconds > best.seconds) {
          best = { seconds, date: plan.plan_date };
        }
      }
    }
    if (best) {
      const current = currentPRs["plank"] ?? null;
      const beats = !current || best.seconds > current.value;
      proposals.push({
        exercise: "plank",
        value_numeric: best.seconds,
        value_unit: "seconds",
        reps_at_pr: null,
        set_at: best.date,
        source_plan_date: best.date,
        beats_current: beats,
        current_value: current?.value ?? null,
        current_reps: null,
      });
    }
  }

  return proposals.filter((p) => p.beats_current);
}
