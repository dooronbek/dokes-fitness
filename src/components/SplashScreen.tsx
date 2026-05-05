"use client";

import { useEffect, useState } from "react";

const FALLBACK = {
  text: "Today: one rep, one meal, one decision better than yesterday.",
  author: null as string | null,
};

const SESSION_KEY = "dokes_splash_shown";
const QUOTE_VISIBLE_MS = 2200;
const FADE_OUT_MS = 400;
const QUOTE_FADE_IN_DELAY_MS = 200;

type Quote = { text: string; author: string | null };

export default function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [phase, setPhase] = useState<"hidden" | "in" | "out">("hidden");

  // Decide whether to show on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage may be unavailable (private mode); show splash anyway.
    }
    setMounted(true);
  }, []);

  // Fetch a random quote once we've decided to mount.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quotes/random", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const j = (await res.json()) as { text: string | null; author: string | null };
        if (cancelled) return;
        if (j.text) {
          setQuote({ text: j.text, author: j.author });
        } else {
          setQuote(FALLBACK);
        }
      } catch {
        if (!cancelled) setQuote(FALLBACK);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  // Orchestrate fade in / hold / fade out once the quote is loaded.
  useEffect(() => {
    if (!mounted || !quote) return;
    setPhase("in");
    const outTimer = setTimeout(() => setPhase("out"), QUOTE_VISIBLE_MS);
    return () => clearTimeout(outTimer);
  }, [mounted, quote]);

  // Unmount after the fade-out completes.
  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => setMounted(false), FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (!mounted) return null;

  const overlayOpacity = phase === "out" ? "opacity-0" : "opacity-100";
  const wordmarkBase = "transition-opacity ease-out duration-700";
  const wordmarkOpacity = phase === "hidden" ? "opacity-0" : "opacity-100";
  const quoteShown = phase === "in" && !!quote;
  const quoteBase =
    "transition-all ease-out duration-700 will-change-[opacity,transform]";
  const quoteState = quoteShown
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-2";

  return (
    <div
      onClick={() => setPhase("out")}
      className={`fixed inset-0 z-[100] bg-black ${overlayOpacity} transition-opacity duration-[400ms] ease-in cursor-pointer`}
      style={{
        // Subtle radial gradient for depth on top of solid black.
        backgroundImage:
          "radial-gradient(ellipse at top left, rgba(255,255,255,0.04), transparent 60%)",
      }}
      aria-hidden="true"
    >
      <div
        className={`absolute ${wordmarkBase} ${wordmarkOpacity}`}
        style={{
          top: "calc(env(safe-area-inset-top) + 32px)",
          left: "calc(env(safe-area-inset-left) + 32px)",
          transitionDelay: `${QUOTE_FADE_IN_DELAY_MS - 200}ms`,
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
            {quote?.text ?? ""}
          </p>
          {quote?.author && (
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
