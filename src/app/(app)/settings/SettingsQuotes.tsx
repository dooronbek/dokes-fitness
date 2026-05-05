"use client";

import { useState } from "react";

type Quote = {
  id: number;
  text: string;
  author: string | null;
  source: string;
  created_at: string;
};

export default function SettingsQuotes({
  initialQuotes,
}: {
  initialQuotes: Quote[];
}) {
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function refresh() {
    const res = await fetch("/api/quotes", { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as { quotes?: Quote[] };
    setQuotes(j.quotes ?? []);
  }

  async function generate() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/quotes/generate", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        inserted?: number;
        duplicates_skipped?: number;
      };
      if (!res.ok || !j.ok) {
        setErr("Couldn't generate — try again");
      } else {
        setMsg(
          `Added ${j.inserted ?? 0} new quotes (skipped ${j.duplicates_skipped ?? 0} duplicates)`
        );
        await refresh();
      }
    } catch {
      setErr("Couldn't generate — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">Splash quotes</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          You have {quotes.length} quotes in rotation.
        </p>
      </div>

      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      {err && <p className="text-sm text-red-400">{err}</p>}

      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3 px-4 disabled:opacity-50 min-h-[44px] w-full"
      >
        {busy ? "Generating…" : "Add 10 quotes"}
      </button>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-zinc-400 underline underline-offset-2 self-start"
      >
        {expanded ? "Hide all quotes" : "View all quotes"}
      </button>

      {expanded && (
        <ul className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          {quotes.length === 0 && (
            <li className="text-xs text-zinc-500">No quotes yet.</li>
          )}
          {quotes.map((q) => (
            <li
              key={q.id}
              className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3"
            >
              <p className="text-sm text-zinc-200 leading-relaxed">{q.text}</p>
              <div className="flex items-baseline justify-between gap-2 mt-1">
                <span className="text-xs text-zinc-500">
                  {q.author ?? "—"}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                  {q.source}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
