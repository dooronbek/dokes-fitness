import { supabaseServer } from "./supabase";
import { daysAgoISO, nowInUserTZ, todayISO, yesterdayISO } from "./dates";
import { getCalorieBreakdownRange, type CalorieBreakdown } from "./calories";
import { epley1RM } from "./pr-detect";
import {
  PR_EXERCISES,
  type ActivityDaily,
  type CoachMessage,
  type DailyLog,
  type DossierStats,
  type Meal,
  type PersonalRecord,
  type PlanExercise,
  type PRExercise,
  type TrainingLocation,
  type TrainingPlan,
  type UserProfile,
  type Workout,
} from "./types";

export type CoachContext = {
  user_profile: UserProfile | null;
  prs_by_exercise: Map<PRExercise, PersonalRecord>;
  dossier_stats: DossierStats;
  today: string;
  recent_logs: DailyLog[];
  recent_meals: Meal[];
  recent_activity: ActivityDaily[];
  recent_workouts: Workout[];
  yesterday_plan: TrainingPlan | null;
  today_plan: TrainingPlan | null;
  recent_plans: TrainingPlan[];
  recent_messages: CoachMessage[];
  calorie_breakdowns: CalorieBreakdown[];
  locations_by_id: Map<string, TrainingLocation>;
};

export async function loadCoachContext(opts?: {
  includeMessages?: boolean;
  messageLimit?: number;
}): Promise<CoachContext> {
  const sb = supabaseServer();
  const today = todayISO();
  const since = daysAgoISO(7);
  const since14 = daysAgoISO(13);
  const sincePlans = daysAgoISO(14);
  const yesterday = daysAgoISO(1);

  const [
    profileRes,
    prsRes,
    statsRes,
    logsRes,
    mealsRes,
    activityRes,
    workoutsRes,
    yPlanRes,
    todayPlanRes,
    recentPlansRes,
    msgsRes,
    locationsRes,
  ] = await Promise.all([
    sb.from("user_profile").select("*").eq("id", 1).maybeSingle(),
    sb.from("personal_records").select("*"),
    sb
      .from("dossier_stats")
      .select("midterm, longterm, computed_at")
      .eq("id", 1)
      .maybeSingle(),
    sb
      .from("daily_log")
      .select("*")
      .gte("log_date", since)
      .order("log_date", { ascending: true }),
    sb
      .from("meals")
      .select("*")
      .gte("meal_date", since)
      .order("created_at", { ascending: true }),
    sb
      .from("activity_daily")
      .select("*")
      .gte("activity_date", since14)
      .order("activity_date", { ascending: true }),
    sb
      .from("workouts")
      // Explicit list — never load raw_payload into the coach context. It's
      // forensic-only storage and we don't want HAE's avg/max HR fields
      // (still inside raw_payload) accidentally surfaced to the model.
      .select(
        "id, external_id, source, workout_date, started_at, ended_at, type, duration_min, active_calories, total_calories, distance_m, notes, synced_at"
      )
      .gte("workout_date", since14)
      .order("started_at", { ascending: true }),
    sb
      .from("training_plans")
      .select("*")
      .eq("plan_date", yesterday)
      .maybeSingle(),
    sb
      .from("training_plans")
      .select("*")
      .eq("plan_date", today)
      .eq("completed", true)
      .maybeSingle(),
    sb
      .from("training_plans")
      .select("*")
      .gte("plan_date", sincePlans)
      .lt("plan_date", today)
      .order("plan_date", { ascending: false }),
    opts?.includeMessages
      ? sb
          .from("coach_messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(opts.messageLimit ?? 20)
      : Promise.resolve({ data: [] as CoachMessage[], error: null }),
    sb.from("training_locations").select("*"),
  ]);

  const locations_by_id = new Map<string, TrainingLocation>(
    ((locationsRes.data ?? []) as TrainingLocation[]).map((l) => [l.id, l])
  );

  const prs_by_exercise = new Map<PRExercise, PersonalRecord>();
  for (const pr of (prsRes.data ?? []) as PersonalRecord[]) {
    prs_by_exercise.set(pr.exercise as PRExercise, pr);
  }

  const dossier_stats: DossierStats = statsRes.data
    ? {
        midterm: statsRes.data.midterm,
        longterm: statsRes.data.longterm,
        computed_at: statsRes.data.computed_at,
      }
    : { midterm: null, longterm: null, computed_at: null };

  const recent_messages = (msgsRes.data ?? []).slice().reverse() as CoachMessage[];

  // If multiple sources land on the same date, keep the most recently synced row.
  const dailyByDate = new Map<string, ActivityDaily>();
  for (const r of (activityRes.data ?? []) as ActivityDaily[]) {
    const existing = dailyByDate.get(r.activity_date);
    if (!existing) {
      dailyByDate.set(r.activity_date, r);
    } else {
      const a = existing.synced_at ?? "";
      const b = r.synced_at ?? "";
      if (b > a) dailyByDate.set(r.activity_date, r);
    }
  }
  const recent_activity = Array.from(dailyByDate.values()).sort((a, b) =>
    a.activity_date.localeCompare(b.activity_date)
  );

  const calorie_breakdowns = await getCalorieBreakdownRange(
    recent_activity.map((a) => a.activity_date)
  );

  return {
    user_profile: (profileRes.data ?? null) as UserProfile | null,
    prs_by_exercise,
    dossier_stats,
    today,
    recent_logs: (logsRes.data ?? []) as DailyLog[],
    recent_meals: (mealsRes.data ?? []) as Meal[],
    recent_activity,
    recent_workouts: (workoutsRes.data ?? []) as Workout[],
    yesterday_plan: (yPlanRes.data ?? null) as TrainingPlan | null,
    today_plan: (todayPlanRes.data ?? null) as TrainingPlan | null,
    recent_plans: (recentPlansRes.data ?? []) as TrainingPlan[],
    recent_messages,
    calorie_breakdowns,
    locations_by_id,
  };
}

// ─── Dossier rendering ──────────────────────────────────────────────────────

const PR_LABELS: Record<PRExercise, string> = {
  deadlift: "Deadlift",
  bench_press: "Bench press",
  barbell_squat: "Barbell squat",
  pullups: "Pull-ups",
  pushups: "Push-ups",
  plank: "Plank",
  run_5k: "5k run",
  run_1k: "1k run",
};

function formatPRForPrompt(pr: PersonalRecord | undefined): string {
  if (!pr) return "not set";
  const v = Number(pr.value_numeric);
  switch (pr.value_unit) {
    case "kg": {
      if (pr.reps_at_pr != null) {
        const e1rm = Math.round(epley1RM(v, pr.reps_at_pr));
        return `${v} kg × ${pr.reps_at_pr} (e1RM ${e1rm} kg, set ${pr.set_at})`;
      }
      return `${v} kg (set ${pr.set_at})`;
    }
    case "reps":
      return `${v} reps (set ${pr.set_at})`;
    case "seconds": {
      if (v >= 60) {
        const m = Math.floor(v / 60);
        const s = Math.round(v % 60);
        return `${m}m ${s}s (set ${pr.set_at})`;
      }
      return `${v} seconds (set ${pr.set_at})`;
    }
    case "minutes": {
      const totalSecs = Math.round(v * 60);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      return `${m}:${s.toString().padStart(2, "0")} (set ${pr.set_at})`;
    }
  }
}

function nonEmpty(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function profileSection(p: UserProfile | null): string | null {
  if (!p) return null;
  const lines: string[] = [];
  const name = nonEmpty(p.name);
  if (name) lines.push(`Name: ${name}`);
  if (p.age != null) lines.push(`Age: ${p.age}`);
  if (p.height_cm != null) lines.push(`Height: ${p.height_cm} cm`);
  if (p.sex) lines.push(`Sex: ${p.sex}`);
  return lines.length ? `### PROFILE\n${lines.join("\n")}` : null;
}

function goalsSection(p: UserProfile | null): string | null {
  if (!p) return null;
  const short = nonEmpty(p.primary_goal_short);
  const long = nonEmpty(p.primary_goal_long);
  if (!short && !long) return null;
  const lines: string[] = [];
  if (short) lines.push(`Short-term (2-3 months): ${short}`);
  if (long) lines.push(`Long-term: ${long}`);
  return `### GOALS\n${lines.join("\n")}`;
}

function backgroundSection(p: UserProfile | null): string | null {
  if (!p) return null;
  const ab = nonEmpty(p.athletic_background);
  const cs = nonEmpty(p.current_state);
  const ls = nonEmpty(p.lifestyle);
  if (!ab && !cs && !ls) return null;
  const lines: string[] = [];
  if (ab) lines.push(`Athletic background: ${ab}`);
  if (cs) lines.push(`Current state: ${cs}`);
  if (ls) lines.push(`Lifestyle: ${ls}`);
  return `### BACKGROUND\n${lines.join("\n")}`;
}

function trainingPrefsSection(p: UserProfile | null): string | null {
  if (!p) return null;
  const ec = nonEmpty(p.equipment_constraints_general);
  const psy = nonEmpty(p.preferences_psychology);
  const days = p.preferred_training_days_per_week;
  const mins = p.preferred_session_minutes;
  if (days == null && mins == null && !ec && !psy) return null;
  const lines: string[] = [];
  if (days != null) lines.push(`Preferred sessions per week: ${days}`);
  if (mins != null) lines.push(`Preferred session length: ${mins} min`);
  if (ec) lines.push(`Equipment constraints (general): ${ec}`);
  if (psy) lines.push(`Preferences and psychology: ${psy}`);
  return `### TRAINING PREFERENCES\n${lines.join("\n")}`;
}

function dietSection(p: UserProfile | null): string | null {
  if (!p) return null;
  const d = nonEmpty(p.diet_pattern);
  return d ? `### DIET\n${d}` : null;
}

function healthSection(p: UserProfile | null): string | null {
  if (!p) return null;
  const ia = nonEmpty(p.injuries_active);
  const ih = nonEmpty(p.injuries_history);
  const oc = nonEmpty(p.other_conditions);
  if (!ia && !ih && !oc) return null;
  const lines: string[] = [];
  if (ia) lines.push(`Active injuries: ${ia}`);
  if (ih) lines.push(`Past injuries: ${ih}`);
  if (oc) lines.push(`Other conditions: ${oc}`);
  return `### HEALTH\n${lines.join("\n")}`;
}

function prsSection(prs: Map<PRExercise, PersonalRecord>): string {
  const lines = ["### PERSONAL RECORDS"];
  for (const ex of PR_EXERCISES) {
    lines.push(`- ${PR_LABELS[ex]}: ${formatPRForPrompt(prs.get(ex))}`);
  }
  return lines.join("\n");
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  return Number(v).toFixed(digits);
}

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return String(Math.round(Number(v)));
}

function byTypeBreakdown(c: {
  strength: number;
  cardio: number;
  mobility: number;
  mixed: number;
  rest: number;
}): string {
  const parts: string[] = [];
  if (c.strength) parts.push(`Strength: ${c.strength}`);
  if (c.cardio) parts.push(`Cardio: ${c.cardio}`);
  if (c.mobility) parts.push(`Mobility: ${c.mobility}`);
  if (c.mixed) parts.push(`Mixed: ${c.mixed}`);
  if (c.rest) parts.push(`Rest: ${c.rest}`);
  return parts.join(" | ") || "—";
}

function trainingHistorySection(stats: DossierStats): string {
  if (!stats.midterm && !stats.longterm) {
    return "### TRAINING HISTORY\nNo aggregated history available yet — visit /knowledge to compute.";
  }
  const lines = [
    "### TRAINING HISTORY (windows EXCLUDE the most recent 14 days, which appear in PAST PLANS with full detail)",
  ];
  if (stats.midterm) {
    const m = stats.midterm;
    lines.push("");
    lines.push("Mid-term (days 15-44 ago):");
    lines.push(`- ${m.workouts_total} workouts (${byTypeBreakdown(m.workouts_by_type)})`);
    lines.push(
      `- Adherence: ${m.adherence_completed}/${m.adherence_generated} (${pct(m.adherence_completed, m.adherence_generated)})`
    );
    lines.push(`- Avg session: ${fmtInt(m.avg_session_minutes)} min`);
    lines.push(
      `- Avg HR: strength ${fmtInt(m.avg_hr_by_type.strength)}, cardio ${fmtInt(m.avg_hr_by_type.cardio)}`
    );
    lines.push(`- Avg sleep quality: ${fmtNum(m.avg_sleep_quality)}/5`);
    lines.push(`- Avg energy: ${fmtNum(m.avg_energy)}/5`);
    lines.push(`- Avg resting HR: ${fmtInt(m.avg_resting_hr)} bpm`);
    const wd = m.weight_delta_kg != null ? `${m.weight_delta_kg.toFixed(1)} kg` : "—";
    const wcd = m.waist_delta_cm != null ? `${m.waist_delta_cm.toFixed(1)} cm` : "—";
    lines.push(`- Weight delta: ${wd} | Waist delta: ${wcd}`);
  }
  if (stats.longterm) {
    const l = stats.longterm;
    lines.push("");
    lines.push("Long-term (last 365 days, excluding recent 14):");
    lines.push(`- ${l.workouts_total} workouts (${byTypeBreakdown(l.workouts_by_type)})`);
    lines.push(
      `- Adherence: ${l.adherence_completed}/${l.adherence_generated} (${pct(l.adherence_completed, l.adherence_generated)})`
    );
    lines.push(`- Longest streak: ${l.longest_streak_days} days`);
    lines.push(`- Avg sleep quality: ${fmtNum(l.avg_sleep_quality)}/5`);
    lines.push(`- Avg resting HR: ${fmtInt(l.avg_resting_hr)} bpm`);
    const ws = l.weight_start_kg != null ? `${l.weight_start_kg.toFixed(1)}` : "—";
    const wl = l.weight_lowest_kg != null ? `${l.weight_lowest_kg.toFixed(1)}` : "—";
    const wc = l.weight_current_kg != null ? `${l.weight_current_kg.toFixed(1)}` : "—";
    lines.push(`- Weight trajectory: ${ws} → ${wl} (lowest) → ${wc} (current) kg`);
  }
  return lines.join("\n");
}

export function dossierBlock(
  profile: UserProfile | null,
  prs: Map<PRExercise, PersonalRecord>,
  stats: DossierStats
): string {
  const sections = [
    profileSection(profile),
    goalsSection(profile),
    backgroundSection(profile),
    trainingPrefsSection(profile),
    dietSection(profile),
    healthSection(profile),
    prsSection(prs),
    trainingHistorySection(stats),
  ].filter((s): s is string => Boolean(s));
  if (sections.length === 0) return "";
  return ["## LONG-TERM KNOWLEDGE", ...sections].join("\n\n");
}

// Slim diet-focused dossier for the meal vision route.
export function dietContextBlock(profile: UserProfile | null): string {
  if (!profile) return "";
  const lines: string[] = [];
  const goalShort = nonEmpty(profile.primary_goal_short);
  const goalLong = nonEmpty(profile.primary_goal_long);
  const diet = nonEmpty(profile.diet_pattern);
  const eq = nonEmpty(profile.equipment_constraints_general);
  if (goalShort) lines.push(`Goal (short-term): ${goalShort}`);
  if (goalLong) lines.push(`Goal (long-term): ${goalLong}`);
  if (diet) lines.push(`Diet pattern: ${diet}`);
  if (eq) lines.push(`Constraints: ${eq}`);
  return lines.length ? `## USER CONTEXT\n${lines.join("\n")}` : "";
}

// ─── Other context blocks (unchanged) ───────────────────────────────────────

function activityBlock(ctx: CoachContext): string {
  const lines: string[] = ["## ACTIVITY DATA (last 14 days)", "(from Bip 6 / Apple Health)", ""];
  lines.push("### Daily summaries");
  if (ctx.recent_activity.length === 0) {
    lines.push("(no data yet)");
  } else {
    const breakdownByDate = new Map(
      ctx.calorie_breakdowns.map((b) => [b.date, b])
    );
    for (const d of ctx.recent_activity) {
      const parts: string[] = [];
      if (d.steps != null) parts.push(`steps=${d.steps}`);

      const cb = breakdownByDate.get(d.activity_date);
      const activeKcal = cb?.active ?? d.active_calories;
      if (activeKcal != null) parts.push(`active_kcal=${activeKcal}`);

      if (cb?.computable) {
        parts.push(`BMR=${cb.bmr}`);
        parts.push(`total=${cb.total}`);
        const w = cb.weight_used_kg;
        const wTag =
          cb.weight_source === "log_same_day"
            ? `${w}kg (logged today)`
            : `${w}kg (most recent log)`;
        parts.push(`weight=${wTag}`);
      } else if (cb) {
        parts.push(`total=unknown (reason: ${cb.reason_if_not})`);
      }

      if (d.sleep_minutes != null)
        parts.push(`sleep_hours=${(d.sleep_minutes / 60).toFixed(1)}`);
      // Skip d.avg_hr — activity_daily doesn't get continuous HR; the column
      // is always null and noisy. Real avg HR comes from training_plans.avg_hr
      // (typed in at plan completion) and is rendered in the PAST PLANS block.
      if (d.resting_hr != null) parts.push(`resting_hr=${d.resting_hr}`);
      if (d.hrv_ms != null) parts.push(`hrv_ms=${Number(d.hrv_ms).toFixed(0)}`);
      if (d.exercise_minutes != null) parts.push(`exercise_min=${d.exercise_minutes}`);
      lines.push(`${d.activity_date}: ${parts.join(", ") || "(empty)"}`);
    }
  }
  lines.push("");
  lines.push("### Workouts");
  if (ctx.recent_workouts.length === 0) {
    lines.push("(none)");
  } else {
    for (const w of ctx.recent_workouts) {
      const bits: string[] = [];
      if (w.duration_min != null) bits.push(`${w.duration_min} min`);
      const kcal = w.active_calories ?? w.total_calories;
      if (kcal != null) bits.push(`${kcal} kcal`);
      // No HR emitted here — HAE's max_hr shares the unreliable cooldown-only
      // source as avg_hr. Real HR comes from training_plans.avg_hr (PAST PLANS).
      if (w.distance_m != null) bits.push(`${(w.distance_m / 1000).toFixed(2)} km`);
      lines.push(`${w.workout_date} ${w.type ?? "workout"} - ${bits.join(", ") || "(no metrics)"}`);
    }
  }
  return lines.join("\n");
}

function dailyLogsBlock(ctx: CoachContext): string {
  const lines: string[] = ["### Daily logs (subjective ratings on 1-5 scale)"];
  if (ctx.recent_logs.length === 0) {
    lines.push("(no logs yet)");
    return lines.join("\n");
  }
  for (const l of ctx.recent_logs) {
    const parts: string[] = [];
    if (l.weight_kg != null) parts.push(`weight=${l.weight_kg}kg`);
    if (l.waist_cm != null) parts.push(`waist=${l.waist_cm}cm`);
    if (l.sleep_hours != null) parts.push(`sleep_hours=${l.sleep_hours}`);
    if (l.sleep_quality != null) parts.push(`sleep_quality=${l.sleep_quality}/5`);
    if (l.mood != null) parts.push(`mood=${l.mood}/5`);
    if (l.energy != null) parts.push(`energy=${l.energy}/5`);
    if (l.meditation_minutes != null && l.meditation_minutes > 0) {
      parts.push(`meditation=${l.meditation_minutes}min`);
    }
    if (l.soreness_notes && l.soreness_notes.trim()) {
      parts.push(`soreness="${l.soreness_notes.trim()}"`);
    }
    if (l.notes && l.notes.trim()) {
      parts.push(`notes="${l.notes.trim()}"`);
    }
    lines.push(`${l.log_date}: ${parts.join(", ") || "(empty)"}`);
  }
  return lines.join("\n");
}

function exerciseLine(ex: PlanExercise): string {
  const head = ex.exercise.trim();
  const parts: string[] = [];
  if (ex.sets != null && ex.reps != null) {
    parts.push(`${ex.sets}×${ex.reps}`);
  } else if (ex.sets != null) {
    parts.push(`${ex.sets} sets`);
  } else if (ex.reps != null) {
    parts.push(String(ex.reps));
  }
  if (ex.load_guidance && ex.load_guidance.trim()) {
    parts.push(ex.load_guidance.trim());
  }
  if (ex.notes && ex.notes.trim()) {
    parts.push(`"${ex.notes.trim()}"`);
  }
  return parts.length ? `- ${head}: ${parts.join(", ")}` : `- ${head}`;
}

function todayPlanBlock(ctx: CoachContext): string {
  const p = ctx.today_plan;
  if (!p) return "";
  const focus = (p.focus ?? "Plan").trim();
  const dur = p.total_minutes != null ? `, ${p.total_minutes}min` : "";
  const loc = p.location_id ? ctx.locations_by_id.get(p.location_id) : null;
  const locTag = loc ? ` @ ${loc.name}` : "";
  const lines: string[] = ["## TODAY'S PLAN (completed)", `${focus}${dur}${locTag}`];
  if (!p.main || p.main.length === 0) {
    lines.push("(no exercises recorded)");
  } else {
    lines.push("Main:");
    for (const ex of p.main) {
      lines.push(exerciseLine(ex));
    }
  }
  if (p.avg_hr != null) {
    lines.push(`HR avg ${p.avg_hr}`);
  }
  if (p.completion_notes && p.completion_notes.trim()) {
    lines.push(`Notes: ${p.completion_notes.trim()}`);
  }
  return lines.join("\n");
}

function pastPlansBlock(ctx: CoachContext): string {
  if (ctx.recent_plans.length === 0) return "";
  const lines: string[] = ["## PAST PLANS (last 14 days, most recent first)", ""];
  for (const p of ctx.recent_plans) {
    const focus = (p.focus ?? "Plan").trim();
    const dur = p.total_minutes != null ? `, ${p.total_minutes}min` : "";
    const loc = p.location_id ? ctx.locations_by_id.get(p.location_id) : null;
    const locTag = loc ? ` @ ${loc.name}` : "";
    const status = p.completed ? "completed" : "not completed";
    const hr = p.avg_hr != null ? `, HR avg ${p.avg_hr}` : "";
    lines.push(`### ${p.plan_date} — ${focus}${dur}${locTag} — ${status}${hr}`);

    if (!p.completed) {
      lines.push("(skipped)");
    } else if (!p.main || p.main.length === 0) {
      lines.push("(no exercises recorded)");
    } else {
      lines.push("Main:");
      for (const ex of p.main) {
        lines.push(exerciseLine(ex));
      }
      if (p.completion_notes && p.completion_notes.trim()) {
        lines.push(`Notes: ${p.completion_notes.trim()}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function recentMessagesBlock(ctx: CoachContext, limit: number): string {
  if (ctx.recent_messages.length === 0) return "";
  const slice = ctx.recent_messages.slice(-limit);
  const lines = [`## RECENT COACH CONVERSATION (last ${slice.length} messages)`];
  for (const m of slice) {
    const text = m.content.replace(/\s+/g, " ").trim();
    lines.push(`[${m.role}]: ${text}`);
  }
  return lines.join("\n");
}

// Authoritative time header. Goes FIRST in every context block so the model
// never has to (and must never) infer the date itself. All date columns below
// (log_date, meal_date, plan_date, activity_date) are in this same timezone.
function currentTimeBlock(): string {
  return [
    '## CURRENT TIME (authoritative — always use these for "today", "yesterday", "N days ago")',
    `Current local time: ${nowInUserTZ()}`,
    `Today's date: ${todayISO()}`,
    `Yesterday's date: ${yesterdayISO()}`,
    "",
    'When the user says "today" or "yesterday", resolve it against the dates above — never against your own training knowledge. Every date below (workouts, plans, logs, meals) is a calendar date in Asia/Bishkek (UTC+6) and lines up with these values. Prefer naming the exact date (e.g. "your June 16 strength session") over relative phrasing.',
  ].join("\n");
}

// Build a compact, structured context block for the model.
// Daily logs and activity are rendered as text lines (more compact, easier
// for the model to scan); meals and yesterday's plan stay as JSON for
// precise parsing. The structured dossier (PROFILE/GOALS/PRs/HISTORY/...)
// uses labelled markdown sections.
export function contextBlock(
  ctx: CoachContext,
  opts?: { includeRecentMessages?: number; includeTodayPlan?: boolean }
): string {
  const slim = {
    today: ctx.today,
    recent_meals: ctx.recent_meals.map((m) => ({
      date: m.meal_date,
      kcal: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      desc: m.description,
    })),
    yesterday_plan: ctx.yesterday_plan && {
      focus: ctx.yesterday_plan.focus,
      total_minutes: ctx.yesterday_plan.total_minutes,
      main: ctx.yesterday_plan.main,
      completed: ctx.yesterday_plan.completed,
      completion_notes: ctx.yesterday_plan.completion_notes,
      avg_hr: ctx.yesterday_plan.avg_hr,
      location_name: ctx.yesterday_plan.location_id
        ? ctx.locations_by_id.get(ctx.yesterday_plan.location_id)?.name ?? null
        : null,
    },
  };
  const logs =
    "## DAILY LOGS (last 7 days)\n" + dailyLogsBlock(ctx);
  const recent =
    "## RECENT DATA (last 7 days)\n<context>\n" +
    JSON.stringify(slim, null, 2) +
    "\n</context>";
  const activity = activityBlock(ctx);
  const todayPlan = opts?.includeTodayPlan ? todayPlanBlock(ctx) : "";
  const pastPlans = pastPlansBlock(ctx);
  const dossier = dossierBlock(ctx.user_profile, ctx.prs_by_exercise, ctx.dossier_stats);
  const messages = opts?.includeRecentMessages
    ? recentMessagesBlock(ctx, opts.includeRecentMessages)
    : "";
  return [currentTimeBlock(), dossier, activity, todayPlan, pastPlans, logs, recent, messages]
    .filter((s) => s)
    .join("\n\n");
}

export function coachSystemPrompt(ctx: CoachContext): string {
  const psy = ctx.user_profile?.preferences_psychology?.trim();
  const styleHint = psy
    ? "Adapt your tone and approach to the user's stated preferences and motivators (LONG-TERM KNOWLEDGE > TRAINING PREFERENCES > preferences_psychology)."
    : "Default coaching style: warm, direct, evidence-based; concise messages; ask one focused question at a time.";
  return [
    "You are Dokes, a personal AI fitness and nutrition coach for a single user.",
    styleHint,
    'The user lives in Asia/Bishkek (UTC+6). The CURRENT TIME block at the very top of the context is the single source of truth for what day it is. Always resolve "today", "yesterday", and "N days ago" using those exact dates — never compute or guess the date yourself, and never assume the current date from your training. All date fields in the data (log_date, meal_date, plan_date, activity_date) are calendar dates in this same timezone and align with that block.',
    "Subjective ratings (sleep_quality, mood, energy) are user self-reports on a 1-5 scale. 1 = very poor, 5 = excellent. 3 is average. 4-5 is a good day.",
    "LONG-TERM KNOWLEDGE has structured sections: PROFILE (identity), GOALS (short + long), BACKGROUND, TRAINING PREFERENCES (including psychology / coaching style), DIET, HEALTH, PERSONAL RECORDS (8 tracked exercises), and TRAINING HISTORY (mid-term: 30 days ending 14 days ago; long-term: last year). Treat it as ground truth.",
    "PERSONAL RECORDS reflect the user's documented bests. Use them for progression reasoning. Coaching style and motivators are in TRAINING PREFERENCES > preferences_psychology — adapt your tone and approach to what's stated there.",
    "TRAINING HISTORY excludes the most recent 14 days (which appear in PAST PLANS with full exercise detail). Use TRAINING HISTORY for long-term consistency reasoning, PAST PLANS for current programming.",
    "The ACTIVITY DATA section reflects what the user actually did per their watch/phone (steps, sleep, HR, workouts). If they say 'I trained yesterday' but no workout is in ACTIVITY DATA from yesterday, gently flag the discrepancy. If they ask about training and ACTIVITY DATA is empty, mention they should set up Health Auto Export to give you better signal.",
    "Total calories burned per day is computed as: Mifflin-St Jeor BMR (using the user's height, age, sex, and most recent logged weight) + Active calories from their watch. If a day has no weight logged on or before it, total is not shown — gently encourage the user to log weight regularly so calorie math stays accurate.",
    "active_kcal is the total active energy from the user's watch (Zepp via Apple Health), already including both ambient activity throughout the day AND any recorded workouts. Workouts shown separately in the WORKOUTS section are for training context (type, duration, HR) but their calorie values are already reflected in the daily active_kcal — do NOT sum them.",
    "The DAILY LOGS and RECENT DATA sections reflect the last 7-14 days of logged behavior (daily check-ins, meals, yesterday's plan). Use all sources together.",
    "PAST PLANS spans 14 days and includes full exercise lists with weights, reps, and completion notes. Reference specific lifts and progress when relevant (\"you squatted 12kg DB x 8 last Tuesday — today try 14kg x 6-8 if it felt easy\").",
    "TODAY'S PLAN appears only when today's session is completed. Reference it directly when user asks about today's training. If it's missing, today is either not yet trained or not yet marked done.",
    "If long-term knowledge contradicts a single recent data point (e.g., user noted today they're bored of an exercise they previously listed as a favorite), prefer the recent data but acknowledge the shift.",
    "Be specific. Reference actual numbers from the context when relevant. Do not invent data that isn't there.",
    "Mobile chat — keep replies short. Bullet points over paragraphs. No filler preambles.",
    "If context is missing or sparse, say so briefly and suggest what to log.",
  ].join("\n");
}
