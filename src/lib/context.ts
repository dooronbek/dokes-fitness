import { supabaseServer } from "./supabase";
import { daysAgoISO, todayISO } from "./dates";
import type {
  Activity,
  CoachKnowledge,
  CoachMessage,
  DailyLog,
  Meal,
  Profile,
  TrainingPlan,
} from "./types";

export type CoachContext = {
  profile: Profile | null;
  knowledge: CoachKnowledge | null;
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
    knowledgeRes,
    logsRes,
    mealsRes,
    activityRes,
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
    knowledge: (knowledgeRes.data ?? null) as CoachKnowledge | null,
    today,
    recent_logs: (logsRes.data ?? []) as DailyLog[],
    recent_meals: (mealsRes.data ?? []) as Meal[],
    recent_activity: (activityRes.data ?? []) as Activity[],
    yesterday_plan: (yPlanRes.data ?? null) as TrainingPlan | null,
    recent_messages,
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
  const recent =
    "## RECENT DATA (last 7 days)\n<context>\n" +
    JSON.stringify(slim, null, 2) +
    "\n</context>";
  const dossier = knowledgeBlock(ctx.knowledge);
  return dossier ? `${dossier}\n\n${recent}` : recent;
}

export function coachSystemPrompt(ctx: CoachContext): string {
  const style =
    ctx.profile?.coaching_style?.trim() ||
    "warm, direct, evidence-based; concise messages; ask one focused question at a time";
  return [
    "You are Dokes, a personal AI fitness and nutrition coach for a single user.",
    `Coaching style: ${style}.`,
    "The LONG-TERM KNOWLEDGE section reflects facts about this person that are stable over time — treat it as ground truth.",
    "The RECENT DATA section reflects the last 7-14 days of logged behavior (profile, daily logs, meals, activity, yesterday's plan). Use both.",
    "If long-term knowledge contradicts a single recent data point (e.g., user noted today they're bored of an exercise they previously listed as a favorite), prefer the recent data but acknowledge the shift.",
    "Be specific. Reference actual numbers from the context when relevant. Do not invent data that isn't there.",
    "Mobile chat — keep replies short. Bullet points over paragraphs. No filler preambles.",
    "If context is missing or sparse, say so briefly and suggest what to log.",
  ].join("\n");
}
