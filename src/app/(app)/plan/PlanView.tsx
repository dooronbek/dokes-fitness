"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TrainingLocation, TrainingPlan } from "@/lib/types";
import LocationPickerModal from "./LocationPickerModal";

export default function PlanView({
  plan,
  locations,
  planLocation,
}: {
  plan: TrainingPlan;
  locations: TrainingLocation[];
  planLocation: TrainingLocation | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(plan.completion_notes ?? "");
  const [hrInput, setHrInput] = useState(
    plan.avg_hr != null ? String(plan.avg_hr) : ""
  );
  const [completing, setCompleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const busy = completing || regenerating;
  const hasLocations = locations.length > 0;

  async function complete(completed: boolean) {
    let avg_hr: number | null = null;
    if (completed && hrInput.trim()) {
      const n = Number(hrInput.trim());
      if (!Number.isInteger(n) || n < 30 || n > 220) {
        setErr("Avg HR must be a whole number between 30 and 220.");
        return;
      }
      avg_hr = n;
    }

    setCompleting(true);
    setErr(null);
    const res = await fetch(`/api/plan/${plan.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        completed,
        completion_notes: notes.trim() || null,
        avg_hr: completed ? avg_hr : null,
      }),
    });
    setCompleting(false);
    if (!res.ok) {
      setErr("Couldn't update — try again.");
      return;
    }
    router.refresh();
  }

  async function regenerate(locationId: string) {
    setRegenerating(true);
    setErr(null);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: true, location_id: locationId }),
    });
    setRegenerating(false);
    setPickerOpen(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error || "Couldn't regenerate — try again.");
      return;
    }
    router.refresh();
  }

  function startRegenerate() {
    if (!confirm("Replace today's plan with a freshly generated one?")) return;
    setPickerOpen(true);
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
        {planLocation && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-zinc-950/60 border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300">
            <span>📍 {planLocation.name}</span>
            {planLocation.running_available && (
              <span className="text-emerald-400">· 🏃</span>
            )}
          </div>
        )}
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
        <h3 className="text-sm font-medium">
          {plan.completed
            ? plan.avg_hr != null
              ? `Completed ✓ — HR avg ${plan.avg_hr} bpm`
              : "Completed ✓"
            : "Mark complete"}
        </h3>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Avg HR (optional)</span>
          <input
            type="number"
            inputMode="numeric"
            min={30}
            max={220}
            value={hrInput}
            onChange={(e) => setHrInput(e.target.value)}
            placeholder="144"
            className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600"
          />
          <span className="text-[11px] text-zinc-500">
            From your watch — leave blank if not applicable
          </span>
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How'd it go? Loads, RPE, anything to flag."
          className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600"
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        {!hasLocations && (
          <p className="text-xs text-zinc-500">
            Add a training location in{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Settings
            </Link>{" "}
            to regenerate.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => complete(!plan.completed)}
            className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3 disabled:opacity-50 min-h-[44px]"
          >
            {completing
              ? plan.completed
                ? "Reopening…"
                : "Saving…"
              : plan.completed
                ? "Reopen"
                : "Mark complete"}
          </button>
          <button
            type="button"
            disabled={busy || !hasLocations}
            onClick={startRegenerate}
            className="rounded-xl bg-zinc-800 text-zinc-100 py-3 disabled:opacity-50 min-h-[44px]"
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      <LocationPickerModal
        locations={locations}
        open={pickerOpen}
        busy={regenerating}
        onClose={() => setPickerOpen(false)}
        onPick={regenerate}
      />
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
