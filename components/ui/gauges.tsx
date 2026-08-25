"use client";

export function RadialGauge({
  value,
  max = 100,
  label,
  unit,
}: {
  value: number;
  max?: number;
  label: string;
  unit?: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = c * 0.75;
  const offset = dash - dash * pct;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 108 96" className="w-full max-w-[9.5rem]" role="img" aria-label={`${label} ${value.toFixed(1)}`}>
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--color-rule)" strokeWidth="7" strokeDasharray={`${dash} ${c}`} strokeDashoffset={c * 0.125} transform="rotate(135 54 54)" />
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="7"
          strokeDasharray={`${dash} ${c}`}
          strokeDashoffset={offset + c * 0.125}
          transform="rotate(135 54 54)"
          style={{ transition: "stroke-dashoffset var(--dur-short) var(--ease-out)" }}
        />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const a = Math.PI * 0.75 + t * Math.PI * 1.5;
          const x1 = 54 + Math.cos(a) * 34;
          const y1 = 54 + Math.sin(a) * 34;
          const x2 = 54 + Math.cos(a) * 40;
          const y2 = 54 + Math.sin(a) * 40;
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-ink-2)" strokeWidth="1" />;
        })}
        <text x="54" y="52" textAnchor="middle" fill="var(--color-ink)" fontFamily="var(--font-mono)" fontSize="16">
          {Number.isInteger(max) && max === 100 ? `${Math.round(value)}` : value.toFixed(2)}
        </text>
        <text x="54" y="68" textAnchor="middle" fill="var(--color-muted)" fontFamily="var(--font-display)" fontSize="8" letterSpacing="1.4">
          {unit ?? "%"}
        </text>
      </svg>
      <p className="label m-0">{label}</p>
    </div>
  );
}

export function BarMeter({
  value,
  max,
  label,
  warnBelow,
}: {
  value: number;
  max: number;
  label: string;
  warnBelow?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const warn = warnBelow !== undefined && value < warnBelow;
  return (
    <div>
      <div className="mb-[var(--space-2xs)] flex justify-between gap-[var(--space-xs)]">
        <span className="label">{label}</span>
        <span className="num text-[length:var(--text-sm)]" style={{ color: warn ? "var(--color-hazard)" : "var(--color-ink)" }}>
          {value.toFixed(2)} m
        </span>
      </div>
      <div className="tick-strip mb-[2px]" />
      <div className="h-[10px] border border-[var(--color-rule)] bg-[var(--color-paper)]">
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: warn ? "var(--color-hazard)" : "var(--color-accent)",
            transition: "width var(--dur-short) var(--ease-out)",
          }}
        />
      </div>
    </div>
  );
}
