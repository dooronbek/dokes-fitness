import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import OnboardingForm from "./OnboardingForm";

export const metadata = { title: "Setup — Dokes Fitness" };

export default async function OnboardingPage() {
  const sb = supabaseServer();
  const { data: profile } = await sb
    .from("profile")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (profile?.onboarded_at) redirect("/");

  return (
    <div className="px-5 pt-8 pb-12 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Welcome to Dokes</h1>
      <p className="text-sm text-zinc-400 mb-6">
        A few quick details so your coach can be useful from day one.
      </p>
      <OnboardingForm initial={profile ?? null} />
    </div>
  );
}
