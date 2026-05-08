import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DossierStats,
  DossierStatsLongterm,
  DossierStatsMidterm,
} from "./types";
import { daysAgoISO } from "./dates";

type CategoryCounts = {
  strength: number;
  cardio: number;
  mobility: number;
  mixed: number;
  rest: number;
};

type PlanRow = {
  plan_date: string;
  focus: string | null;
  total_minutes: number | null;
  completed: boolean | null;
  avg_hr: number | null;
};

type LogRow = {
  log_date: string;
  sleep_quality: number | null;
  energy: number | null;
  weight_kg: number | null;
  waist_cm: number | null;
};

type ActivityRow = {
  resting_hr: number | null;
};

function inferCategory(focus: string | null): keyof CategoryCounts {
  if (!focus) return "mixed";
  const f = focus.toLowerCase();
  if (f.includes("rest")) return "rest";
  if (f.includes("mobility") || f.includes("stretch") || f.includes("recovery"))
    return "mobility";
  if (
    f.includes("strength") ||
    f.includes("lift") ||
    f.includes("press") ||
    f.includes("squat") ||
    f.includes("deadlift")
  )
    return "strength";
  if (
    f.includes("cardio") ||
    f.includes("run") ||
    f.includes("zone") ||
    f.includes("cycle") ||
    f.includes("row") ||
    f.includes("bike")
  )
    return "cardio";
  return "mixed";
}

function avgOrNull(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function countByCategory(plans: PlanRow[]): CategoryCounts {
  const counts: CategoryCounts = {
    strength: 0,
    cardio: 0,
    mobility: 0,
    mixed: 0,
    rest: 0,
  };
  for (const p of plans) counts[inferCategory(p.focus)]++;
  return counts;
}

function computeMidterm(
  plans: PlanRow[],
  logs: LogRow[],
  activity: ActivityRow[]
): DossierStatsMidterm {
  const completed = plans.filter((p) => p.completed);
  const generated = plans.length;
  const byType = countByCategory(completed);

  const sleepQualities = logs
    .filter((l) => l.sleep_quality != null)
    .map((l) => l.sleep_quality as number);
  const energies = logs
    .filter((l) => l.energy != null)
    .map((l) => l.energy as number);
  const restingHRs = activity
    .filter((a) => a.resting_hr != null)
    .map((a) => a.resting_hr as number);

  const strengthHRs = completed
    .filter((p) => inferCategory(p.focus) === "strength" && p.avg_hr != null)
    .map((p) => p.avg_hr as number);
  const cardioHRs = completed
    .filter((p) => inferCategory(p.focus) === "cardio" && p.avg_hr != null)
    .map((p) => p.avg_hr as number);
  const sessionMinutes = completed
    .filter((p) => p.total_minutes != null)
    .map((p) => p.total_minutes as number);

  const weightLogs = logs
    .filter((l) => l.weight_kg != null)
    .sort((a, b) => a.log_date.localeCompare(b.log_date));
  const weightDelta =
    weightLogs.length >= 2
      ? (weightLogs[weightLogs.length - 1].weight_kg as number) -
        (weightLogs[0].weight_kg as number)
      : null;

  const waistLogs = logs
    .filter((l) => l.waist_cm != null)
    .sort((a, b) => a.log_date.localeCompare(b.log_date));
  const waistDelta =
    waistLogs.length >= 2
      ? (waistLogs[waistLogs.length - 1].waist_cm as number) -
        (waistLogs[0].waist_cm as number)
      : null;

  return {
    workouts_total: completed.length,
    workouts_by_type: byType,
    adherence_completed: completed.length,
    adherence_generated: generated,
    avg_session_minutes: avgOrNull(sessionMinutes),
    avg_hr_by_type: {
      strength: avgOrNull(strengthHRs),
      cardio: avgOrNull(cardioHRs),
    },
    avg_sleep_quality: avgOrNull(sleepQualities),
    avg_energy: avgOrNull(energies),
    avg_resting_hr: avgOrNull(restingHRs),
    weight_delta_kg: weightDelta,
    waist_delta_cm: waistDelta,
  };
}

function computeLongterm(
  plans: PlanRow[],
  logs: LogRow[],
  activity: ActivityRow[]
): DossierStatsLongterm {
  const completed = plans.filter((p) => p.completed);
  const generated = plans.length;
  const byType = countByCategory(completed);

  const sleepQualities = logs
    .filter((l) => l.sleep_quality != null)
    .map((l) => l.sleep_quality as number);
  const restingHRs = activity
    .filter((a) => a.resting_hr != null)
    .map((a) => a.resting_hr as number);

  // Longest streak from completed plan dates
  const sortedDates = completed.map((p) => p.plan_date).sort();
  let longestStreak = 0;
  let currentStreak = 0;
  let prevDate: Date | null = null;
  for (const dateStr of sortedDates) {
    const d = new Date(dateStr);
    if (prevDate) {
      const diffDays = Math.round(
        (d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays === 1) {
        currentStreak++;
      } else if (diffDays === 0) {
        // same date — already counted
      } else {
        longestStreak = Math.max(longestStreak, currentStreak);
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }
    prevDate = d;
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  const weightLogs = logs
    .filter((l) => l.weight_kg != null)
    .sort((a, b) => a.log_date.localeCompare(b.log_date));
  const weights = weightLogs.map((l) => l.weight_kg as number);
  const weightStart = weights.length ? weights[0] : null;
  const weightLowest = weights.length ? Math.min(...weights) : null;
  const weightCurrent = weights.length ? weights[weights.length - 1] : null;

  return {
    workouts_total: completed.length,
    workouts_by_type: byType,
    adherence_completed: completed.length,
    adherence_generated: generated,
    longest_streak_days: longestStreak,
    avg_sleep_quality: avgOrNull(sleepQualities),
    avg_resting_hr: avgOrNull(restingHRs),
    weight_start_kg: weightStart,
    weight_lowest_kg: weightLowest,
    weight_current_kg: weightCurrent,
  };
}

export async function computeDossierStats(
  sb: SupabaseClient
): Promise<DossierStats> {
  const day14 = daysAgoISO(14);
  const day44 = daysAgoISO(44);
  const day365 = daysAgoISO(365);

  const [
    midPlansRes,
    midLogsRes,
    midActivityRes,
    longPlansRes,
    longLogsRes,
    longActivityRes,
  ] = await Promise.all([
    sb
      .from("training_plans")
      .select("plan_date, focus, total_minutes, completed, avg_hr")
      .gte("plan_date", day44)
      .lt("plan_date", day14),
    sb
      .from("daily_log")
      .select("log_date, sleep_quality, energy, weight_kg, waist_cm")
      .gte("log_date", day44)
      .lt("log_date", day14),
    sb
      .from("activity_daily")
      .select("resting_hr")
      .gte("activity_date", day44)
      .lt("activity_date", day14)
      .not("resting_hr", "is", null),
    sb
      .from("training_plans")
      .select("plan_date, focus, total_minutes, completed, avg_hr")
      .gte("plan_date", day365)
      .lt("plan_date", day14),
    sb
      .from("daily_log")
      .select("log_date, sleep_quality, energy, weight_kg, waist_cm")
      .gte("log_date", day365)
      .lt("log_date", day14),
    sb
      .from("activity_daily")
      .select("resting_hr")
      .gte("activity_date", day365)
      .lt("activity_date", day14)
      .not("resting_hr", "is", null),
  ]);

  const midterm = computeMidterm(
    (midPlansRes.data ?? []) as PlanRow[],
    (midLogsRes.data ?? []) as LogRow[],
    (midActivityRes.data ?? []) as ActivityRow[]
  );
  const longterm = computeLongterm(
    (longPlansRes.data ?? []) as PlanRow[],
    (longLogsRes.data ?? []) as LogRow[],
    (longActivityRes.data ?? []) as ActivityRow[]
  );

  return {
    midterm,
    longterm,
    computed_at: new Date().toISOString(),
  };
}
