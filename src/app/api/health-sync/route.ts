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

// Map of HAE metric name -> handler that pulls a numeric value out of one
// daily data point and assigns it to the activity_daily row.
type DayRow = {
  activity_date: string;
  source: string;
  steps?: number | null;
  active_calories?: number | null;
  resting_calories?: number | null;
  total_calories?: number | null;
  distance_m?: number | null;
  floors_climbed?: number | null;
  exercise_minutes?: number | null;
  stand_hours?: number | null;
  avg_hr?: number | null;
  resting_hr?: number | null;
  hrv_ms?: number | null;
  sleep_minutes?: number | null;
  sleep_quality_score?: number | null;
  raw_payload: Record<string, unknown>;
  synced_at: string;
};

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

const METRIC_HANDLERS: Record<
  string,
  (row: DayRow, point: MetricPoint) => void
> = {
  step_count: (row, p) => {
    const v = num(p.qty);
    if (v != null) row.steps = Math.round(v);
  },
  active_energy: (row, p) => {
    const v = num(p.qty);
    if (v != null) row.active_calories = Math.round(v);
  },
  basal_energy_burned: (row, p) => {
    const v = num(p.qty);
    if (v != null) row.resting_calories = Math.round(v);
  },
  // Distance comes in km from HAE typically; convert to metres.
  distance_walking_running: (row, p) => {
    const v = num(p.qty);
    if (v != null) row.distance_m = Math.round(v * 1000);
  },
  flights_climbed: (row, p) => {
    const v = num(p.qty);
    if (v != null) row.floors_climbed = Math.round(v);
  },
  apple_exercise_time: (row, p) => {
    const v = num(p.qty);
    if (v != null) row.exercise_minutes = Math.round(v);
  },
  apple_stand_hour: (row, p) => {
    const v = num(p.qty);
    if (v != null) row.stand_hours = Math.round(v);
  },
  heart_rate: (row, p) => {
    const v = num(p.Avg ?? p.avg ?? p.qty);
    if (v != null) row.avg_hr = Math.round(v);
  },
  resting_heart_rate: (row, p) => {
    const v = num(p.Avg ?? p.avg ?? p.qty);
    if (v != null) row.resting_hr = Math.round(v);
  },
  heart_rate_variability: (row, p) => {
    const v = num(p.qty ?? p.Avg ?? p.avg);
    if (v != null) row.hrv_ms = v;
  },
  sleep_analysis: (row, p) => {
    // HAE reports sleep in hours under "asleep" (and "inBed").
    const asleep = num(p.asleep ?? p.qty);
    if (asleep != null) row.sleep_minutes = Math.round(asleep * 60);
  },
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

  const data =
    (body as { data?: { metrics?: Metric[]; workouts?: WorkoutInput[] } })?.data ?? {};
  const metrics = Array.isArray(data.metrics) ? data.metrics : [];
  const workouts = Array.isArray(data.workouts) ? data.workouts : [];

  const sb = supabaseServer();
  const errors: { kind: string; key?: string; error: string }[] = [];

  // ---- Build per-day rows from metrics ----
  const byDate = new Map<string, DayRow>();
  for (const metric of metrics) {
    const handler = metric?.name ? METRIC_HANDLERS[metric.name] : null;
    if (!handler) continue;
    const points = Array.isArray(metric.data) ? metric.data : [];
    for (const p of points) {
      const date = extractDate(p?.date);
      if (!date) continue;
      let row = byDate.get(date);
      if (!row) {
        row = {
          activity_date: date,
          source: "apple_health",
          raw_payload: {},
          synced_at: new Date().toISOString(),
        };
        byDate.set(date, row);
      }
      try {
        handler(row, p);
        // Stash raw point in raw_payload by metric name.
        const rp = row.raw_payload as Record<string, unknown>;
        rp[metric.name as string] = p;
      } catch (e) {
        errors.push({
          kind: "metric",
          key: `${metric.name}@${date}`,
          error: (e as Error).message,
        });
      }
    }
  }

  // Compute total_calories where both sides are present.
  for (const row of byDate.values()) {
    if (row.active_calories != null && row.resting_calories != null) {
      row.total_calories = row.active_calories + row.resting_calories;
    }
  }

  // ---- Upsert each day individually so a partial failure doesn't kill batch ----
  let daysProcessed = 0;
  for (const [date, row] of byDate) {
    try {
      // Read existing row to merge non-null incoming over existing.
      const { data: existing, error: selErr } = await sb
        .from("activity_daily")
        .select("*")
        .eq("activity_date", date)
        .eq("source", row.source)
        .maybeSingle();
      if (selErr) throw new Error(selErr.message);

      const merged: Record<string, unknown> = { ...(existing ?? {}), ...withoutNullish(row) };
      // Always overwrite synced_at and merge raw_payload.
      const existingRaw = (existing?.raw_payload ?? {}) as Record<string, unknown>;
      merged.raw_payload = { ...existingRaw, ...row.raw_payload };
      merged.activity_date = date;
      merged.source = row.source;
      merged.synced_at = row.synced_at;
      delete merged.id;

      const { error: upErr } = await sb
        .from("activity_daily")
        .upsert(merged, { onConflict: "activity_date,source" });
      if (upErr) throw new Error(upErr.message);
      daysProcessed++;
    } catch (e) {
      errors.push({ kind: "day", key: date, error: (e as Error).message });
    }
  }

  // ---- Workouts ----
  let workoutsProcessed = 0;
  for (const w of workouts) {
    try {
      const externalId =
        typeof w.id === "string" && w.id.trim()
          ? w.id.trim()
          : typeof w.uuid === "string"
          ? (w.uuid as string)
          : null;
      const startedAt = toISO(w.start);
      if (!startedAt) {
        errors.push({
          kind: "workout",
          key: externalId ?? "?",
          error: "missing or invalid start",
        });
        continue;
      }
      const endedAt = toISO(w.end);
      const workoutDate = startedAt.slice(0, 10);
      const durFromTimes =
        endedAt && startedAt
          ? Math.round(
              (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000
            )
          : null;
      const duration =
        num(w.duration) != null ? Math.round(num(w.duration) as number) : durFromTimes;
      const activeKcal = num(w.activeEnergyBurned ?? w.active_energy);
      const totalKcal = num(w.totalEnergyBurned ?? w.total_energy);
      const dist = num(w.totalDistance ?? w.distance);
      // HAE distance is km — convert to metres.
      const distM = dist != null ? Math.round(dist * 1000) : null;

      const row = {
        external_id: externalId,
        source: "apple_health",
        workout_date: workoutDate,
        started_at: startedAt,
        ended_at: endedAt,
        type: normalizeWorkoutType(w.name),
        duration_min: duration,
        active_calories: activeKcal != null ? Math.round(activeKcal) : null,
        total_calories: totalKcal != null ? Math.round(totalKcal) : null,
        distance_m: distM,
        avg_hr:
          num(w.avgHeartRate ?? w.avg_heart_rate) != null
            ? Math.round(num(w.avgHeartRate ?? w.avg_heart_rate) as number)
            : null,
        max_hr:
          num(w.maxHeartRate ?? w.max_heart_rate) != null
            ? Math.round(num(w.maxHeartRate ?? w.max_heart_rate) as number)
            : null,
        notes: typeof w.notes === "string" ? w.notes : null,
        raw_payload: w,
        synced_at: new Date().toISOString(),
      };

      if (externalId) {
        const { error } = await sb
          .from("workouts")
          .upsert(row, { onConflict: "external_id" });
        if (error) throw new Error(error.message);
      } else {
        // Without a stable id, fall back to insert; risk of duplicates if HAE
        // re-sends, but better than dropping the workout.
        const { error } = await sb.from("workouts").insert(row);
        if (error) throw new Error(error.message);
      }
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

function withoutNullish<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
