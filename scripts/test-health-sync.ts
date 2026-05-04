/**
 * Standalone smoke test for /api/health-sync.
 * Reads HEALTH_SYNC_SECRET from .env.local, posts a synthetic 7-day batch
 * with 3 workouts, and prints the response. Run with:
 *   npx tsx scripts/test-health-sync.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(file: string) {
  try {
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const [, k, v] = m;
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}

loadEnv(resolve(process.cwd(), ".env.local"));

const URL = process.env.HEALTH_SYNC_URL ?? "http://localhost:3000/api/health-sync";
const SECRET = process.env.HEALTH_SYNC_SECRET;
if (!SECRET) {
  console.error("Missing HEALTH_SYNC_SECRET in .env.local");
  process.exit(1);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function haeDate(daysAgo: number, hour = 0, minute = 0): string {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:00 +0000`;
}

const days = Array.from({ length: 7 }, (_, i) => 6 - i); // 6..0 (oldest first)

function metricSeries(name: string, units: string, valueFor: (offset: number) => unknown) {
  return {
    name,
    units,
    data: days.map((offset) => ({ date: haeDate(offset), ...(valueFor(offset) as object) })),
  };
}

const payload = {
  data: {
    metrics: [
      metricSeries("step_count", "count", (o) => ({ qty: 7000 + o * 350 + Math.round(Math.random() * 1500) })),
      metricSeries("active_energy", "kcal", (o) => ({ qty: 380 + o * 12 + Math.round(Math.random() * 80) })),
      metricSeries("basal_energy_burned", "kcal", () => ({ qty: 1620 + Math.round(Math.random() * 60) })),
      metricSeries("heart_rate", "bpm", () => ({
        Avg: 70 + Math.round(Math.random() * 8),
        Max: 140 + Math.round(Math.random() * 20),
        Min: 50 + Math.round(Math.random() * 6),
      })),
      metricSeries("resting_heart_rate", "bpm", () => ({ Avg: 56 + Math.round(Math.random() * 4) })),
      metricSeries("heart_rate_variability", "ms", () => ({ qty: 45 + Math.random() * 20 })),
      metricSeries("sleep_analysis", "hours", () => ({
        asleep: 6.4 + Math.random() * 1.4,
        inBed: 7.1 + Math.random() * 1.2,
      })),
      metricSeries("distance_walking_running", "km", (o) => ({ qty: 4 + o * 0.3 + Math.random() * 2 })),
      metricSeries("flights_climbed", "count", () => ({ qty: 6 + Math.round(Math.random() * 8) })),
      metricSeries("apple_exercise_time", "min", () => ({ qty: 18 + Math.round(Math.random() * 30) })),
      metricSeries("apple_stand_hour", "hr", () => ({ qty: 9 + Math.round(Math.random() * 4) })),
    ],
    workouts: [
      {
        id: `test-run-${isoDate(5)}`,
        name: "Running",
        start: haeDate(5, 7, 30),
        end: haeDate(5, 8, 5),
        duration: 35,
        totalEnergyBurned: 410,
        activeEnergyBurned: 360,
        totalDistance: 5.6,
        avgHeartRate: 154,
        maxHeartRate: 178,
      },
      {
        id: `test-strength-${isoDate(3)}`,
        name: "Strength Training",
        start: haeDate(3, 18, 0),
        end: haeDate(3, 18, 50),
        duration: 50,
        totalEnergyBurned: 360,
        activeEnergyBurned: 300,
        totalDistance: 0,
        avgHeartRate: 122,
        maxHeartRate: 158,
      },
      {
        id: `test-walk-${isoDate(1)}`,
        name: "Walking",
        start: haeDate(1, 12, 30),
        end: haeDate(1, 13, 5),
        duration: 35,
        totalEnergyBurned: 180,
        activeEnergyBurned: 140,
        totalDistance: 3.1,
        avgHeartRate: 102,
        maxHeartRate: 124,
      },
    ],
  },
};

async function main() {
  console.log(`POST ${URL}`);
  console.log("Payload (truncated):");
  console.log(JSON.stringify(payload, null, 2).slice(0, 1200) + "\n...\n");

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log("Status:", res.status);
  try {
    console.log("Response:", JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log("Response (raw):", text);
  }
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
