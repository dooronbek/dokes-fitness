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
    name?: string;
    equipment?: string;
    running_available?: boolean;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (!v) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.name = v;
  }
  if (typeof body.equipment === "string") {
    const v = body.equipment.trim();
    if (!v) return NextResponse.json({ error: "equipment cannot be empty" }, { status: 400 });
    patch.equipment = v;
  }
  if (typeof body.running_available === "boolean") {
    patch.running_available = body.running_available;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const sb = supabaseServer();
  const { data, error } = await sb
    .from("training_locations")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sb = supabaseServer();
  const { error } = await sb.from("training_locations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
