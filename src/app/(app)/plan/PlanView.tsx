"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TrainingPlan } from "@/lib/types";

export default function PlanView({ plan }: { plan: TrainingPlan }) {
  const router = useRouter();
  const [notes, setNotes] = useState(plan.completion_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function complete(completed: boolean) {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/plan/${plan.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed, completion_notes: notes.trim() || null }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr("Couldn't update.");
      return;
    }
    router.refresh();
  }

  async function regenerate() {
    if (!confirm("Replace today's plan with a freshly generated one?")) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ replace: true }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error || "Couldn't regenerate.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{plan.focus ?? "Today"}</h2>
          {plan.total_minutes && (
            <span className="text-xs text-zinc-400">~{plan.total_minutes} min</span>
          )}
        </div>
        {plan.friendly_text && (
          <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap leading-relaxed">
            {plan.friendly_text}
          </p>
        )}
        {plan.why && (
          <p className="text-xs text-zinc-500 mt-3 italic">Why: {plan.why}</p>
        )}
      </div>

      {plan.warmup && (
        <Section title="Warmup">
          <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{plan.warmup}</p>
        </Section>
      )}

      {plan.main && plan.main.length > 0 && (
        <Section title="Main">
          <ul className="flex flex-col gap-3">
            {plan.main.map((ex, i) => (
              <li key={i} className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{ex.exercise}</span>
                  <span className="text-xs text-zinc-400">
                    {ex.sets ?? "—"} × {ex.reps ?? "—"}
                  </span>
                </div>
                {ex.load_guidance && (
                  <div className="text-xs text-zinc-400 mt-1">Load: {ex.load_guidance}</div>
                )}
                {ex.notes && (
                  <div className="text-xs text-zinc-500 mt-1">{ex.notes}</div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {plan.cooldown && (
        <Section title="Cooldown">
          <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{plan.cooldown}</p>
        </Section>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 flex flex-col gap-3">
        <h3 className="text-sm font-medium">{plan.completed ? "Completed" : "Mark complete"}</h3>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How'd it go? Loads, RPE, anything to flag."
          className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600"
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => complete(!plan.completed)}
            className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3 disabled:opacity-50 min-h-[44px]"
          >
            {plan.completed ? "Reopen" : "Mark done"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={regenerate}
            className="rounded-xl bg-zinc-800 text-zinc-100 py-3 disabled:opacity-50 min-h-[44px]"
          >
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <h3 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{title}</h3>
      {children}
    </section>
  );
}
