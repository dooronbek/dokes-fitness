import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Runtime configuration
// ---------------------------------------------------------------------------
// Health Auto Export (HAE) sends large daily-aggregate payloads — often
// >1 MB, and multi-day backfills can exceed 10 MB. We read the body manually
// as a ReadableStream below to bypass Next.js's automatic body parser and
// its implicit size cap, so the route can accept up to ~50 MB at the
// framework level.
//
// Vercel PLATFORM body-size ceiling (separate from Next.js):
//   • Hobby plan:        4.5 MB hard limit. Payloads larger than this are
//                        rejected by Vercel's edge BEFORE this function runs
//                        — there is no override.
//   • Pro / Enterprise:  defaults to 4.5 MB but can be raised. The function
//                        itself supports more once the platform allows it.
//
// If HAE backfills exceed 4.5 MB on Hobby, the options are:
//   1. Upgrade to Pro and raise the body-size limit, OR
//   2. In the HAE iOS app, set Automation → Date Range = "1 day" so each
//      sync sends only one day at a time (typically <500 KB).
// ---------------------------------------------------------------------------
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Hard cap we enforce ourselves before parsing — defends against accidental
// or malicious huge bodies regardless of platform limits.
const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB

type MetricPoint = Record<string, unknown> & { date?: string };

type Metric = {
  name?: string;
  units?: string;
  data?: MetricPoint[];
};

type WorkoutInput = Record<string, unknown> & {
  id?: string;
  name?: string;
  start?: string;
  end?: string;
};

// One HAE metric entry (a single object in v2 flat shape, or one item in
// the legacy `data: [...]` array). Carries arbitrary fields plus an
// optional `qty` and `date`.
type MetricEntry = Record<string, unknown> & {
  qty?: unknown;
  date?: unknown;
};

// Numeric columns on activity_daily that a metric can populate.
type DayColumn =
  | "steps"
  | "active_calories"
  | "resting_calories"
  | "distance_m"
  | "floors_climbed"
  | "exercise_minutes"
  | "stand_hours"
  | "avg_hr"
  | "resting_hr"
  | "hrv_ms"
  | "sleep_minutes";

// Metric name -> { destination column, transform from one entry to the
// numeric column value }. Single source of truth for both v2 flat and
// legacy array shapes.
const METRIC_MAP: Record<
  string,
  { column: DayColumn; transform: (v: MetricEntry) => number | null }
> = {
  step_count: {
    column: "steps",
    transform: (v) => {
      const q = num(v.qty);
      return q != null ? Math.round(q) : null;
    },
  },
  active_energy: {
    column: "active_calories",
    transform: (v) => {
      const q = num(v.qty);
      return q != null ? Math.round(q) : null;
    },
  },
  basal_energy_burned: {
    column: "resting_calories",
    transform: (v) => {
      const q = num(v.qty);
      return q != null ? Math.round(q) : null;
    },
  },
  // HAE reports distance in km — convert to metres.
  distance_walking_running: {
    column: "distance_m",
    transform: (v) => {
      const q = num(v.qty);
      return q != null ? Math.round(q * 1000) : null;
    },
  },
  flights_climbed: {
    column: "floors_climbed",
    transform: (v) => {
      const q = num(v.qty);
      return q != null ? Math.round(q) : null;
    },
  },
  apple_exercise_time: {
    column: "exercise_minutes",
    transform: (v) => {
      const q = num(v.qty);
      return q != null ? Math.round(q) : null;
    },
  },
  apple_stand_hour: {
    column: "stand_hours",
    transform: (v) => {
      const q = num(v.qty);
      return q != null ? Math.round(q) : null;
    },
  },
  // Legacy array shape uses Avg/avg; v2 flat uses qty.
  heart_rate: {
    column: "avg_hr",
    transform: (v) => {
      const q = num(v.Avg ?? v.avg ?? v.qty);
      return q != null ? Math.round(q) : null;
    },
  },
  resting_heart_rate: {
    column: "resting_hr",
    transform: (v) => {
      const q = num(v.qty ?? v.Avg ?? v.avg);
      return q != null ? Math.round(q) : null;
    },
  },
  heart_rate_variability: {
    column: "hrv_ms",
    transform: (v) => num(v.qty ?? v.Avg ?? v.avg),
  },
  // Sleep: v2 flat carries totalSleep/asleep/inBed/rem/deep/etc. as hours.
  // Prefer totalSleep (matches Apple Health "Time Asleep"), fall back to
  // asleep, then qty for older shapes.
  sleep_analysis: {
    column: "sleep_minutes",
    transform: (v) => {
      const hours = num(v.totalSleep) ?? num(v.asleep) ?? num(v.qty);
      return hours != null ? Math.round(hours * 60) : null;
    },
  },
};

// Aggregated per-day data, populated from either payload shape and then
// upserted to activity_daily.
type DayAggregate = {
  date: string;
  columns: Partial<Record<DayColumn | "total_calories", number>>;
  raw: Record<string, unknown>;
};

// Lowercase normalised workout type lookup.
const WORKOUT_TYPE_MAP: Record<string, string> = {
  "strength training": "strength",
  "traditional strength training": "strength",
  "functional strength training": "strength",
  "core training": "strength",
  running: "running",
  walking: "walking",
  cycling: "cycling",
  hiking: "hiking",
  yoga: "yoga",
  swimming: "swimming",
  "high intensity interval training": "hiit",
  hiit: "hiit",
  rowing: "rowing",
  elliptical: "elliptical",
  "stair climber": "stairs",
  pilates: "pilates",
  "mixed cardio": "cardio",
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// HAE v2 reports workout-level scalars as { qty, units } objects rather
// than bare numbers. Older shapes (and some daily metrics) still send the
// scalar directly, so accept both.
function getQty(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object") {
    const q = (v as { qty?: unknown }).qty;
    if (typeof q === "number" && Number.isFinite(q)) return q;
  }
  return null;
}

function roundOrNull(v: number | null): number | null {
  return v != null ? Math.round(v) : null;
}

// Extract YYYY-MM-DD from HAE date strings like "2025-11-01 00:00:00 +0000".
// HAE uses the local-day boundary in UTC for daily metrics, so the date prefix
// is the calendar day we want.
function extractDate(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function toISO(s: unknown): string | null {
  if (typeof s !== "string") return null;
  // HAE sends "2025-11-01 09:00:00 +0000" — JS Date parses this if we
  // replace the space with 'T' and tighten the offset.
  const fixed = s.replace(" ", "T").replace(/ ([+-]\d{4})$/, "$1");
  const d = new Date(fixed);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeWorkoutType(name: string | undefined): string | null {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  if (!lower) return null;
  if (WORKOUT_TYPE_MAP[lower]) return WORKOUT_TYPE_MAP[lower];
  // Strip the word "training" and try again.
  const stripped = lower.replace(/\s*training\s*/g, " ").trim();
  if (WORKOUT_TYPE_MAP[stripped]) return WORKOUT_TYPE_MAP[stripped];
  return stripped || lower;
}

function logSummary(payload: Record<string, unknown>) {
  console.log(
    "[health-sync]",
    new Date().toISOString(),
    JSON.stringify(payload)
  );
}

// Apply one (metric name, entry, date) tuple to the per-day aggregate map,
// recording unknown metric names without failing the request.
function applyMetric(
  byDate: Map<string, DayAggregate>,
  unknown: { name: string; preview: string }[],
  name: string,
  entry: MetricEntry,
  date: string
) {
  const mapping = METRIC_MAP[name];
  if (!mapping) {
    unknown.push({
      name,
      preview: JSON.stringify(entry).slice(0, 100),
    });
    return;
  }
  let agg = byDate.get(date);
  if (!agg) {
    agg = { date, columns: {}, raw: {} };
    byDate.set(date, agg);
  }
  // Always stash the raw entry under its metric name so raw_payload always
  // reflects the latest sync, even if the transform returns null.
  agg.raw[name] = entry;
  const value = mapping.transform(entry);
  if (value != null) agg.columns[mapping.column] = value;
}

// HAE has shipped two payload shapes from the iOS app:
//
//   1. Legacy "array" shape (REST API v1, older HAE versions):
//        { "data": { "metrics": [{name, units, data: [{date, qty, ...}]}], "workouts": [...] } }
//
//   2. v2 flat shape (Summarize Data + Time Grouping = Day):
//        { "step_count": {qty, date, source}, "active_energy": {...}, "sleep_analysis": {totalSleep, ...}, ... }
//      Each top-level key is a metric name; its value is a single per-day
//      object (not an array). Workouts, when present, still appear under a
//      top-level "workouts" key.
//
// This normalizer detects which shape the body is in and routes both into
// the same per-date aggregate so downstream upsert logic is shape-agnostic.
function normalizeMetrics(body: unknown): {
  byDate: Map<string, DayAggregate>;
  unknown: { name: string; preview: string }[];
  workouts: WorkoutInput[];
} {
  const byDate = new Map<string, DayAggregate>();
  const unknown: { name: string; preview: string }[] = [];
  let workouts: WorkoutInput[] = [];

  if (!body || typeof body !== "object") return { byDate, unknown, workouts };

  // ---- Shape 1: { data: { metrics: [...], workouts: [...] } } ----
  const legacy = (body as { data?: { metrics?: Metric[]; workouts?: WorkoutInput[] } })
    .data;
  if (
    legacy &&
    typeof legacy === "object" &&
    (Array.isArray(legacy.metrics) || Array.isArray(legacy.workouts))
  ) {
    workouts = Array.isArray(legacy.workouts) ? legacy.workouts : [];
    const metrics = Array.isArray(legacy.metrics) ? legacy.metrics : [];
    for (const metric of metrics) {
      const name = metric?.name;
      if (!name) continue;
      const points = Array.isArray(metric.data) ? metric.data : [];
      for (const p of points) {
        const date = extractDate(p?.date);
        if (!date) continue;
        applyMetric(byDate, unknown, name, p as MetricEntry, date);
      }
    }
    return { byDate, unknown, workouts };
  }

  // ---- Shape 2: flat top-level metric-name keys ----
  const obj = body as Record<string, unknown>;
  if (Array.isArray(obj.workouts)) workouts = obj.workouts as WorkoutInput[];
  for (const [name, value] of Object.entries(obj)) {
    if (name === "workouts" || name === "data") continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as MetricEntry;
    const date = extractDate(entry.date);
    if (!date) {
      // No date on the entry — can't bucket it. Note as unknown shape so we
      // can investigate if it ever happens.
      unknown.push({
        name: `${name} (no date)`,
        preview: JSON.stringify(entry).slice(0, 100),
      });
      continue;
    }
    applyMetric(byDate, unknown, name, entry, date);
  }
  return { byDate, unknown, workouts };
}

// Manually stream the request body to avoid Next's built-in body parser,
// which can reject anything above its (undocumented, runtime-dependent) cap.
// Returns the raw text plus the exact byte count read off the wire.
async function readBodyAsText(
  req: NextRequest
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const reader = req.body?.getReader();
  if (!reader) return { text: "", bytes: 0, truncated: false };

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  if (!truncated) chunks.push(decoder.decode());
  return { text: chunks.join(""), bytes, truncated };
}

export async function POST(req: NextRequest) {
  // Auth: bearer token only — single shared secret for HAE.
  const secret = process.env.HEALTH_SYNC_SECRET;
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!secret || !provided || provided !== secret) {
    console.warn(
      "[health-sync]",
      new Date().toISOString(),
      "auth_failed",
      JSON.stringify({ hasHeader: !!auth, ip: req.headers.get("x-forwarded-for") || null })
    );
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Stream the body and log its exact size before doing anything with it.
  let rawBody = "";
  let bytes = 0;
  let truncated = false;
  try {
    const result = await readBodyAsText(req);
    rawBody = result.text;
    bytes = result.bytes;
    truncated = result.truncated;
  } catch (e) {
    console.error(
      "[health-sync]",
      new Date().toISOString(),
      "stream_read_failed",
      JSON.stringify({ error: (e as Error).message })
    );
    return NextResponse.json({ error: "stream_read_failed" }, { status: 400 });
  }

  console.log(
    "[health-sync]",
    new Date().toISOString(),
    "request_received",
    JSON.stringify({
      bytes,
      kb: +(bytes / 1024).toFixed(1),
      mb: +(bytes / 1024 / 1024).toFixed(3),
      content_length: req.headers.get("content-length"),
      content_type: req.headers.get("content-type"),
    })
  );

  if (truncated) {
    console.error(
      "[health-sync]",
      new Date().toISOString(),
      "body_too_large",
      JSON.stringify({ bytes, max: MAX_BODY_BYTES })
    );
    return NextResponse.json(
      { error: "payload_too_large", max_bytes: MAX_BODY_BYTES },
      { status: 413 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    console.error(
      "[health-sync]",
      new Date().toISOString(),
      "parse_failed",
      JSON.stringify({
        bytes,
        preview: rawBody.slice(0, 500),
        error: (e as Error).message,
      })
    );
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Normalize whichever HAE payload shape we got (legacy array OR v2 flat)
  // into a unified per-date aggregate map.
  const { byDate, unknown: unknownMetrics, workouts } = normalizeMetrics(body);

  const sb = supabaseServer();
  const errors: { kind: string; key?: string; error: string }[] = [];

  // Compute total_calories where both sides are present.
  for (const agg of byDate.values()) {
    const ac = agg.columns.active_calories;
    const rc = agg.columns.resting_calories;
    if (ac != null && rc != null) {
      agg.columns.total_calories = ac + rc;
    }
  }

  // ---- Upsert each day individually so a partial failure doesn't kill batch ----
  // Read-merge-write pattern: pull the existing row, overlay only the
  // non-null columns from this sync, deep-merge raw_payload, and bump
  // synced_at. HAE retries are safe because (activity_date, source) is the
  // upsert key.
  let daysProcessed = 0;
  const perDateLog: { date: string; mapped: Record<string, number> }[] = [];
  const SOURCE = "apple_health";
  const syncedAt = new Date().toISOString();

  for (const [date, agg] of byDate) {
    try {
      const { data: existing, error: selErr } = await sb
        .from("activity_daily")
        .select("*")
        .eq("activity_date", date)
        .eq("source", SOURCE)
        .maybeSingle();
      if (selErr) throw new Error(selErr.message);

      const existingRaw = (existing?.raw_payload ?? {}) as Record<string, unknown>;
      const merged: Record<string, unknown> = {
        ...(existing ?? {}),
        ...agg.columns,
        activity_date: date,
        source: SOURCE,
        synced_at: syncedAt,
        raw_payload: { ...existingRaw, ...agg.raw },
      };
      delete merged.id;

      const { error: upErr } = await sb
        .from("activity_daily")
        .upsert(merged, { onConflict: "activity_date,source" });
      if (upErr) throw new Error(upErr.message);
      daysProcessed++;
      perDateLog.push({ date, mapped: { ...agg.columns } as Record<string, number> });
    } catch (e) {
      errors.push({ kind: "day", key: date, error: (e as Error).message });
    }
  }

  // One sync_summary line per date, formatted to be readable in Vercel logs.
  for (const entry of perDateLog) {
    console.log(
      "[health-sync]",
      syncedAt,
      `sync_summary date=${entry.date}`,
      `mapped=${JSON.stringify(entry.mapped)}`,
      `unknown=${JSON.stringify(unknownMetrics.map((u) => u.name))}`
    );
  }
  // Detailed unknown-metric warnings (with a preview of the value) so we can
  // extend METRIC_MAP later when HAE adds new metric names.
  for (const u of unknownMetrics) {
    console.warn(
      "[health-sync]",
      syncedAt,
      "unknown_metric",
      JSON.stringify(u)
    );
  }

  // ---- Workouts ----
  // HAE v2 workout payload shape (verified from production raw_payload):
  //   { id, name, start, end, duration (seconds), activeEnergyBurned: {qty, units},
  //     totalEnergyBurned?: {qty, units}, avgHeartRate: {qty, units},
  //     maxHeartRate: {qty, units}, heartRate: { avg: {qty,units}, max, min },
  //     totalDistance?: {qty, units}, ... }
  // Scalars come as { qty, units } objects, not bare numbers — use getQty.
  let workoutsProcessed = 0;
  for (const w of workouts) {
    try {
      const externalId =
        typeof w.id === "string" && w.id.trim() ? w.id.trim() : null;
      if (!externalId) {
        console.warn(
          "[health-sync]",
          new Date().toISOString(),
          "workout_skipped_no_id",
          JSON.stringify({ name: w.name, start: w.start })
        );
        continue;
      }
      const startedAt = toISO(w.start);
      if (!startedAt) {
        errors.push({
          kind: "workout",
          key: externalId,
          error: "missing or invalid start",
        });
        continue;
      }
      const endedAt = toISO(w.end);
      const workoutDate = startedAt.slice(0, 10);

      const durationSec = typeof w.duration === "number" ? w.duration : null;
      const durationMin =
        durationSec != null
          ? Math.round(durationSec / 60)
          : endedAt
          ? Math.round(
              (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000
            )
          : null;

      const activeKcal = roundOrNull(getQty(w.activeEnergyBurned));
      const totalKcal = roundOrNull(getQty(w.totalEnergyBurned));

      // No HR ingested — HAE's workout-level avg AND max both come from the
      // unreliable cooldown stream. Real HR is the user-typed avg on
      // training_plans.avg_hr. raw_payload still carries HAE's HR fields if
      // we ever want to revisit.

      // HAE distance is km — convert to metres. May be absent for non-cardio.
      const distKm = getQty(w.totalDistance);
      const distanceM = distKm != null ? Math.round(distKm * 1000) : null;

      const type = normalizeWorkoutType(w.name);

      const row = {
        external_id: externalId,
        source: "apple_health",
        workout_date: workoutDate,
        started_at: startedAt,
        ended_at: endedAt,
        type,
        duration_min: durationMin,
        active_calories: activeKcal,
        total_calories: totalKcal,
        distance_m: distanceM,
        notes: typeof w.notes === "string" ? w.notes : null,
        raw_payload: w,
        synced_at: new Date().toISOString(),
      };

      const { error } = await sb
        .from("workouts")
        .upsert(row, { onConflict: "external_id" });
      if (error) throw new Error(error.message);

      console.log(
        "[health-sync]",
        new Date().toISOString(),
        `workout_processed external_id=${externalId} type=${type} duration_min=${durationMin} active_kcal=${activeKcal}`
      );
      workoutsProcessed++;
    } catch (e) {
      errors.push({
        kind: "workout",
        key: typeof w.id === "string" ? w.id : undefined,
        error: (e as Error).message,
      });
    }
  }

  logSummary({
    days_processed: daysProcessed,
    workouts_processed: workoutsProcessed,
    errors_count: errors.length,
  });

  return NextResponse.json({
    ok: true,
    days_processed: daysProcessed,
    workouts_processed: workoutsProcessed,
    errors,
  });
}
