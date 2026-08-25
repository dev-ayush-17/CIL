import type { TelemetryFrame } from "./schema";

/**
 * Single integration point when the ESP32 payload shape differs from TelemetryFrame.
 * Keep components on TelemetryFrame; map inbound JSON here only.
 */
export function mapInboundPayload(raw: unknown): TelemetryFrame {
  if (!isFrame(raw)) {
    throw new Error("Telemetry payload failed schema check");
  }
  return raw;
}

function isFrame(raw: unknown): raw is TelemetryFrame {
  if (!raw || typeof raw !== "object") return false;
  const f = raw as TelemetryFrame;
  return (
    typeof f.seq === "number" &&
    typeof f.mission?.id === "string" &&
    typeof f.power?.mainPct === "number" &&
    typeof f.gas?.ch4Ppm === "number"
  );
}
