"use client";

import { useState } from "react";
import type { UserProfile } from "@/lib/types";

type FormState = {
  name: string;
  age: string;
  height_cm: string;
  sex: "" | "male" | "female" | "other";
  primary_goal_short: string;
  primary_goal_long: string;
  athletic_background: string;
  current_state: string;
  lifestyle: string;
  preferred_training_days_per_week: string;
  preferred_session_minutes: string;
  equipment_constraints_general: string;
  preferences_psychology: string;
  diet_pattern: string;
  injuries_active: string;
  injuries_history: string;
  other_conditions: string;
};

function fromProfile(p: UserProfile | null): FormState {
  return {
    name: p?.name ?? "",
    age: p?.age != null ? String(p.age) : "",
    height_cm: p?.height_cm != null ? String(p.height_cm) : "",
    sex: (p?.sex ?? "") as FormState["sex"],
    primary_goal_short: p?.primary_goal_short ?? "",
    primary_goal_long: p?.primary_goal_long ?? "",
    athletic_background: p?.athletic_background ?? "",
    current_state: p?.current_state ?? "",
    lifestyle: p?.lifestyle ?? "",
    preferred_training_days_per_week:
      p?.preferred_training_days_per_week != null
        ? String(p.preferred_training_days_per_week)
        : "",
    preferred_session_minutes:
      p?.preferred_session_minutes != null ? String(p.preferred_session_minutes) : "",
    equipment_constraints_general: p?.equipment_constraints_general ?? "",
    preferences_psychology: p?.preferences_psychology ?? "",
    diet_pattern: p?.diet_pattern ?? "",
    injuries_active: p?.injuries_active ?? "",
    injuries_history: p?.injuries_history ?? "",
    other_conditions: p?.other_conditions ?? "",
  };
}

function fmtAgo(iso: string | null | undefined): string | null {
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

export default function ProfileSection({ initial }: { initial: UserProfile | null }) {
  const [form, setForm] = useState<FormState>(() => fromProfile(initial));
  const [updatedAt, setUpdatedAt] = useState<string | null>(initial?.updated_at ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSavedFlash(false);
    setBusy(true);

    const body = {
      name: form.name.trim() || null,
      age: form.age ? Number(form.age) : null,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      sex: form.sex || null,
      primary_goal_short: form.primary_goal_short.trim() || null,
      primary_goal_long: form.primary_goal_long.trim() || null,
      athletic_background: form.athletic_background.trim() || null,
      current_state: form.current_state.trim() || null,
      lifestyle: form.lifestyle.trim() || null,
      preferred_training_days_per_week: form.preferred_training_days_per_week
        ? Number(form.preferred_training_days_per_week)
        : null,
      preferred_session_minutes: form.preferred_session_minutes
        ? Number(form.preferred_session_minutes)
        : null,
      equipment_constraints_general: form.equipment_constraints_general.trim() || null,
      preferences_psychology: form.preferences_psychology.trim() || null,
      diet_pattern: form.diet_pattern.trim() || null,
      injuries_active: form.injuries_active.trim() || null,
      injuries_history: form.injuries_history.trim() || null,
      other_conditions: form.other_conditions.trim() || null,
    };

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error || "Couldn't save");
      return;
    }
    const j = (await res.json()) as { profile?: UserProfile };
    setUpdatedAt(j.profile?.updated_at ?? new Date().toISOString());
    setSavedFlash(true);
  }

  const lastSaved = fmtAgo(updatedAt);
  const inputCls =
    "w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600";
  const taCls = inputCls + " font-mono text-[14px] leading-relaxed";

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 flex flex-col gap-5">
      <header>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Stable facts about you. Treated as ground truth in every prompt.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Group title="Identity">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Sex">
              <select
                value={form.sex}
                onChange={(e) => set("sex", e.target.value as FormState["sex"])}
                className={inputCls}
              >
                <option value="">—</option>
                <option value="male">male</option>
                <option value="female">female</option>
                <option value="other">other</option>
              </select>
            </Field>
            <Field label="Age">
              <input
                inputMode="numeric"
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Height (cm)">
              <input
                inputMode="numeric"
                value={form.height_cm}
                onChange={(e) => set("height_cm", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </Group>

        <Group title="Goals">
          <Field label="Short-term (2-3 months)">
            <textarea
              rows={2}
              value={form.primary_goal_short}
              onChange={(e) => set("primary_goal_short", e.target.value)}
              className={taCls}
            />
          </Field>
          <Field label="Long-term">
            <textarea
              rows={2}
              value={form.primary_goal_long}
              onChange={(e) => set("primary_goal_long", e.target.value)}
              className={taCls}
            />
          </Field>
        </Group>

        <Group title="Background">
          <Field label="Athletic background">
            <textarea
              rows={4}
              value={form.athletic_background}
              onChange={(e) => set("athletic_background", e.target.value)}
              className={taCls}
            />
          </Field>
          <Field label="Current state">
            <textarea
              rows={3}
              value={form.current_state}
              onChange={(e) => set("current_state", e.target.value)}
              className={taCls}
            />
          </Field>
          <Field label="Lifestyle">
            <textarea
              rows={3}
              value={form.lifestyle}
              onChange={(e) => set("lifestyle", e.target.value)}
              className={taCls}
            />
          </Field>
        </Group>

        <Group title="Training">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sessions / week">
              <input
                inputMode="numeric"
                value={form.preferred_training_days_per_week}
                onChange={(e) =>
                  set("preferred_training_days_per_week", e.target.value)
                }
                className={inputCls}
              />
            </Field>
            <Field label="Session length (min)">
              <input
                inputMode="numeric"
                value={form.preferred_session_minutes}
                onChange={(e) => set("preferred_session_minutes", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Equipment constraints (general)">
            <textarea
              rows={3}
              value={form.equipment_constraints_general}
              onChange={(e) => set("equipment_constraints_general", e.target.value)}
              className={taCls}
            />
          </Field>
          <Field label="Preferences / psychology / coaching style">
            <textarea
              rows={5}
              value={form.preferences_psychology}
              onChange={(e) => set("preferences_psychology", e.target.value)}
              className={taCls}
            />
          </Field>
        </Group>

        <Group title="Diet">
          <Field label="Diet pattern">
            <textarea
              rows={3}
              value={form.diet_pattern}
              onChange={(e) => set("diet_pattern", e.target.value)}
              className={taCls}
            />
          </Field>
        </Group>

        <Group title="Health">
          <Field label="Active injuries">
            <textarea
              rows={2}
              value={form.injuries_active}
              onChange={(e) => set("injuries_active", e.target.value)}
              className={taCls}
            />
          </Field>
          <Field label="Past injuries">
            <textarea
              rows={2}
              value={form.injuries_history}
              onChange={(e) => set("injuries_history", e.target.value)}
              className={taCls}
            />
          </Field>
          <Field label="Other conditions">
            <textarea
              rows={2}
              value={form.other_conditions}
              onChange={(e) => set("other_conditions", e.target.value)}
              className={taCls}
            />
          </Field>
        </Group>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <div className="flex flex-col gap-2 mt-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3.5 disabled:opacity-50 min-h-[44px]"
          >
            {busy ? "Saving…" : "Save profile"}
          </button>
          <span className="text-xs text-zinc-500 px-1">
            {savedFlash && !busy
              ? "Saved."
              : lastSaved
                ? `Last updated: ${lastSaved}`
                : "Not saved yet."}
          </span>
        </div>
      </form>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs uppercase tracking-wider text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
