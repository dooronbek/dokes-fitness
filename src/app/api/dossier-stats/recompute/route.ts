import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { computeDossierStats } from "@/lib/dossier-stats";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = supabaseServer();
  const stats = await computeDossierStats(sb);
  const { error } = await sb
    .from("dossier_stats")
    .upsert(
      {
        id: 1,
        midterm: stats.midterm,
        longterm: stats.longterm,
        computed_at: stats.computed_at,
      },
      { onConflict: "id" }
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ stats });
}
