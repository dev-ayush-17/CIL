"use client";

import type { ReactNode } from "react";
import { Bezel } from "@/components/ui/bezel";
import { StatusLamp, WarnMark } from "@/components/ui/marks";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";
import { AlertList } from "@/components/alerts/alert-list";

export function EnvironmentPanel() {
  const { frame } = useTelemetryContext();
  const g = frame?.gas;
  const a = frame?.air;

  return (
    <aside className="flex min-w-0 flex-col gap-[var(--space-sm)]">
      <Bezel title="Atmosphere">
        <Row
          label="CH4 (methane)"
          value={g ? `${g.ch4Ppm.toFixed(2)} ppm` : "—"}
          extra={<WarnMark active={Boolean(g?.ch4Warn || g?.ch4Crit)} />}
          tone={g?.ch4Crit ? "hazard" : g?.ch4Warn ? "caution" : "nominal"}
        />
        <p className="num mb-[var(--space-sm)] text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
          Warn {g?.ch4WarnThresholdPpm ?? "—"} ppm · expl {g?.ch4ExplThresholdPpm ?? "—"} ppm
        </p>
        <Row
          label="CO"
          value={g ? `${g.coPpm.toFixed(2)} ppm` : "—"}
          extra={
            <span className="num text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
              {g
                ? `Min ${g.coStats.minC.toFixed(1)}  Max ${g.coStats.maxC.toFixed(1)}  Avg ${g.coStats.avgC.toFixed(1)}`
                : ""}
            </span>
          }
        />
        <div className="mb-[var(--space-sm)] h-[6px] border border-[var(--color-rule)]">
          <div className="h-full bg-[var(--color-nominal)]" style={{ width: `${Math.min(100, (g?.coPpm ?? 0) * 10)}%` }} />
        </div>
        <p className="label m-0">Particulates µg/m³</p>
        <Row label="PM1.0" value={a ? a.pm1.toFixed(1) : "—"} />
        <Row label="PM2.5" value={a ? a.pm25.toFixed(1) : "—"} tone={(a?.pm25 ?? 0) > 35 ? "caution" : "nominal"} />
        <Row label="PM10" value={a ? a.pm10.toFixed(1) : "—"} />
        <div className="mt-[var(--space-sm)] grid grid-cols-2 gap-[var(--space-xs)]">
          <div className="border border-[var(--color-rule)] p-[var(--space-xs)]">
            <p className="label m-0">Temp</p>
            <p className="num m-0 text-[length:var(--text-lg)]">{frame ? `${frame.thermal.ambientC.toFixed(1)}°C` : "—"}</p>
          </div>
          <div className="border border-[var(--color-rule)] p-[var(--space-xs)]">
            <p className="label m-0">Humidity</p>
            <p className="num m-0 text-[length:var(--text-lg)]">{frame ? `${frame.thermal.humidityPct.toFixed(0)}%` : "—"}</p>
          </div>
        </div>
        <div className="mt-[var(--space-sm)] flex justify-between">
          <span className="label">Water detect</span>
          <StatusLamp tone={frame?.water === "wet" ? "hazard" : "nominal"} label={frame?.water === "wet" ? "Wet" : "Dry"} />
        </div>
        <Row label="Dist left" value={frame ? `${frame.lidar.leftM.toFixed(2)} m` : "—"} />
        <Row label="Dist right" value={frame ? `${frame.lidar.rightM.toFixed(2)} m` : "—"} />
      </Bezel>
      <Bezel title="Mission status">
        <StatusLamp
          tone={frame?.mission.robotOnline ? "nominal" : "hazard"}
          label={frame?.mission.robotOnline ? "Robot online" : "Robot offline"}
        />
        <p className="num mt-[var(--space-xs)] text-[length:var(--text-sm)]">
          Phase {frame?.mission.phase ?? "—"} · {frame?.mission.id ?? "—"}
        </p>
      </Bezel>
      <AlertList />
    </aside>
  );
}

function Row({
  label,
  value,
  extra,
  tone = "nominal",
}: {
  label: string;
  value: string;
  extra?: ReactNode;
  tone?: "nominal" | "caution" | "hazard";
}) {
  const color =
    tone === "hazard" ? "var(--color-hazard)" : tone === "caution" ? "var(--color-caution)" : "var(--color-ink)";
  return (
    <div className="mb-[var(--space-2xs)] flex items-baseline justify-between gap-[var(--space-xs)] border-b border-[var(--color-rule-2)] py-[var(--space-2xs)]">
      <span className="label m-0">{label}</span>
      <span className="flex items-center gap-[var(--space-xs)]">
        {extra}
        <span className="num text-[length:var(--text-sm)]" style={{ color }}>
          {value}
        </span>
      </span>
    </div>
  );
}
