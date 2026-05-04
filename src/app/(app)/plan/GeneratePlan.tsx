"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GeneratePlan() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/plan", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error || "Couldn't generate.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 flex flex-col gap-4 items-center text-center">
      <p className="text-sm text-zinc-400">
        No plan yet for today. Dokes will read your recent logs, meals, activity, and yesterday&apos;s plan,
        then design today&apos;s session.
      </p>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3.5 px-5 disabled:opacity-50 min-h-[44px] w-full"
      >
        {busy ? "Designing your session…" : "Generate today's plan"}
      </button>
    </div>
  );
}
