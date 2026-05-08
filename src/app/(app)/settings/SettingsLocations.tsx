"use client";

import { useState } from "react";
import type { TrainingLocation } from "@/lib/types";

type FormState = {
  id: string | null;
  name: string;
  equipment: string;
  running_available: boolean;
};

const EMPTY: FormState = {
  id: null,
  name: "",
  equipment: "",
  running_available: false,
};

export default function SettingsLocations({
  initialLocations,
}: {
  initialLocations: TrainingLocation[];
}) {
  const [locations, setLocations] = useState<TrainingLocation[]>(initialLocations);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/locations", { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as { locations?: TrainingLocation[] };
    setLocations(j.locations ?? []);
  }

  async function save() {
    if (!form) return;
    const name = form.name.trim();
    const equipment = form.equipment.trim();
    if (!name) {
      setErr("Name is required");
      return;
    }
    if (!equipment) {
      setErr("Equipment is required");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const url = form.id ? `/api/locations/${form.id}` : "/api/locations";
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          equipment,
          running_available: form.running_available,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error || "Couldn't save");
        return;
      }
      setForm(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(loc: TrainingLocation) {
    if (!confirm(`Delete location "${loc.name}"?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/locations/${loc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error || "Couldn't delete");
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-medium">Training locations</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {locations.length} saved · pick one each time you generate a plan
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...EMPTY })}
          className="text-xs rounded-lg bg-zinc-800 text-zinc-100 px-3 py-1.5"
        >
          + Add
        </button>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {locations.length === 0 && !form && (
        <p className="text-xs text-zinc-500">
          No locations yet. Add one to start generating plans.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {locations.map((loc) => (
          <li
            key={loc.id}
            className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{loc.name}</span>
              {loc.running_available && (
                <span className="text-[10px] uppercase tracking-wider text-emerald-400">
                  🏃 Running
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{loc.equipment}</p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() =>
                  setForm({
                    id: loc.id,
                    name: loc.name,
                    equipment: loc.equipment,
                    running_available: loc.running_available,
                  })
                }
                className="text-xs text-zinc-300 underline underline-offset-2"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => remove(loc)}
                className="text-xs text-red-400 underline underline-offset-2"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {form && (
        <div className="rounded-xl bg-zinc-950/80 border border-zinc-700 p-3 flex flex-col gap-3 mt-2">
          <h3 className="text-xs uppercase tracking-wide text-zinc-500">
            {form.id ? "Edit location" : "New location"}
          </h3>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Home, Office, Gym Park, Hotel"
              className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Equipment</span>
            <textarea
              rows={3}
              value={form.equipment}
              onChange={(e) => setForm({ ...form, equipment: e.target.value })}
              placeholder="8kg dumbbells, yoga mat, pull-up bar"
              className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.running_available}
              onChange={(e) =>
                setForm({ ...form, running_available: e.target.checked })
              }
              className="h-4 w-4"
            />
            <span className="text-sm text-zinc-300">Running available here</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setErr(null);
              }}
              disabled={busy}
              className="rounded-xl bg-zinc-800 text-zinc-100 py-2.5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-2.5 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
