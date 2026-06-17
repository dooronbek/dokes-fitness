// All "calendar day" logic (today / yesterday / N-days-ago, and the date a
// log/meal/plan belongs to) is interpreted in the USER's local timezone — NOT
// the runtime's. This matters because these helpers run both in the browser
// (user's phone, already Bishkek) and in API routes on Vercel (UTC). Using the
// runtime's local date made the server think "today" was the UTC date, so after
// midnight Bishkek the coach/planner were a day behind and meals logged late at
// night were filed under the previous day. Locking to Asia/Bishkek fixes both.
//
// We store log_date / meal_date / plan_date as YYYY-MM-DD strings in this tz.

export const USER_TIMEZONE = "Asia/Bishkek"; // UTC+6, no DST

// "en-CA" formats as YYYY-MM-DD, which is exactly our storage format.
const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: USER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayISO(): string {
  return ymdFormatter.format(new Date());
}

export function daysAgoISO(n: number): string {
  // Anchor on today's Bishkek date, then walk back n calendar days. We treat the
  // YYYY-MM-DD as a UTC midnight instant purely for the arithmetic — only the
  // date portion is ever read back out, so DST/offset never enters the result.
  const anchor = new Date(`${todayISO()}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - n);
  return anchor.toISOString().slice(0, 10);
}

export function yesterdayISO(): string {
  return daysAgoISO(1);
}

// Human-readable current local time for prompt headers, e.g.
// "2026-06-18 01:19 (Asia/Bishkek, UTC+6)".
export function nowInUserTZ(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} (${USER_TIMEZONE}, UTC+6)`;
}

export function formatShort(iso: string): string {
  // YYYY-MM-DD -> M/D
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}
