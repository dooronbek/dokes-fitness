import { supabaseServer } from "@/lib/supabase";
import { todayISO } from "@/lib/dates";
import LogForm from "./LogForm";
import type { DailyLog } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log — Dokes Fitness" };

export default async function LogPage() {
  const sb = supabaseServer();
  const today = todayISO();
  const { data } = await sb
    .from("daily_log")
    .select("*")
    .eq("log_date", today)
    .maybeSingle();

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Morning check-in</h1>
      <p className="text-xs text-zinc-500 mb-5">{today}</p>
      <LogForm initial={(data ?? null) as DailyLog | null} today={today} />
    </div>
  );
}
