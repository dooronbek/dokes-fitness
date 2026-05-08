import { supabaseServer } from "@/lib/supabase";
import { todayISO } from "@/lib/dates";
import GeneratePlan from "./GeneratePlan";
import PlanView from "./PlanView";
import type { TrainingLocation, TrainingPlan } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan — Dokes Fitness" };

export default async function PlanPage() {
  const sb = supabaseServer();
  const today = todayISO();
  const [planRes, locsRes] = await Promise.all([
    sb.from("training_plans").select("*").eq("plan_date", today).maybeSingle(),
    sb
      .from("training_locations")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  const plan = (planRes.data ?? null) as TrainingPlan | null;
  const locations = (locsRes.data ?? []) as TrainingLocation[];
  const planLocation = plan?.location_id
    ? locations.find((l) => l.id === plan.location_id) ?? null
    : null;

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto">
      <header className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-semibold">Today&apos;s plan</h1>
        <span className="text-xs text-zinc-500">{today}</span>
      </header>

      {!plan && <GeneratePlan locations={locations} />}
      {plan && (
        <PlanView plan={plan} locations={locations} planLocation={planLocation} />
      )}
    </div>
  );
}
