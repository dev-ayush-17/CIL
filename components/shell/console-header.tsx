"use client";

import { useEffect, useState } from "react";
import { StatusLamp } from "@/components/ui/marks";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";
import { useView } from "@/components/shell/view-context";

export function ConsoleHeader() {
  const { frame, link } = useTelemetryContext();
  const { view, setView } = useView();
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
    <header className="sticky top-0 z-[var(--z-header)] grid grid-cols-1 items-center gap-[var(--space-sm)] border-b-[2px] border-[var(--color-ink)] bg-[var(--color-paper)] px-[var(--page-gutter)] py-[var(--space-sm)] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="min-w-0 flex flex-col justify-center">
        <p className="label m-0">Coal India Limited</p>
        <p className="font-display m-0 text-[length:var(--text-xl)] font-bold uppercase leading-none tracking-[0.08em] [overflow-wrap:anywhere]">
          Tunnel Assist Console
        </p>
      </div>
      
      <nav className="flex items-center gap-[2px] bg-[#070D18] p-1 border border-[var(--color-rule)] rounded-md font-mono text-[11px]" aria-label="Header navigation">
        <button
          type="button"
          className={`px-3 py-1.5 font-bold uppercase tracking-wider transition-all duration-200 rounded ${
            view === "dashboard"
              ? "bg-[#3B82F6] text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]"
              : "text-[var(--color-ink-2)] hover:text-white hover:bg-white/5"
          }`}
          onClick={() => setView("dashboard")}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 font-bold uppercase tracking-wider transition-all duration-200 rounded ${
            view === "twin"
              ? "bg-[#3B82F6] text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]"
              : "text-[var(--color-ink-2)] hover:text-white hover:bg-white/5"
          }`}
          onClick={() => setView("twin")}
        >
          Digital Twin
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 font-bold uppercase tracking-wider transition-all duration-200 rounded ${
            view === "control"
              ? "bg-[#3B82F6] text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]"
              : "text-[var(--color-ink-2)] hover:text-white hover:bg-white/5"
          }`}
          onClick={() => setView("control")}
        >
          Robot Control
        </button>
      </nav>

      <div className="flex min-w-0 flex-wrap items-center justify-start gap-x-[var(--space-md)] gap-y-[var(--space-xs)] md:justify-end">
        <div className={isStale ? "animate-pulse" : ""}>
          <StatusLamp tone={status.tone} label={status.label} />
        </div>
        <div>
          <p className="label m-0">Bat</p>
          <p className="num m-0 text-[length:var(--text-md)]">
            {frame?.link?.batteryPct != null ? `${frame.link.batteryPct.toFixed(0)}%` : "—"}
          </p>
        </div>
        <div>
          <p className="label m-0">Sig</p>
          <p className="num m-0 text-[length:var(--text-md)]">
            {frame?.link?.signalPct != null ? `${frame.link.signalPct.toFixed(0)}%` : "—"}
          </p>
        </div>
        <div>
          <p className="label m-0">UTC</p>
          <p className="num m-0 text-[length:var(--text-md)] text-[var(--color-accent)]" suppressHydrationWarning>
            {utc}
          </p>
        </div>
      </div>
    </header>
  );
}
