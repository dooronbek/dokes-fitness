"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DailyLog } from "@/lib/types";
import { parseDecimalInput } from "@/lib/parse";

function Scale1to5({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-zinc-300 mb-1.5">{label}</label>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`min-h-[44px] rounded-xl border text-base ${
              value === n
                ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                : "bg-zinc-900 text-zinc-200 border-zinc-800"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  const btn = (active: boolean) =>
    `min-h-[44px] rounded-xl border text-base ${
      active
        ? "bg-zinc-100 text-zinc-900 border-zinc-100"
        : "bg-zinc-900 text-zinc-200 border-zinc-800"
    }`;
  return (
    <div>
      <label className="block text-sm text-zinc-300 mb-1.5">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange(true)} className={btn(value === true)}>
          Yes
        </button>
        <button type="button" onClick={() => onChange(false)} className={btn(value === false)}>
          No
        </button>
      </div>
    </div>
  );
}

export default function LogForm({
  initial,
  today,
}: {
  initial: DailyLog | null;
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({
    weight_kg: initial?.weight_kg?.toString() ?? "",
    waist_cm: initial?.waist_cm?.toString() ?? "",
    sleep_hours: initial?.sleep_hours?.toString() ?? "",
    sleep_quality: initial?.sleep_quality ?? null,
    mood: initial?.mood ?? null,
    energy: initial?.energy ?? null,
    cold_shower: initial?.cold_shower ?? null,
    stretching: initial?.stretching ?? null,
    meditation_minutes: initial?.meditation_minutes?.toString() ?? "",
    soreness_notes: initial?.soreness_notes ?? "",
    notes: initial?.notes ?? "",
  });

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((s) => ({ ...s, [k]: v }));
    setSaved(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const weight = parseDecimalInput(f.weight_kg);
    const waist = parseDecimalInput(f.waist_cm);
    const sleep = parseDecimalInput(f.sleep_hours);
    const meditation = parseDecimalInput(f.meditation_minutes);
    if (!weight.ok || !waist.ok || !sleep.ok || !meditation.ok) {
      setErr("Enter a valid number (e.g. 93.5 or 93,5).");
      return;
    }
    const meditationInt =
      meditation.value == null ? null : Math.max(0, Math.round(meditation.value));

    setBusy(true);
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        log_date: today,
        weight_kg: weight.value,
        waist_cm: waist.value,
        sleep_hours: sleep.value,
        sleep_quality: f.sleep_quality,
        mood: f.mood,
        energy: f.energy,
        cold_shower: f.cold_shower,
        stretching: f.stretching,
        meditation_minutes: meditationInt,
        soreness_notes: f.soreness_notes.trim() || null,
        notes: f.notes.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr("Couldn't save. Try again.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const inputCls =
    "w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600";
  const labelCls = "block text-sm text-zinc-300 mb-1.5";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Weight (kg)</label>
          <input
            inputMode="decimal"
            value={f.weight_kg}
            onChange={(e) => set("weight_kg", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Waist (cm)</label>
          <input
            inputMode="decimal"
            value={f.waist_cm}
            onChange={(e) => set("waist_cm", e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Sleep (hours)</label>
        <input
          inputMode="decimal"
          value={f.sleep_hours}
          onChange={(e) => set("sleep_hours", e.target.value)}
          className={inputCls}
        />
      </div>

      <Scale1to5
        label="Sleep quality (1-5)"
        value={f.sleep_quality}
        onChange={(v) => set("sleep_quality", v)}
      />
      <Scale1to5 label="Mood (1-5)" value={f.mood} onChange={(v) => set("mood", v)} />
      <Scale1to5 label="Energy (1-5)" value={f.energy} onChange={(v) => set("energy", v)} />

      <div className="flex flex-col gap-4 pt-1">
        <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
          Morning routine
        </h2>
        <YesNo
          label="Cold shower"
          value={f.cold_shower}
          onChange={(v) => set("cold_shower", v)}
        />
        <YesNo
          label="Stretching / warm-up"
          value={f.stretching}
          onChange={(v) => set("stretching", v)}
        />
        <div>
          <label className={labelCls}>Meditation (minutes)</label>
          <input
            inputMode="numeric"
            value={f.meditation_minutes}
            onChange={(e) => set("meditation_minutes", e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Soreness</label>
        <textarea
          rows={2}
          value={f.soreness_notes}
          onChange={(e) => set("soreness_notes", e.target.value)}
          placeholder="e.g. quads, lower back tight"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea
          rows={3}
          value={f.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="anything else worth flagging"
          className={inputCls}
        />
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {saved && <p className="text-sm text-emerald-400">Saved.</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3.5 disabled:opacity-50 min-h-[44px]"
      >
        {busy ? "Saving…" : initial ? "Update log" : "Save log"}
      </button>
    </form>
  );
}
