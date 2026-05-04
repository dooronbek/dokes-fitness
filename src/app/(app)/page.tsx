import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { daysAgoISO, todayISO } from "@/lib/dates";
import TrendChart from "@/components/TrendChart";
import type { DailyLog, Meal, TrainingPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = supabaseServer();

  const { data: profile } = await sb
    .from("profile")
    .select("onboarded_at, goals, coaching_style")
    .eq("id", 1)
    .maybeSingle();

  if (!profile?.onboarded_at) redirect("/onboarding");

  const today = todayISO();
  const since30 = daysAgoISO(30);
  const weekStart = daysAgoISO(6);

  const [logsRes, mealsRes, planRes, todayLogRes] = await Promise.all([
    sb
      .from("daily_log")
      .select("log_date, weight_kg, waist_cm")
      .gte("log_date", since30)
      .order("log_date", { ascending: true }),
    sb
      .from("meals")
      .select("meal_date, calories")
      .gte("meal_date", weekStart),
    sb.from("training_plans").select("*").eq("plan_date", today).maybeSingle(),
    sb.from("daily_log").select("id").eq("log_date", today).maybeSingle(),
  ]);

  const logs = (logsRes.data ?? []) as Pick<DailyLog, "log_date" | "weight_kg" | "waist_cm">[];
  const meals = (mealsRes.data ?? []) as Pick<Meal, "meal_date" | "calories">[];
  const plan = (planRes.data ?? null) as TrainingPlan | null;
  const todayLogged = !!todayLogRes.data;

  const weightPoints = logs.map((l) => ({ date: l.log_date, value: l.weight_kg }));
  const waistPoints = logs.map((l) => ({ date: l.log_date, value: l.waist_cm }));

  // Weekly calorie totals by day
  const dayTotals = new Map<string, number>();
  for (const m of meals) {
    if (m.calories == null) continue;
    dayTotals.set(m.meal_date, (dayTotals.get(m.meal_date) ?? 0) + m.calories);
  }
  const todayKcal = dayTotals.get(today) ?? 0;
  const sumKcal = Array.from(dayTotals.values()).reduce((a, b) => a + b, 0);
  const days = dayTotals.size || 1;
  const avgKcal = Math.round(sumKcal / days);

  const trainingStatus: "completed" | "planned" | "none" =
    plan?.completed ? "completed" : plan ? "planned" : "none";

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Today</h1>
        <span className="text-xs text-zinc-500">{today}</span>
      </header>

      {!todayLogged && (
        <Link
          href="/log"
          className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-4 flex items-center justify-between min-h-[64px]"
        >
          <div>
            <div className="text-base font-medium">Morning check-in</div>
            <div className="text-xs text-zinc-400">Weight, sleep, mood — 60 seconds.</div>
          </div>
          <span className="text-zinc-400">→</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-3">
        <TrendChart title="Weight" unit="kg" points={weightPoints} accent="#60a5fa" />
        <TrendChart title="Waist" unit="cm" points={waistPoints} accent="#34d399" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
          <div className="text-xs text-zinc-400">Today calories</div>
          <div className="text-2xl font-semibold mt-1">{todayKcal}</div>
          <div className="text-[11px] text-zinc-500">kcal logged</div>
        </div>
        <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
          <div className="text-xs text-zinc-400">7-day avg</div>
          <div className="text-2xl font-semibold mt-1">{avgKcal}</div>
          <div className="text-[11px] text-zinc-500">kcal / logged day</div>
        </div>
      </div>

      <Link
        href="/plan"
        className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 flex items-center justify-between min-h-[64px]"
      >
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Training</div>
          <div className="text-base font-medium mt-1">
            {trainingStatus === "completed" && "Done ✓"}
            {trainingStatus === "planned" && (plan?.focus || "Planned")}
            {trainingStatus === "none" && "No plan yet"}
          </div>
          {plan?.total_minutes && trainingStatus !== "none" && (
            <div className="text-xs text-zinc-400 mt-0.5">~{plan.total_minutes} min</div>
          )}
        </div>
        <span className="text-zinc-400">→</span>
      </Link>

      <Link
        href="/meals"
        className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 flex items-center justify-between min-h-[56px]"
      >
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Meals</div>
          <div className="text-base font-medium mt-1">Add a meal</div>
        </div>
        <span className="text-zinc-400">→</span>
      </Link>
    </div>
  );
}
