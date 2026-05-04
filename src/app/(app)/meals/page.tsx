import { supabaseServer } from "@/lib/supabase";
import { todayISO } from "@/lib/dates";
import AddMeal from "./AddMeal";
import type { Meal } from "@/lib/types";
import DeleteMealButton from "./DeleteMealButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meals — Dokes Fitness" };

function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toString();
}

export default async function MealsPage() {
  const sb = supabaseServer();
  const today = todayISO();
  const { data } = await sb
    .from("meals")
    .select("*")
    .eq("meal_date", today)
    .order("created_at", { ascending: true });

  const meals = (data ?? []) as Meal[];
  const totals = meals.reduce(
    (a, m) => ({
      kcal: a.kcal + (m.calories ?? 0),
      p: a.p + (m.protein_g ?? 0),
      c: a.c + (m.carbs_g ?? 0),
      f: a.f + (m.fat_g ?? 0),
    }),
    { kcal: 0, p: 0, c: 0, f: 0 }
  );

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Meals</h1>
        <span className="text-xs text-zinc-500">{today}</span>
      </header>

      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4 grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[11px] text-zinc-500">kcal</div>
          <div className="text-lg font-semibold">{num(totals.kcal)}</div>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500">P</div>
          <div className="text-lg font-semibold">{num(totals.p)}g</div>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500">C</div>
          <div className="text-lg font-semibold">{num(totals.c)}g</div>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500">F</div>
          <div className="text-lg font-semibold">{num(totals.f)}g</div>
        </div>
      </div>

      <AddMeal />

      <div className="flex flex-col gap-3">
        {meals.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-6">No meals yet today.</p>
        )}
        {meals.map((m) => (
          <article
            key={m.id}
            className="rounded-2xl bg-zinc-900/70 border border-zinc-800 overflow-hidden"
          >
            {m.photo_url && (
              // Using <img> intentionally — meal photos are user-uploaded blobs
              // from Supabase Storage; sizing is fluid.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.photo_url}
                alt={m.description ?? "Meal"}
                className="w-full max-h-64 object-cover"
              />
            )}
            <div className="p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.description || m.user_text || "Meal"}
                  </div>
                  {m.ai_confidence && (
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500 mt-0.5">
                      confidence: {m.ai_confidence}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold">
                    {num(m.calories)}
                    <span className="text-xs text-zinc-500 ml-1">kcal</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs text-zinc-400">
                <div>P {num(m.protein_g)}g</div>
                <div>C {num(m.carbs_g)}g</div>
                <div>F {num(m.fat_g)}g</div>
              </div>
              {m.ai_notes && (
                <p className="text-xs text-zinc-500 leading-relaxed">{m.ai_notes}</p>
              )}
              <DeleteMealButton id={m.id!} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
