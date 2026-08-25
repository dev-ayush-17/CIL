import { ConsoleShell } from "@/components/shell/console-shell";
import { ViewProvider } from "@/components/shell/view-context";
import { TelemetryProvider } from "@/lib/telemetry/telemetry-context";

export default function HomePage() {
  return (
    <TelemetryProvider>
      <ViewProvider>
        <ConsoleShell />
      </ViewProvider>
    </TelemetryProvider>
  );
}
