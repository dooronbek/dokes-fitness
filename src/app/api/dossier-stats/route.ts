import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import type { DossierStats } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("dossier_stats")
    .select("midterm, longterm, computed_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const stats: DossierStats = data
    ? {
        midterm: data.midterm,
        longterm: data.longterm,
        computed_at: data.computed_at,
      }
    : { midterm: null, longterm: null, computed_at: null };
  return NextResponse.json({ stats });
}
