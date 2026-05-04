import { supabaseServer } from "@/lib/supabase";
import KnowledgeForm from "./KnowledgeForm";
import type { CoachKnowledge } from "@/lib/types";

export const metadata = { title: "Knowledge — Dokes Fitness" };
export const dynamic = "force-dynamic";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const sp = await searchParams;
  const welcome = sp.welcome === "1";

  const sb = supabaseServer();
  const { data } = await sb
    .from("coach_knowledge")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return (
    <div className="px-5 pt-8 pb-12 max-w-xl mx-auto">
      {welcome && (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 mb-5">
          <div className="text-base font-medium mb-1">
            Now tell me about your fitness life.
          </div>
          <p className="text-sm text-zinc-400">
            The more you share, the better I can coach you. You can edit this
            anytime.
          </p>
        </div>
      )}
      <h1 className="text-2xl font-semibold mb-1">Coach knowledge</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Long-term context I use on every chat, plan, and meal estimate.
      </p>
      <KnowledgeForm
        initial={(data ?? null) as CoachKnowledge | null}
        showSkip={welcome}
      />
    </div>
  );
}
