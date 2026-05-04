import { supabaseServer } from "./supabase";

// Mifflin-St Jeor BMR (kcal/day). The same equation Apple Health uses
// internally to estimate basal calories — the difference is we run it on
// a single authoritative weight (the user's most recent daily_log entry)
// instead of summing every reporting source on the device, which is what
// produced HAE's 5-7k kcal/day basal numbers.
export function computeBMR(
  weight_kg: number,
  height_cm: number,
  age: number,
  sex: string
): number {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return Math.round(sex === "female" ? base - 161 : base + 5);
}

export type CalorieBreakdown = {
  date: string;
  bmr: number | null;
  active: number | null;
  total: number | null;
  weight_used_kg: number | null;
  weight_source: "log_same_day" | "log_recent" | "none";
  computable: boolean;
  reason_if_not?: "no_weight_logged" | "profile_incomplete";
};

// Compute the calorie breakdown for a single date. The "weight used" is
// the most recent daily_log.weight_kg on or before the date (so a backfill
// view of last week still uses last week's weight, not today's).
export async function getCalorieBreakdown(
  date: string
): Promise<CalorieBreakdown> {
  const sb = supabaseServer();

  const [profileRes, weightRes, activityRes] = await Promise.all([
    sb.from("profile").select("height_cm, age, sex").eq("id", 1).maybeSingle(),
    sb
      .from("daily_log")
      .select("weight_kg, log_date")
      .lte("log_date", date)
      .not("weight_kg", "is", null)
      .order("log_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("activity_daily")
      .select("active_calories")
      .eq("activity_date", date)
      .maybeSingle(),
  ]);

  const profile = profileRes.data as
    | { height_cm: number | null; age: number | null; sex: string | null }
    | null;
  const weightRow = weightRes.data as
    | { weight_kg: number | null; log_date: string }
    | null;
  const activityRow = activityRes.data as
    | { active_calories: number | null }
    | null;

  const active = activityRow?.active_calories ?? null;
  const weight =
    weightRow && weightRow.weight_kg != null ? Number(weightRow.weight_kg) : null;
  const weight_source: CalorieBreakdown["weight_source"] =
    weight == null
      ? "none"
      : weightRow!.log_date === date
      ? "log_same_day"
      : "log_recent";

  if (
    !profile?.height_cm ||
    !profile?.age ||
    !profile?.sex ||
    weight == null
  ) {
    return {
      date,
      bmr: null,
      active,
      total: null,
      weight_used_kg: weight,
      weight_source,
      computable: false,
      reason_if_not:
        weight == null ? "no_weight_logged" : "profile_incomplete",
    };
  }

  const bmr = computeBMR(
    weight,
    Number(profile.height_cm),
    profile.age,
    profile.sex
  );
  const total = bmr + (active ?? 0);

  return {
    date,
    bmr,
    active,
    total,
    weight_used_kg: weight,
    weight_source,
    computable: true,
  };
}

// Coach context passes ~14 dates here. Calls fire in parallel.
export async function getCalorieBreakdownRange(
  dates: string[]
): Promise<CalorieBreakdown[]> {
  return Promise.all(dates.map((d) => getCalorieBreakdown(d)));
}
