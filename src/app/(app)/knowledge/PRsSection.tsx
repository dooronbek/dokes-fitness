"use client";

import { useEffect, useState } from "react";
import { PR_EXERCISES, type PersonalRecord, type PRExercise } from "@/lib/types";
import { epley1RM } from "@/lib/pr-detect";
import { todayISO } from "@/lib/dates";

type PRProposal = {
  exercise: PRExercise;
  value_numeric: number;
  value_unit: "kg" | "reps" | "seconds";
  reps_at_pr: number | null;
  set_at: string;
  source_plan_date: string;
  current_value: number | null;
  current_reps: number | null;
};

const PR_LABELS: Record<PRExercise, string> = {
  deadlift: "Deadlift",
  bench_press: "Bench press",
  barbell_squat: "Barbell squat",
  pullups: "Pull-ups",
  pushups: "Push-ups",
  plank: "Plank",
  run_5k: "5k run",
  run_1k: "1k run",
};

const DEFAULT_UNIT: Record<PRExercise, PersonalRecord["value_unit"]> = {
  deadlift: "kg",
  bench_press: "kg",
  barbell_squat: "kg",
  pullups: "reps",
  pushups: "reps",
  plank: "seconds",
  run_5k: "minutes",
  run_1k: "minutes",
};

function formatPR(pr: PersonalRecord | undefined): string {
  if (!pr) return "not set";
  const v = Number(pr.value_numeric);
  switch (pr.value_unit) {
    case "kg": {
      if (pr.reps_at_pr != null) {
        const e1rm = Math.round(epley1RM(v, pr.reps_at_pr));
        return `${v} kg × ${pr.reps_at_pr} (e1RM ${e1rm} kg)`;
      }
      return `${v} kg × —`;
    }
    case "reps":
      return `${v} reps`;
    case "seconds": {
      if (v >= 60) {
        const m = Math.floor(v / 60);
        const s = Math.round(v % 60);
        return `${m}m ${s}s`;
      }
      return `${v} seconds`;
    }
    case "minutes": {
      const totalSecs = Math.round(v * 60);
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
  }
}

function formatProposal(p: PRProposal): string {
  const v = p.value_numeric;
  if (p.value_unit === "kg") {
    if (p.reps_at_pr != null) {
      const e1rm = Math.round(epley1RM(v, p.reps_at_pr));
      return `${v} kg × ${p.reps_at_pr} (e1RM ${e1rm} kg)`;
    }
    return `${v} kg`;
  }
  if (p.value_unit === "reps") return `${v} reps`;
  if (p.value_unit === "seconds") {
    if (v >= 60) {
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      return `${m}m ${s}s`;
    }
    return `${v} seconds`;
  }
  return String(v);
}

function formatCurrent(p: PRProposal): string {
  if (p.current_value == null) return "not set";
  if (p.value_unit === "kg") {
    if (p.current_reps != null) {
      const e1rm = Math.round(epley1RM(p.current_value, p.current_reps));
      return `${p.current_value} kg × ${p.current_reps} (e1RM ${e1rm} kg)`;
    }
    return `${p.current_value} kg × — (no reps known)`;
  }
  return `${p.current_value} ${p.value_unit}`;
}

export default function PRsSection({
  prs,
  onChange,
}: {
  prs: PersonalRecord[];
  onChange: (prs: PersonalRecord[]) => void;
}) {
  const [editing, setEditing] = useState<PRExercise | null>(null);
  const [autoDetectOpen, setAutoDetectOpen] = useState(false);

  const byExercise = new Map<PRExercise, PersonalRecord>();
  for (const p of prs) byExercise.set(p.exercise as PRExercise, p);

  async function refresh() {
    const res = await fetch("/api/prs", { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as { prs?: PersonalRecord[] };
    onChange(j.prs ?? []);
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 flex flex-col gap-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">Personal records</h2>
          <p className="text-xs text-zinc-500 mt-0.5">8 tracked exercises</p>
        </div>
        <button
          type="button"
          onClick={() => setAutoDetectOpen(true)}
          className="text-xs rounded-lg bg-zinc-800 text-zinc-100 px-3 py-1.5"
        >
          Auto-detect from history
        </button>
      </header>

      <ul className="flex flex-col">
        {PR_EXERCISES.map((ex) => {
          const pr = byExercise.get(ex);
          return (
            <li
              key={ex}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-zinc-800 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{PR_LABELS[ex]}</div>
                <div className="text-xs text-zinc-400">{formatPR(pr)}</div>
                {pr && (
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {pr.set_at} · {pr.source}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditing(ex)}
                className="text-xs text-zinc-300 underline underline-offset-2"
              >
                {pr ? "Edit" : "Add"}
              </button>
            </li>
          );
        })}
      </ul>

      {editing && (
        <PREditModal
          exercise={editing}
          existing={byExercise.get(editing) ?? null}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      {autoDetectOpen && (
        <AutoDetectModal
          onClose={() => setAutoDetectOpen(false)}
          onApplied={async () => {
            setAutoDetectOpen(false);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

function PREditModal({
  exercise,
  existing,
  onClose,
  onSaved,
}: {
  exercise: PRExercise;
  existing: PersonalRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultUnit = DEFAULT_UNIT[exercise];
  const [value, setValue] = useState<string>(
    existing?.value_numeric != null ? String(existing.value_numeric) : ""
  );
  const [reps, setReps] = useState<string>(
    existing?.reps_at_pr != null ? String(existing.reps_at_pr) : ""
  );
  const [unit, setUnit] = useState<PersonalRecord["value_unit"]>(
    existing?.value_unit ?? defaultUnit
  );
  const [setAt, setSetAt] = useState<string>(existing?.set_at ?? todayISO());
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const showReps = unit === "kg";

  async function save() {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) {
      setErr("Value must be a positive number");
      return;
    }
    if (showReps && reps && (!Number.isInteger(Number(reps)) || Number(reps) < 1)) {
      setErr("Reps must be a positive whole number");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/prs/${exercise}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        value_numeric: v,
        value_unit: unit,
        reps_at_pr: showReps && reps ? Number(reps) : null,
        set_at: setAt,
        notes: notes.trim() || null,
        source: "manual",
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error || "Couldn't save");
      return;
    }
    onSaved();
  }

  async function remove() {
    if (!confirm(`Delete ${PR_LABELS[exercise]} PR?`)) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/prs/${exercise}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error || "Couldn't delete");
      return;
    }
    onSaved();
  }

  const inputCls =
    "w-full rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between">
          <h3 className="text-base font-semibold">{PR_LABELS[exercise]}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-xs text-zinc-400 underline underline-offset-2"
          >
            Cancel
          </button>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Value</span>
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Unit</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as PersonalRecord["value_unit"])}
              className={inputCls}
            >
              <option value="kg">kg</option>
              <option value="reps">reps</option>
              <option value="seconds">seconds</option>
              <option value="minutes">minutes</option>
            </select>
          </label>
        </div>

        {showReps && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Reps at PR (optional)</span>
            <input
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className={inputCls}
            />
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Date</span>
          <input
            type="date"
            value={setAt}
            onChange={(e) => setSetAt(e.target.value)}
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputCls}
          />
        </label>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <div className="grid grid-cols-2 gap-2 mt-2">
          {existing ? (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-xl bg-zinc-800 text-red-400 py-2.5 disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl bg-zinc-800 text-zinc-100 py-2.5 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
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
    </div>
  );
}

function AutoDetectModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<PRProposal[]>([]);
  const [approved, setApproved] = useState<Set<PRExercise>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/prs/auto-detect", { method: "POST" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setErr(j?.error || "Couldn't run detection");
          setLoading(false);
          return;
        }
        const j = (await res.json()) as { proposals?: PRProposal[] };
        const list = j.proposals ?? [];
        setProposals(list);
        setApproved(new Set(list.map((p) => p.exercise)));
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setErr("Couldn't reach server");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(ex: PRExercise) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(ex)) next.delete(ex);
      else next.add(ex);
      return next;
    });
  }

  async function apply() {
    if (approved.size === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/prs/auto-detect/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved: Array.from(approved) }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error || "Couldn't apply");
      return;
    }
    onApplied();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between">
          <h3 className="text-base font-semibold">Auto-detected PRs</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-xs text-zinc-400 underline underline-offset-2"
          >
            Cancel
          </button>
        </header>

        {loading && <p className="text-sm text-zinc-400">Scanning your training history…</p>}
        {err && <p className="text-sm text-red-400">{err}</p>}

        {!loading && !err && proposals.length === 0 && (
          <p className="text-sm text-zinc-400">
            No new bests found in your completed plans. Either your manual PRs are
            still leading, or there&apos;s nothing parseable yet.
          </p>
        )}

        {!loading && proposals.length > 0 && (
          <ul className="flex flex-col gap-2">
            {proposals.map((p) => (
              <li
                key={p.exercise}
                className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 flex gap-3"
              >
                <input
                  type="checkbox"
                  checked={approved.has(p.exercise)}
                  onChange={() => toggle(p.exercise)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {PR_LABELS[p.exercise]}: {formatProposal(p)}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    on {p.source_plan_date}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Current: {formatCurrent(p)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl bg-zinc-800 text-zinc-100 py-2.5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={busy || loading || proposals.length === 0}
            className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-2.5 disabled:opacity-50"
          >
            {busy ? "Applying…" : `Apply ${approved.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}
