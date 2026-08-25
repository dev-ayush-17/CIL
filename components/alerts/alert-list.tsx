"use client";

import { Bezel } from "@/components/ui/bezel";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";

export function AlertList() {
  const { frame } = useTelemetryContext();
  const alerts = frame?.alerts ?? [];

  return (
    <Bezel title="Fault log" stamp={`${alerts.length}`}>
      {alerts.length === 0 ? (
        <p className="num m-0 text-[length:var(--text-sm)] text-[var(--color-nominal)]">No active faults</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {alerts.map((a) => (
            <li key={a.id} className="border-b border-[var(--color-rule-2)] py-[var(--space-2xs)]">
              <p className="label m-0" style={{ color: a.severity === "hazard" ? "var(--color-hazard)" : "var(--color-caution)" }}>
                {a.severity} · {a.code}
              </p>
              <p className="num m-0 text-[length:var(--text-xs)]">{a.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Bezel>
  );
}
