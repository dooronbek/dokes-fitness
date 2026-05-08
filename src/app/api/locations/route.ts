import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("training_locations")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locations: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    equipment?: string;
    running_available?: boolean;
  };
  const name = body.name?.trim();
  const equipment = body.equipment?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!equipment) {
    return NextResponse.json({ error: "equipment required" }, { status: 400 });
  }
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("training_locations")
    .insert({
      name,
      equipment,
      running_available: Boolean(body.running_available),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: data });
}
