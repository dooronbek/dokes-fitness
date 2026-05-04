import { supabaseServer } from "./supabase";
import { daysAgoISO, todayISO } from "./dates";
import { getCalorieBreakdownRange, type CalorieBreakdown } from "./calories";
import type {
  ActivityDaily,
  CoachKnowledge,
  CoachMessage,
  DailyLog,
  Meal,
  Profile,
  TrainingPlan,
  Workout,
} from "./types";

export type CoachContext = {
  profile: Profile | null;
  knowledge: CoachKnowledge | null;
  today: string;
  recent_logs: DailyLog[];
  recent_meals: Meal[];
  recent_activity: ActivityDaily[];
  recent_workouts: Workout[];
  yesterday_plan: TrainingPlan | null;
  recent_messages: CoachMessage[];
  calorie_breakdowns: CalorieBreakdown[];
};

export async function loadCoachContext(opts?: {
  includeMessages?: boolean;
  messageLimit?: number;
}): Promise<CoachContext> {
  const sb = supabaseServer();
  const today = todayISO();
  const since = daysAgoISO(7);
  const since14 = daysAgoISO(13);
  const yesterday = daysAgoISO(1);

  const [
    profileRes,
    knowledgeRes,
    logsRes,
    mealsRes,
    activityRes,
    workoutsRes,
    yPlanRes,
    msgsRes,
  ] = await Promise.all([
    sb.from("profile").select("*").eq("id", 1).maybeSingle(),
    sb.from("coach_knowledge").select("*").eq("id", 1).maybeSingle(),
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
      .select("*")
      .gte("workout_date", since14)
      .order("started_at", { ascending: true }),
    sb
      .from("training_plans")
      .select("*")
      .eq("plan_date", yesterday)
      .maybeSingle(),
    opts?.includeMessages
      ? sb
          .from("coach_messages")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(opts.messageLimit ?? 20)
      : Promise.resolve({ data: [] as CoachMessage[], error: null }),
  ]);

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
    profile: (profileRes.data ?? null) as Profile | null,
    knowledge: (knowledgeRes.data ?? null) as CoachKnowledge | null,
    today,
    recent_logs: (logsRes.data ?? []) as DailyLog[],
    recent_meals: (mealsRes.data ?? []) as Meal[],
    recent_activity,
    recent_workouts: (workoutsRes.data ?? []) as Workout[],
    yesterday_plan: (yPlanRes.data ?? null) as TrainingPlan | null,
    recent_messages,
    calorie_breakdowns,
  };
}

const KNOWLEDGE_SECTIONS: { key: keyof CoachKnowledge; heading: string }[] = [
  { key: "background", heading: "Background" },
  { key: "current_state", heading: "Current state" },
  { key: "personal_records", heading: "Personal records" },
  { key: "goals_short_term", heading: "Short-term goals" },
  { key: "goals_long_term", heading: "Long-term goals" },
  { key: "injuries", heading: "Injuries" },
  { key: "constraints", heading: "Constraints" },
  { key: "diet_reality", heading: "Diet reality" },
  { key: "preferences", heading: "Preferences / psychology" },
  { key: "lifestyle", heading: "Lifestyle" },
  { key: "freeform", heading: "Freeform" },
];

export function knowledgeBlock(
  k: CoachKnowledge | null,
  only?: (keyof CoachKnowledge)[]
): string {
  if (!k) return "";
  const sections = only
    ? KNOWLEDGE_SECTIONS.filter((s) => only.includes(s.key))
    : KNOWLEDGE_SECTIONS;
  const parts: string[] = [];
  for (const s of sections) {
    const v = k[s.key];
    if (typeof v === "string" && v.trim()) {
      parts.push(`### ${s.heading}\n${v.trim()}`);
    }
  }
  if (parts.length === 0) return "";
  return [
    "## LONG-TERM KNOWLEDGE ABOUT THE USER",
    "(these are stable facts about this person, treat as ground truth)",
    "",
    ...parts,
  ].join("\n\n");
}

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
      if (activeKcal != null) {
        if (cb && cb.active_from_workouts > 0) {
          parts.push(
            `active_kcal=${activeKcal} (${cb.active_from_daily} daily stream + ${cb.active_from_workouts} workout)`
          );
        } else {
          parts.push(`active_kcal=${activeKcal}`);
        }
      }

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
      // is always null and noisy. Workouts have real per-workout avg_hr/max_hr.
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
      if (w.avg_hr != null) bits.push(`avg HR ${w.avg_hr}`);
      if (w.distance_m != null) bits.push(`${(w.distance_m / 1000).toFixed(2)} km`);
      lines.push(`${w.workout_date} ${w.type ?? "workout"} - ${bits.join(", ") || "(no metrics)"}`);
    }
  }
  return lines.join("\n");
}

// Build a compact, structured context block for the model.
// Always JSON for the recent data so the model parses precisely; the
// long-term knowledge dossier is rendered as labelled markdown sections.
export function contextBlock(ctx: CoachContext): string {
  const slim = {
    today: ctx.today,
    profile: ctx.profile && {
      goals: ctx.profile.goals,
      height_cm: ctx.profile.height_cm,
      age: ctx.profile.age,
      sex: ctx.profile.sex,
      activity_level: ctx.profile.activity_level,
      dietary_preferences: ctx.profile.dietary_preferences,
      injuries_notes: ctx.profile.injuries_notes,
      coaching_style: ctx.profile.coaching_style,
    },
    recent_logs: ctx.recent_logs.map((l) => ({
      date: l.log_date,
      weight_kg: l.weight_kg,
      waist_cm: l.waist_cm,
      sleep_hours: l.sleep_hours,
      sleep_quality: l.sleep_quality,
      mood: l.mood,
      energy: l.energy,
      soreness_notes: l.soreness_notes,
      notes: l.notes,
    })),
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
    },
  };
  const recent =
    "## RECENT DATA (last 7 days)\n<context>\n" +
    JSON.stringify(slim, null, 2) +
    "\n</context>";
  const activity = activityBlock(ctx);
  const dossier = knowledgeBlock(ctx.knowledge);
  return [dossier, activity, recent].filter((s) => s).join("\n\n");
}

export function coachSystemPrompt(ctx: CoachContext): string {
  const style =
    ctx.profile?.coaching_style?.trim() ||
    "warm, direct, evidence-based; concise messages; ask one focused question at a time";
  return [
    "You are Dokes, a personal AI fitness and nutrition coach for a single user.",
    `Coaching style: ${style}.`,
    "The LONG-TERM KNOWLEDGE section reflects facts about this person that are stable over time — treat it as ground truth.",
    "The ACTIVITY DATA section reflects what the user actually did per their watch/phone (steps, sleep, HR, workouts). If they say 'I trained yesterday' but no workout is in ACTIVITY DATA from yesterday, gently flag the discrepancy. If they ask about training and ACTIVITY DATA is empty, mention they should set up Health Auto Export to give you better signal.",
    "Total calories burned per day is computed as: Mifflin-St Jeor BMR (using the user's height, age, sex, and most recent logged weight) + Active calories from their watch. If a day has no weight logged on or before it, total is not shown — gently encourage the user to log weight regularly so calorie math stays accurate.",
    "The RECENT DATA section reflects the last 7-14 days of logged behavior (profile, daily logs, meals, yesterday's plan). Use all three sources together.",
    "If long-term knowledge contradicts a single recent data point (e.g., user noted today they're bored of an exercise they previously listed as a favorite), prefer the recent data but acknowledge the shift.",
    "Be specific. Reference actual numbers from the context when relevant. Do not invent data that isn't there.",
    "Mobile chat — keep replies short. Bullet points over paragraphs. No filler preambles.",
    "If context is missing or sparse, say so briefly and suggest what to log.",
  ].join("\n");
}
