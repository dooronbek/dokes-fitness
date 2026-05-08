import { redirect } from "next/navigation";
import { isAuthedServer } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";
import SplashScreen from "@/components/SplashScreen";
import { getRandomQuote } from "@/lib/quotes";

// Inline script: if sessionStorage flag is set, mark <html> so CSS can
// hide the SSR'd splash overlay synchronously — before first paint — on
// subsequent loads within the same session.
const SPLASH_SKIP_SCRIPT = `try{if(sessionStorage.getItem('dokes_splash_shown'))document.documentElement.setAttribute('data-splash-skip','1')}catch(e){}`;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthedServer())) redirect("/login");

  const quote = await getRandomQuote();

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
      <script dangerouslySetInnerHTML={{ __html: SPLASH_SKIP_SCRIPT }} />
      <SplashScreen quote={quote} />
      <main
        className="flex-1 pb-24"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
