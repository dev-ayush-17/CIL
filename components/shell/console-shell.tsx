"use client";

import { RobotHealth } from "@/components/health/robot-health";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { RobotControl } from "@/components/control/robot-control";
import { EnvironmentPanel } from "@/components/environment/environment-panel";
import { ConsoleHeader } from "@/components/shell/console-header";
import { LogTicker } from "@/components/shell/log-ticker";
import { useView } from "@/components/shell/view-context";

export function ConsoleShell() {
  const { view } = useView();

  return (
    <div className="flex min-h-dvh flex-col">
      <ConsoleHeader />
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-[var(--space-sm)] p-[var(--page-gutter)] lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,18rem)]">
        <RobotHealth />
        <main className="min-w-0">{view === "dashboard" ? <AnalyticsView /> : <RobotControl />}</main>
        <EnvironmentPanel />
      </div>
      <LogTicker />
    </div>
  );
}
