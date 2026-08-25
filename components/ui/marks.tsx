export function SignalBars({ level }: { level: number }) {
  const filled = Math.round((Math.max(0, Math.min(100, level)) / 100) * 4);
  return (
    <svg viewBox="0 0 20 14" width="20" height="14" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 5}
          y={10 - i * 3}
          width="3.5"
          height={4 + i * 3}
          fill={i < filled ? "var(--color-accent)" : "var(--color-rule)"}
        />
      ))}
    </svg>
  );
}

export function StatusLamp({
  tone,
  label,
}: {
  tone: "nominal" | "caution" | "hazard" | "muted";
  label: string;
}) {
  const fill =
    tone === "nominal"
      ? "var(--color-nominal)"
      : tone === "caution"
        ? "var(--color-caution)"
        : tone === "hazard"
          ? "var(--color-hazard)"
          : "var(--color-muted)";
  return (
    <span className="inline-flex items-center gap-[var(--space-2xs)]">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <circle cx="5" cy="5" r="3.5" fill="none" stroke={fill} strokeWidth="1.2" />
        <circle cx="5" cy="5" r="1.6" fill={fill} />
      </svg>
      <span className="label" style={{ color: fill }}>
        {label}
      </span>
    </span>
  );
}

export function WarnMark({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M7 1.5 13 12.5H1z"
        fill="none"
        stroke={active ? "var(--color-hazard)" : "var(--color-rule)"}
        strokeWidth="1.2"
      />
      <path d="M7 5.2v4" stroke={active ? "var(--color-hazard)" : "var(--color-muted)"} strokeWidth="1.2" />
      <circle cx="7" cy="10.6" r="0.6" fill={active ? "var(--color-hazard)" : "var(--color-muted)"} />
    </svg>
  );
}
