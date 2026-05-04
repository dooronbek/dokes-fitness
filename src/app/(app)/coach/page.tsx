import { supabaseServer } from "@/lib/supabase";
import CoachChat from "./CoachChat";
import type { CoachMessage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coach — Dokes Fitness" };

export default async function CoachPage() {
  const sb = supabaseServer();
  const { data } = await sb
    .from("coach_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  const messages = ((data ?? []) as CoachMessage[]).slice().reverse();

  return <CoachChat initialMessages={messages} />;
}
