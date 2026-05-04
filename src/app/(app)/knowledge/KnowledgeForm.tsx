"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CoachKnowledge } from "@/lib/types";

type FieldKey =
  | "background"
  | "current_state"
  | "personal_records"
  | "goals_short_term"
  | "goals_long_term"
  | "injuries"
  | "constraints"
  | "diet_reality"
  | "preferences"
  | "lifestyle"
  | "freeform";

const FIELDS: { key: FieldKey; label: string; helper: string }[] = [
  {
    key: "background",
    label: "Background",
    helper:
      "Years training, kinds of training, peak vs now, detraining periods.",
  },
  {
    key: "current_state",
    label: "Current state",
    helper:
      "Honest snapshot today. Body comp roughly. Current routine.",
  },
  {
    key: "personal_records",
    label: "Personal records",
    helper:
      "Lifts (bench, squat, deadlift, OHP, pullups), running times, anything else. Date achieved if known.",
  },
  {
    key: "goals_short_term",
    label: "Short-term goals",
    helper: "Next 2–3 months. Specific, numerical when possible.",
  },
  {
    key: "goals_long_term",
    label: "Long-term goals",
    helper: "1+ year. The bigger why.",
  },
  {
    key: "injuries",
    label: "Injuries",
    helper:
      "Current and historical. What aggravates them. Conditions affecting training.",
  },
  {
    key: "constraints",
    label: "Constraints",
    helper:
      "Equipment access, time per week available, schedule rhythm.",
  },
  {
    key: "diet_reality",
    label: "Diet reality",
    helper:
      "Typical day's food, allergies/intolerances, won't-eats, cooking ability, eating-out frequency, alcohol pattern.",
  },
  {
    key: "preferences",
    label: "Preferences / psychology",
    helper:
      "What's worked in the past, what hasn't. Demotivators, motivators. How directive coaching should be.",
  },
  {
    key: "lifestyle",
    label: "Lifestyle",
    helper:
      "Job, sleep average (real not aspirational), family/schedule, stress level.",
  },
  {
    key: "freeform",
    label: "Freeform",
    helper: "Anything else.",
  },
];

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KnowledgeForm({
  initial,
  showSkip,
}: {
  initial: CoachKnowledge | null;
  showSkip: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(
    initial?.updated_at ?? null
  );
  const [savedFlash, setSavedFlash] = useState(false);

  const [form, setForm] = useState<Record<FieldKey, string>>(() => {
    const obj = {} as Record<FieldKey, string>;
    for (const f of FIELDS) {
      obj[f.key] = (initial?.[f.key] as string | null) ?? "";
    }
    return obj;
  });

  function set(k: FieldKey, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSavedFlash(false);
    setBusy(true);

    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        hint?: string;
        details?: string;
      };
      setErr(
        [j.error, j.code && `(${j.code})`, j.hint, j.details]
          .filter(Boolean)
          .join(" — ") || "Couldn't save. Try again."
      );
      setBusy(false);
      return;
    }
    const j = (await res.json()) as { knowledge?: CoachKnowledge };
    setUpdatedAt(j.knowledge?.updated_at ?? new Date().toISOString());
    setSavedFlash(true);
    setBusy(false);
    router.refresh();
  }

  const taCls =
    "w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-[15px] outline-none focus:border-zinc-600 font-mono leading-relaxed";
  const labelCls = "block text-sm font-medium text-zinc-200 mb-1";
  const helperCls = "block text-xs text-zinc-500 mb-1.5";

  const lastSaved = fmtDate(updatedAt);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label className={labelCls} htmlFor={f.key}>
            {f.label}
          </label>
          <span className={helperCls}>{f.helper}</span>
          <textarea
            id={f.key}
            rows={6}
            value={form[f.key]}
            onChange={(e) => set(f.key, e.target.value)}
            className={taCls}
          />
        </div>
      ))}

      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="flex flex-col gap-2 mt-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3.5 disabled:opacity-50 min-h-[44px]"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
          <span>
            {savedFlash && !busy
              ? "Saved."
              : lastSaved
                ? `Last updated: ${lastSaved}`
                : "Not saved yet."}
          </span>
          {showSkip && (
            <Link href="/" className="text-zinc-500 underline underline-offset-2">
              Skip for now
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}
