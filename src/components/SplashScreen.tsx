"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/quotes";

const SESSION_KEY = "dokes_splash_shown";
const QUOTE_VISIBLE_MS = 3000;
const FADE_OUT_MS = 400;
const QUOTE_FADE_IN_DELAY_MS = 200;

// SSR-rendered visible by default. The inline script in (app)/layout.tsx
// sets [data-splash-skip] on <html> synchronously when the session-storage
// flag is already set, so on subsequent loads the CSS hides this overlay
// before the browser paints — no flash. On a fresh session we let the
// in/out fade play, then unmount.
export default function SplashScreen({ quote }: { quote: Quote }) {
  const [mounted, setMounted] = useState(true);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (typeof window === "undefined") return;

    let alreadyShown = false;
    try {
      alreadyShown = !!sessionStorage.getItem(SESSION_KEY);
      if (!alreadyShown) sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage may be unavailable (private mode); show splash.
    }

    if (alreadyShown) {
      setMounted(false);
      return;
    }

    const outTimer = setTimeout(() => setPhase("out"), QUOTE_VISIBLE_MS);
    const unmountTimer = setTimeout(
      () => setMounted(false),
      QUOTE_VISIBLE_MS + FADE_OUT_MS
    );
    return () => {
      clearTimeout(outTimer);
      clearTimeout(unmountTimer);
    };
  }, []);

  if (!mounted) return null;

  const overlayOpacity = phase === "out" ? "opacity-0" : "opacity-100";
  const quoteShown = phase === "in";
  const quoteState = quoteShown
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-2";
  const quoteBase =
    "transition-all ease-out duration-700 will-change-[opacity,transform]";

  return (
    <div
      data-splash-overlay
      onClick={() => setPhase("out")}
      className={`fixed inset-0 z-[100] bg-black ${overlayOpacity} transition-opacity duration-[400ms] ease-in cursor-pointer`}
      style={{
        backgroundImage:
          "radial-gradient(ellipse at top left, rgba(255,255,255,0.04), transparent 60%)",
      }}
      aria-hidden="true"
    >
      <div
        className="absolute"
        style={{
          top: "calc(env(safe-area-inset-top) + 32px)",
          left: "calc(env(safe-area-inset-left) + 32px)",
        }}
      >
        <span className="text-xs font-semibold tracking-[0.3em] text-white/70 uppercase">
          Dokes Fitness
        </span>
      </div>

      <div
        className="absolute inset-0 flex items-center"
        style={{
          paddingLeft: "calc(env(safe-area-inset-left) + 32px)",
          paddingRight: "32px",
        }}
      >
        <div className="max-w-[80%]">
          <p
            className={`${quoteBase} ${quoteState} text-3xl font-light leading-[1.3] text-white italic`}
            style={{ transitionDelay: `${QUOTE_FADE_IN_DELAY_MS}ms` }}
          >
            {quote.text}
          </p>
          {quote.author && (
            <div
              className={`${quoteBase} ${quoteState} mt-4`}
              style={{ transitionDelay: `${QUOTE_FADE_IN_DELAY_MS + 100}ms` }}
            >
              <div className="h-px w-6 bg-white/30" />
              <p className="mt-2 text-xs font-normal tracking-wider text-white/50 not-italic uppercase">
                — {quote.author}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
