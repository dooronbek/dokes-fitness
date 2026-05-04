import { supabaseServer } from "./supabase";
import { daysAgoISO, todayISO } from "./dates";
import type {
  Activity,
  CoachMessage,
  DailyLog,
  Meal,
  Profile,
  TrainingPlan,
} from "./types";

export type CoachContext = {
  profile: Profile | null;
  today: string;
  recent_logs: DailyLog[];
  recent_meals: Meal[];
  recent_activity: Activity[];
  yesterday_plan: TrainingPlan | null;
  recent_messages: CoachMessage[];
};

export async function loadCoachContext(opts?: {
  includeMessages?: boolean;
  messageLimit?: number;
}): Promise<CoachContext> {
  const sb = supabaseServer();
  const today = todayISO();
  const since = daysAgoISO(7);
  const yesterday = daysAgoISO(1);

  const [
    profileRes,
    logsRes,
    mealsRes,
    activityRes,
    yPlanRes,
    msgsRes,
  ] = await Promise.all([
    sb.from("profile").select("*").eq("id", 1).maybeSingle(),
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
      .from("activity")
      .select("*")
      .gte("activity_date", since)
      .order("activity_date", { ascending: true }),
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

  return {
    profile: (profileRes.data ?? null) as Profile | null,
    today,
    recent_logs: (logsRes.data ?? []) as DailyLog[],
    recent_meals: (mealsRes.data ?? []) as Meal[],
    recent_activity: (activityRes.data ?? []) as Activity[],
    yesterday_plan: (yPlanRes.data ?? null) as TrainingPlan | null,
    recent_messages,
  };
}

// Build a compact, structured context block for the model.
// Always JSON so the model parses precisely instead of guessing.
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
    recent_activity: ctx.recent_activity.map((a) => ({
      date: a.activity_date,
      type: a.type,
      duration_min: a.duration_min,
      calories: a.calories,
      steps: a.steps,
      avg_hr: a.avg_hr,
      source: a.source,
    })),
    yesterday_plan: ctx.yesterday_plan && {
      focus: ctx.yesterday_plan.focus,
      total_minutes: ctx.yesterday_plan.total_minutes,
      main: ctx.yesterday_plan.main,
      completed: ctx.yesterday_plan.completed,
      completion_notes: ctx.yesterday_plan.completion_notes,
    },
  };
  return "<context>\n" + JSON.stringify(slim, null, 2) + "\n</context>";
}

export function coachSystemPrompt(ctx: CoachContext): string {
  const style =
    ctx.profile?.coaching_style?.trim() ||
    "warm, direct, evidence-based; concise messages; ask one focused question at a time";
  return [
    "You are Dokes, a personal AI fitness and nutrition coach for a single user.",
    `Coaching style: ${style}.`,
    "Use the structured <context> block as ground truth for the user's profile, recent daily logs (sleep, mood, weight, soreness), meals, activity, and yesterday's plan.",
    "Be specific. Reference actual numbers from the context when relevant. Do not invent data that isn't there.",
    "Mobile chat — keep replies short. Bullet points over paragraphs. No filler preambles.",
    "If context is missing or sparse, say so briefly and suggest what to log.",
  ].join("\n");
}
