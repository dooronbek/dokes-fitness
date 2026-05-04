export type DecimalParseResult =
  | { ok: true; value: number | null }
  | { ok: false };

export function parseDecimalInput(raw: string): DecimalParseResult {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}
