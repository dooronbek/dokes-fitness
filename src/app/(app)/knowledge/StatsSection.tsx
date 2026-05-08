"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DossierStats,
  DossierStatsLongterm,
  DossierStatsMidterm,
} from "@/lib/types";

const STALE_MS = 24 * 60 * 60 * 1000;

function fmtAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function isStale(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  return Date.now() - d.getTime() > STALE_MS;
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  return Number(v).toFixed(digits);
}

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return String(Math.round(Number(v)));
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function byTypeBreakdown(c: DossierStatsMidterm["workouts_by_type"]): string {
  const parts: string[] = [];
  if (c.strength) parts.push(`Strength: ${c.strength}`);
  if (c.cardio) parts.push(`Cardio: ${c.cardio}`);
  if (c.mobility) parts.push(`Mobility: ${c.mobility}`);
  if (c.mixed) parts.push(`Mixed: ${c.mixed}`);
  if (c.rest) parts.push(`Rest: ${c.rest}`);
  return parts.join(" | ") || "—";
}

export default function StatsSection({ initial }: { initial: DossierStats }) {
  const [stats, setStats] = useState<DossierStats>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const autoTriggered = useRef(false);

  async function recompute() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/dossier-stats/recompute", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error || "Couldn't recompute");
      return;
    }
    const j = (await res.json()) as { stats?: DossierStats };
    if (j.stats) setStats(j.stats);
  }

  useEffect(() => {
    if (autoTriggered.current) return;
    if (isStale(initial.computed_at)) {
      autoTriggered.current = true;
      void recompute();
    }
  }, [initial.computed_at]);

  const lastComputed = fmtAgo(stats.computed_at);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Training history</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {lastComputed
              ? `Last computed: ${lastComputed}`
              : "Not computed yet"}
          </p>
        </div>
        <button
          type="button"
          onClick={recompute}
          disabled={busy}
          className="text-xs rounded-lg bg-zinc-800 text-zinc-100 px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? "Recomputing…" : "Recompute"}
        </button>
      </header>

      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="grid sm:grid-cols-2 gap-4">
        <MidtermPanel m={stats.midterm} busy={busy} />
        <LongtermPanel l={stats.longterm} busy={busy} />
      </div>
    </section>
  );
}

function MidtermPanel({
  m,
  busy,
}: {
  m: DossierStatsMidterm | null;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 flex flex-col gap-1.5 text-sm">
      <h3 className="text-[11px] uppercase tracking-wider text-zinc-500">
        Mid-term (30 days, ending 14 days ago)
      </h3>
      {!m && !busy && <p className="text-xs text-zinc-500 mt-1">No data yet.</p>}
      {!m && busy && <p className="text-xs text-zinc-500 mt-1">Computing…</p>}
      {m && (
        <>
          <Stat label="Workouts">{m.workouts_total}</Stat>
          <Stat label="By type">{byTypeBreakdown(m.workouts_by_type)}</Stat>
          <Stat label="Adherence">
            {m.adherence_completed}/{m.adherence_generated} (
            {pct(m.adherence_completed, m.adherence_generated)})
          </Stat>
          <Stat label="Avg session">{fmtInt(m.avg_session_minutes)} min</Stat>
          <Stat label="Avg HR">
            strength {fmtInt(m.avg_hr_by_type.strength)} | cardio{" "}
            {fmtInt(m.avg_hr_by_type.cardio)}
          </Stat>
          <Stat label="Avg sleep">{fmtNum(m.avg_sleep_quality)}/5</Stat>
          <Stat label="Avg energy">{fmtNum(m.avg_energy)}/5</Stat>
          <Stat label="Avg resting HR">{fmtInt(m.avg_resting_hr)} bpm</Stat>
          <Stat label="Weight delta">
            {m.weight_delta_kg != null ? `${m.weight_delta_kg.toFixed(1)} kg` : "—"}
          </Stat>
          <Stat label="Waist delta">
            {m.waist_delta_cm != null ? `${m.waist_delta_cm.toFixed(1)} cm` : "—"}
          </Stat>
        </>
      )}
    </div>
  );
}

function LongtermPanel({
  l,
  busy,
}: {
  l: DossierStatsLongterm | null;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 flex flex-col gap-1.5 text-sm">
      <h3 className="text-[11px] uppercase tracking-wider text-zinc-500">
        Long-term (last year, excluding recent 14)
      </h3>
      {!l && !busy && <p className="text-xs text-zinc-500 mt-1">No data yet.</p>}
      {!l && busy && <p className="text-xs text-zinc-500 mt-1">Computing…</p>}
      {l && (
        <>
          <Stat label="Workouts">{l.workouts_total}</Stat>
          <Stat label="By type">{byTypeBreakdown(l.workouts_by_type)}</Stat>
          <Stat label="Adherence">
            {l.adherence_completed}/{l.adherence_generated} (
            {pct(l.adherence_completed, l.adherence_generated)})
          </Stat>
          <Stat label="Longest streak">{l.longest_streak_days} days</Stat>
          <Stat label="Avg sleep">{fmtNum(l.avg_sleep_quality)}/5</Stat>
          <Stat label="Avg resting HR">{fmtInt(l.avg_resting_hr)} bpm</Stat>
          <Stat label="Weight">
            {l.weight_start_kg != null
              ? `${l.weight_start_kg.toFixed(1)}`
              : "—"}{" "}
            →{" "}
            {l.weight_lowest_kg != null
              ? `${l.weight_lowest_kg.toFixed(1)} (low)`
              : "—"}{" "}
            →{" "}
            {l.weight_current_kg != null
              ? `${l.weight_current_kg.toFixed(1)} (now)`
              : "—"}
          </Stat>
        </>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200 text-right">{children}</span>
    </div>
  );
}
