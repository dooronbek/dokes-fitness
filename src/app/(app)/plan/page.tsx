import { supabaseServer } from "@/lib/supabase";
import { todayISO } from "@/lib/dates";
import GeneratePlan from "./GeneratePlan";
import PlanView from "./PlanView";
import type { TrainingPlan } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan — Dokes Fitness" };

export default async function PlanPage() {
  const sb = supabaseServer();
  const today = todayISO();
  const { data } = await sb
    .from("training_plans")
    .select("*")
    .eq("plan_date", today)
    .maybeSingle();

  const plan = (data ?? null) as TrainingPlan | null;

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto">
      <header className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-semibold">Today&apos;s plan</h1>
        <span className="text-xs text-zinc-500">{today}</span>
      </header>

      {!plan && <GeneratePlan />}
      {plan && <PlanView plan={plan} />}
    </div>
  );
}
