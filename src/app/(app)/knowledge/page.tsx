import { supabaseServer } from "@/lib/supabase";
import KnowledgeClient from "./KnowledgeClient";
import type { DossierStats, PersonalRecord, UserProfile } from "@/lib/types";

export const metadata = { title: "Knowledge — Dokes Fitness" };
export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const sb = supabaseServer();
  const [profileRes, prsRes, statsRes] = await Promise.all([
    sb.from("user_profile").select("*").eq("id", 1).maybeSingle(),
    sb.from("personal_records").select("*").order("exercise", { ascending: true }),
    sb
      .from("dossier_stats")
      .select("midterm, longterm, computed_at")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const profile = (profileRes.data ?? null) as UserProfile | null;
  const prs = (prsRes.data ?? []) as PersonalRecord[];
  const stats: DossierStats = statsRes.data
    ? {
        midterm: statsRes.data.midterm,
        longterm: statsRes.data.longterm,
        computed_at: statsRes.data.computed_at,
      }
    : { midterm: null, longterm: null, computed_at: null };

  return (
    <div className="px-5 pt-8 pb-12 max-w-2xl mx-auto flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Coach knowledge</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Long-term context Dokes uses on every plan, chat, and meal estimate.
        </p>
      </header>
      <KnowledgeClient initialProfile={profile} initialPRs={prs} initialStats={stats} />
    </div>
  );
}
