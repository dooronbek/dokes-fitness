type Point = { date: string; value: number | null };

export default function TrendChart({
  title,
  unit,
  points,
  accent = "#a1a1aa",
}: {
  title: string;
  unit: string;
  points: Point[];
  accent?: string;
}) {
  const valid = points.filter((p): p is { date: string; value: number } => p.value != null);

  const w = 320;
  const h = 110;
  const pad = { l: 8, r: 8, t: 12, b: 18 };

  if (valid.length < 2) {
    return (
      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm text-zinc-400">{title}</h3>
          {valid.length === 1 && (
            <span className="text-lg font-semibold">
              {valid[0].value}
              <span className="text-xs text-zinc-500 ml-1">{unit}</span>
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          {valid.length === 0 ? "No data yet — log something." : "Need 2+ entries to chart."}
        </p>
      </div>
    );
  }

  const xs = valid.map((_, i) => i);
  const ys = valid.map((p) => p.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxY - minY, 0.0001);
  const xScale = (i: number) =>
    pad.l + (i / Math.max(xs[xs.length - 1], 1)) * (w - pad.l - pad.r);
  const yScale = (v: number) =>
    pad.t + (1 - (v - minY) / span) * (h - pad.t - pad.b);

  const d = valid
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(p.value).toFixed(1)}`)
    .join(" ");

  const last = valid[valid.length - 1];
  const first = valid[0];
  const delta = last.value - first.value;
  const deltaSign = delta > 0 ? "+" : "";

  return (
    <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm text-zinc-400">{title}</h3>
        <div className="text-right">
          <span className="text-lg font-semibold">
            {last.value}
            <span className="text-xs text-zinc-500 ml-1">{unit}</span>
          </span>
          <span
            className={`ml-2 text-xs ${
              delta < 0 ? "text-emerald-400" : delta > 0 ? "text-amber-400" : "text-zinc-500"
            }`}
          >
            {deltaSign}
            {delta.toFixed(1)}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[110px]">
        <path d={d} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {valid.map((p, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(p.value)} r="2" fill={accent} />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
        <span>{first.date.slice(5)}</span>
        <span>{last.date.slice(5)}</span>
      </div>
    </div>
  );
}
