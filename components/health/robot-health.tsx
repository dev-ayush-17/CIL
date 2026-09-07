"use client";

import { BarMeter, RadialGauge } from "@/components/ui/gauges";
import { Bezel } from "@/components/ui/bezel";
import { SignalBars } from "@/components/ui/marks";
import { useView } from "@/components/shell/view-context";
import { useTelemetryContext } from "@/lib/telemetry/telemetry-context";

export function RobotHealth() {
  const { frame, link, sendCommand } = useTelemetryContext();
  const { view, setView } = useView();
  const mb = frame?.thermal.mainboard;
  const estopActive = frame?.control.estopActive ?? false;

  return (
    <aside className="flex min-w-0 flex-col gap-[var(--space-sm)]">
      <Bezel title="Robot health" stamp={link === "online" ? "LIVE" : "HOLD"}>
        <RadialGauge value={frame?.power.mainPct ?? 0} label="Pwr lvl" />
        <p className="num mt-[var(--space-2xs)] text-center text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
          {frame ? `${frame.power.voltageV.toFixed(1)} V  ·  ${frame.power.currentA.toFixed(1)} A` : "—"}
        </p>
        <div className="mt-[var(--space-md)] border-t border-[var(--color-rule)] pt-[var(--space-sm)]">
          <p className="label m-0">Mb temp</p>
          <p className="num m-0 text-[length:var(--text-xl)]">{mb ? `${mb.currentC.toFixed(1)}°C` : "—"}</p>
          <p className="num m-0 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
            {mb
              ? `Min ${mb.minC.toFixed(0)}°  Max ${mb.maxC.toFixed(0)}°  Avg ${mb.avgC.toFixed(0)}°`
              : "Min —  Max —  Avg —"}
          </p>
        </div>
        <div className="mt-[var(--space-sm)] flex items-center justify-between gap-[var(--space-sm)]">
          <div>
            <p className="label m-0">Link s/n</p>
            <p className="num m-0">{frame ? `${frame.link.snrDbm.toFixed(0)} dBm` : "—"}</p>
          </div>
          <SignalBars level={frame?.link.signalPct ?? 0} />
        </div>
        <div className="mt-[var(--space-sm)]">
          <p className="label m-0">Nodes dropped</p>
          <p className="num m-0 text-[length:var(--text-lg)]">
            {frame ? `${frame.link.nodesDropped}/${frame.link.nodesTotal}` : "—"}
          </p>
        </div>
        <div className="mt-[var(--space-sm)] grid gap-[var(--space-sm)]">
          <BarMeter value={frame?.lidar.leftM ?? 0} max={2.5} label="Lidar L" warnBelow={0.4} />
          <BarMeter value={frame?.lidar.rightM ?? 0} max={2.5} label="Lidar R" warnBelow={0.4} />
        </div>
      </Bezel>
      <Bezel title="Chainage">
        <p className="num m-0 text-[length:var(--text-lg)]">{frame ? `${frame.mission.distanceM.toFixed(1)} m` : "—"}</p>
        <p className="label mb-[var(--space-2xs)] mt-[var(--space-xs)]">Tunnel progress</p>
        <div className="h-[8px] border border-[var(--color-rule)]">
          <div
            className="h-full bg-[var(--color-accent)]"
            style={{ width: `${frame?.mission.tunnelProgressPct ?? 0}%` }}
          />
        </div>
        <p className="num mt-[var(--space-2xs)] text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
          Session {frame ? formatElapsed(frame.mission.elapsedSec) : "—"}
        </p>
      </Bezel>
      <Bezel title="Safety system" className={estopActive ? "border-[var(--color-hazard)]" : ""}>
        {estopActive ? (
          <div className="flex flex-col gap-[var(--space-xs)]">
            <p className="num text-[length:var(--text-xs)] text-[var(--color-hazard)] uppercase tracking-wider text-center animate-pulse m-0 font-bold">
              ⚠️ ESTOP TRIGGERED
            </p>
            <button
              type="button"
              className="w-full latch"
              style={{ background: "var(--color-nominal)", color: "var(--color-accent-ink)", border: "none" }}
              disabled={link !== "online"}
              onClick={() => sendCommand({ type: "reset_estop" })}
            >
              RESET E-STOP
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="w-full py-2 bg-[var(--color-hazard)] text-[var(--color-accent-ink)] hover:bg-red-800 font-bold tracking-wider text-xs border border-red-700 uppercase cursor-pointer transition-colors duration-200"
            disabled={link !== "online"}
            onClick={() => {
              console.log("👉 UI BUTTON WAS CLICKED!");
              console.log("Current Link State:", link);
              sendCommand({ type: "estop" });
            }}
          >
            🛑 EMERGENCY STOP
          </button>
        )}
      </Bezel>
      <nav className="grid grid-cols-2" aria-label="Console views">
        <button type="button" className="latch" aria-pressed={view === "dashboard"} onClick={() => setView("dashboard")}>
          Dashboard
        </button>
        <button type="button" className="latch" aria-pressed={view === "control"} onClick={() => setView("control")}>
          Robot control
        </button>
      </nav>
    </aside>
  );
}

function formatElapsed(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
