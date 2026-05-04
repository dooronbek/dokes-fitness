"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";
import { parseDecimalInput } from "@/lib/parse";

const ACTIVITY = [
  "sedentary",
  "lightly active",
  "moderately active",
  "very active",
  "athlete",
];

const STYLES = [
  "warm and encouraging",
  "direct and no-nonsense",
  "data-driven and analytical",
  "tough-love drill sergeant",
  "patient and educational",
];

export default function OnboardingForm({ initial }: { initial: Profile | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    goals: initial?.goals ?? "",
    height_cm: initial?.height_cm?.toString() ?? "",
    age: initial?.age?.toString() ?? "",
    sex: initial?.sex ?? "",
    activity_level: initial?.activity_level ?? "moderately active",
    dietary_preferences: initial?.dietary_preferences ?? "",
    injuries_notes: initial?.injuries_notes ?? "",
    coaching_style: initial?.coaching_style ?? "warm and encouraging",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const height = parseDecimalInput(form.height_cm);
    if (!height.ok) {
      setErr("Enter a valid height (e.g. 180 or 180,5).");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goals: form.goals.trim() || null,
        height_cm: height.value,
        age: form.age ? Number(form.age) : null,
        sex: form.sex.trim() || null,
        activity_level: form.activity_level || null,
        dietary_preferences: form.dietary_preferences.trim() || null,
        injuries_notes: form.injuries_notes.trim() || null,
        coaching_style: form.coaching_style || null,
        finish: true,
      }),
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
    router.replace("/");
    router.refresh();
  }

  const inputCls =
    "w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600";
  const labelCls = "block text-sm text-zinc-300 mb-1.5";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div>
        <label className={labelCls}>Goals</label>
        <textarea
          rows={3}
          value={form.goals}
          onChange={(e) => set("goals", e.target.value)}
          placeholder="e.g. lose 8kg by August, get back to running 5k under 25min"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Height (cm)</label>
          <input
            inputMode="decimal"
            value={form.height_cm}
            onChange={(e) => set("height_cm", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Age</label>
          <input
            inputMode="numeric"
            value={form.age}
            onChange={(e) => set("age", e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Sex</label>
        <select
          value={form.sex}
          onChange={(e) => set("sex", e.target.value)}
          className={inputCls}
        >
          <option value="">—</option>
          <option value="male">male</option>
          <option value="female">female</option>
          <option value="other">other</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Activity level</label>
        <select
          value={form.activity_level}
          onChange={(e) => set("activity_level", e.target.value)}
          className={inputCls}
        >
          {ACTIVITY.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Dietary preferences</label>
        <textarea
          rows={2}
          value={form.dietary_preferences}
          onChange={(e) => set("dietary_preferences", e.target.value)}
          placeholder="e.g. high protein, no pork, lactose-sensitive"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Injuries / things to work around</label>
        <textarea
          rows={2}
          value={form.injuries_notes}
          onChange={(e) => set("injuries_notes", e.target.value)}
          placeholder="e.g. left knee meniscus, mild lower back"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Coaching style</label>
        <select
          value={form.coaching_style}
          onChange={(e) => set("coaching_style", e.target.value)}
          className={inputCls}
        >
          {STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3.5 disabled:opacity-50 min-h-[44px]"
      >
        {busy ? "Saving…" : "Start coaching"}
      </button>
    </form>
  );
}
