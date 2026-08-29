"use client";

import { useEffect, useState } from "react";
import { StatusLamp } from "@/components/ui/marks";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";

export function ConsoleHeader() {
  const { frame, link } = useTelemetryContext();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const getStatusToneAndLabel = (): { tone: "nominal" | "caution" | "hazard" | "muted"; label: string } => {
    switch (link) {
      case "online":
        if (frame?.mission.robotOnline) {
          return { tone: "nominal", label: "Online" };
        }
        return { tone: "caution", label: "Standby" };
      case "connecting":
        return { tone: "caution", label: "Connecting" };
      case "reconnecting":
        return { tone: "caution", label: "Reconnecting" };
      case "stale":
        return { tone: "hazard", label: "Stale Link" };
      case "offline":
      default:
        return { tone: "hazard", label: "Offline" };
    }
  };

  const status = getStatusToneAndLabel();
  const isStale = link === "stale";
  const utc = clock.toISOString().slice(11, 19);

  return (
    <header className="sticky top-0 z-[var(--z-header)] grid grid-cols-1 items-end gap-[var(--space-sm)] border-b-[2px] border-[var(--color-ink)] bg-[var(--color-paper)] px-[var(--page-gutter)] py-[var(--space-sm)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)]">
      <div className="min-w-0">
        <p className="label m-0">Coal India Limited</p>
        <p className="font-display m-0 text-[length:var(--text-xl)] font-bold uppercase leading-none tracking-[0.08em] [overflow-wrap:anywhere]">
          Tunnel Assist Console
        </p>
      </div>
      <div className="min-w-0 text-left md:text-center">
        <p className="label m-0">Active mission</p>
        <p className="font-display m-0 text-[length:var(--text-lg)] font-bold tracking-[0.18em]">
          {frame?.mission.id ?? "—"}
        </p>
        <p className="num m-0 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
          {frame?.mission.phase.toUpperCase() ?? "NO FRAME"} · {frame?.mission.sector ?? "—"}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap items-end justify-start gap-x-[var(--space-lg)] gap-y-[var(--space-xs)] md:justify-end">
        <div className={isStale ? "animate-pulse" : ""}>
          <StatusLamp tone={status.tone} label={status.label} />
        </div>
        <div>
          <p className="label m-0">Bat</p>
          <p className="num m-0 text-[length:var(--text-md)]">{frame ? `${frame.link.batteryPct.toFixed(0)}%` : "—"}</p>
        </div>
        <div>
          <p className="label m-0">Sig</p>
          <p className="num m-0 text-[length:var(--text-md)]">{frame ? `${frame.link.signalPct.toFixed(0)}%` : "—"}</p>
        </div>
        <div>
          <p className="label m-0">UTC</p>
          <p className="num m-0 text-[length:var(--text-md)] text-[var(--color-accent)]">{utc}</p>
        </div>
      </div>
    </header>
  );
}
