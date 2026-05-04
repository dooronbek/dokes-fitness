import { supabaseServer } from "@/lib/supabase";
import { daysAgoISO, formatShort } from "@/lib/dates";
import { getCalorieBreakdownRange } from "@/lib/calories";
import type { ActivityDaily, Workout } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity — Dokes Fitness" };

function formatHours(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

function fmtNum(n: number | null | undefined, suffix = ""): string {
  if (n == null) return "—";
  return `${n.toLocaleString()}${suffix}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export default async function ActivityPage() {
  const sb = supabaseServer();
  const since = daysAgoISO(13);

  const [dailyRes, workoutsRes] = await Promise.all([
    sb
      .from("activity_daily")
      .select("*")
      .gte("activity_date", since)
      .order("activity_date", { ascending: false }),
    sb
      .from("workouts")
      .select("*")
      .gte("workout_date", since)
      .order("started_at", { ascending: false }),
  ]);

  const daily = (dailyRes.data ?? []) as ActivityDaily[];
  const workouts = (workoutsRes.data ?? []) as Workout[];

  // Compute BMR + total calories per day. HAE's basal_energy_burned was
  // unreliable (multi-source double-counting), so we run Mifflin-St Jeor
  // ourselves against the latest logged weight. See src/lib/calories.ts.
  const breakdowns = await getCalorieBreakdownRange(
    daily.map((d) => d.activity_date)
  );
  const breakdownByDate = new Map(breakdowns.map((b) => [b.date, b]));

  const empty = daily.length === 0 && workouts.length === 0;

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Activity</h1>
      <p className="text-xs text-zinc-500 mb-5">Last 14 days</p>

      {empty && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          No activity synced yet. Set up Health Auto Export on your iPhone to begin.
        </div>
      )}

      {daily.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-2">
            Daily summaries
          </h2>
          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/60 text-zinc-400">
                <tr>
                  <th className="text-left px-2 py-2 font-normal">Date</th>
                  <th className="text-right px-1 py-2 font-normal">Steps</th>
                  <th className="text-right px-1 py-2 font-normal">Active</th>
                  <th className="text-right px-1 py-2 font-normal">BMR</th>
                  <th className="text-right px-1 py-2 font-normal">Total</th>
                  <th className="text-right px-1 py-2 font-normal">Sleep</th>
                  <th className="text-right px-2 py-2 font-normal">HR</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d) => {
                  const cb = breakdownByDate.get(d.activity_date);
                  const tooltip =
                    cb && !cb.computable
                      ? cb.reason_if_not === "no_weight_logged"
                        ? "Log your weight to see total calories burned"
                        : "Profile incomplete (height/age/sex)"
                      : undefined;
                  return (
                    <tr key={d.id} className="border-t border-zinc-800">
                      <td className="px-2 py-2 text-zinc-300">
                        {formatShort(d.activity_date)}
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums">
                        {fmtNum(d.steps)}
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums">
                        {fmtNum(d.active_calories)}
                      </td>
                      <td
                        className="px-1 py-2 text-right tabular-nums text-zinc-400"
                        title={tooltip}
                      >
                        {cb?.computable ? fmtNum(cb.bmr) : "—"}
                      </td>
                      <td
                        className="px-1 py-2 text-right tabular-nums font-medium"
                        title={tooltip}
                      >
                        {cb?.computable ? fmtNum(cb.total) : "—"}
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums">
                        {d.sleep_minutes != null
                          ? `${(d.sleep_minutes / 60).toFixed(1)}h`
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmtNum(d.avg_hr)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {workouts.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-2">
            Workouts
          </h2>
          <ul className="flex flex-col gap-2">
            {workouts.map((w) => (
              <li
                key={w.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-base font-medium capitalize">
                      {w.type ?? "workout"}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {formatShort(w.workout_date)} · {fmtTime(w.started_at)}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400 tabular-nums">
                    {formatHours(w.duration_min)}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-zinc-400">
                  <div>
                    <div className="text-zinc-500">kcal</div>
                    <div className="text-zinc-200 tabular-nums">
                      {fmtNum(w.active_calories ?? w.total_calories)}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500">avg HR</div>
                    <div className="text-zinc-200 tabular-nums">{fmtNum(w.avg_hr)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">distance</div>
                    <div className="text-zinc-200 tabular-nums">
                      {w.distance_m != null ? `${(w.distance_m / 1000).toFixed(2)} km` : "—"}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
