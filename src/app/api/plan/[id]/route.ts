import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    completed?: boolean;
    completion_notes?: string | null;
    avg_hr?: number | null;
  };

  let avg_hr: number | null = null;
  if (body.avg_hr != null) {
    const n = Number(body.avg_hr);
    if (!Number.isInteger(n) || n < 30 || n > 220) {
      return NextResponse.json(
        { error: "avg_hr must be an integer between 30 and 220" },
        { status: 400 }
      );
    }
    avg_hr = n;
  }

  const sb = supabaseServer();
  const { error } = await sb
    .from("training_plans")
    .update({
      completed: body.completed ?? false,
      completion_notes: body.completion_notes ?? null,
      avg_hr,
    })
    .eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
