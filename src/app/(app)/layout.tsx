import { redirect } from "next/navigation";
import { isAuthedServer } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import SplashScreen from "@/components/SplashScreen";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthedServer())) redirect("/login");

  // Onboarding gate — only when not already on /onboarding (handled per-page).
  // We do a single profile fetch here for the layout shell.
  const sb = supabaseServer();
  const { data: profile } = await sb
    .from("profile")
    .select("onboarded_at")
    .eq("id", 1)
    .maybeSingle();

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
      <SplashScreen />
      <main
        className="flex-1 pb-24"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {children}
      </main>
      {profile?.onboarded_at && <BottomNav />}
    </div>
  );
}
