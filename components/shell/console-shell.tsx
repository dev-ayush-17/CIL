"use client";

import dynamic from "next/dynamic";
import { RobotHealth } from "@/components/health/robot-health";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { RobotControl } from "@/components/control/robot-control";
import { EnvironmentPanel } from "@/components/environment/environment-panel";
import { ConsoleHeader } from "@/components/shell/console-header";
import { LogTicker } from "@/components/shell/log-ticker";
import { useView } from "@/components/shell/view-context";

const DigitalTwinView = dynamic(
  () => import("@/components/digital-twin/digital-twin-view"),
  { ssr: false, loading: () => <TwinLoadingPlaceholder /> }
);

export function ConsoleShell() {
  const { view } = useView();

  const mainContent =
    view === "twin" ? (
      <DigitalTwinView />
    ) : view === "control" ? (
      <RobotControl />
    ) : (
      <AnalyticsView />
    );

  return (
    <div className="flex min-h-dvh flex-col">
      <ConsoleHeader />
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-[var(--space-sm)] p-[var(--page-gutter)] lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,18rem)]">
        <RobotHealth />
        <main className="min-w-0">{mainContent}</main>
        <EnvironmentPanel />
      </div>
      <LogTicker />
    </div>
  );
}

function TwinLoadingPlaceholder() {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center border border-[var(--color-rule)] bg-[#050B14] font-mono text-[var(--color-muted)]" style={{ minHeight: "520px" }}>
      <span className="animate-pulse text-[11px] tracking-wider">INITIALIZING DIGITAL TWIN ENGINE...</span>
    </div>
  );
}
