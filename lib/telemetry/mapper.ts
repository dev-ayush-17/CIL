import type { TelemetryFrame } from "./schema";

/**
 * Single integration point when the ESP32 payload shape differs from TelemetryFrame.
 * Keep components on TelemetryFrame; map inbound JSON here only.
 */
export function mapInboundPayload(raw: unknown): TelemetryFrame {
  if (!isFrame(raw)) {
    throw new Error("Telemetry payload failed schema check");
  }
  const f = raw as Partial<TelemetryFrame>;

  return {
    seq: f.seq ?? 0,
    receivedAt: f.receivedAt ?? new Date().toISOString(),
    pose: f.pose ?? null,
    mission: {
      id: f.mission?.id ?? "DELTA-4",
      phase: f.mission?.phase ?? "survey",
      robotOnline: f.mission?.robotOnline ?? true,
      elapsedSec: f.mission?.elapsedSec ?? 0,
      distanceM: f.mission?.distanceM ?? 0,
      tunnelProgressPct: f.mission?.tunnelProgressPct ?? 0,
      sector: f.mission?.sector ?? "S7-PORTAL",
    },
    link: {
      quality: f.link?.quality ?? "online",
      batteryPct: f.link?.batteryPct ?? 84,
      signalPct: f.link?.signalPct ?? 90,
      snrDbm: f.link?.snrDbm ?? -65,
      nodesDropped: f.link?.nodesDropped ?? 0,
      nodesTotal: f.link?.nodesTotal ?? 10,
    },
    power: {
      mainPct: f.power?.mainPct ?? 85,
      voltageV: f.power?.voltageV ?? 24.0,
      currentA: f.power?.currentA ?? 1.5,
      batteryHealthPct: f.power?.batteryHealthPct ?? 95,
    },
    thermal: {
      mainboard: f.thermal?.mainboard ?? { currentC: 38, minC: 30, maxC: 50, avgC: 38 },
      ambientC: f.thermal?.ambientC ?? 26.5,
      humidityPct: f.thermal?.humidityPct ?? 58,
    },
    gas: {
      coPpm: f.gas?.coPpm ?? 0,
      coStatus: f.gas?.coStatus ?? "ok",
      coStats: f.gas?.coStats ?? { currentC: f.gas?.coPpm ?? 0, minC: 0, maxC: f.gas?.coPpm ?? 0, avgC: f.gas?.coPpm ?? 0 },
      ch4Ppm: f.gas?.ch4Ppm ?? 0,
      ch4Status: f.gas?.ch4Status ?? "ok",
      ch4Warn: f.gas?.ch4Warn ?? false,
      ch4Crit: f.gas?.ch4Crit ?? false,
      ch4WarnThresholdPpm: f.gas?.ch4WarnThresholdPpm ?? 1.0,
      ch4ExplThresholdPpm: f.gas?.ch4ExplThresholdPpm ?? 5.0,
    },
    air: {
      pm1: f.air?.pm1 ?? 12,
      pm25: f.air?.pm25 ?? 34,
      pm10: f.air?.pm10 ?? 45,
    },
    water: f.water ?? "dry",
    lidar: {
      leftM: f.lidar?.leftM ?? 1.8,
      rightM: f.lidar?.rightM ?? 1.8,
    },
    motion: {
      speedMps: f.motion?.speedMps ?? 0,
      speedMaxMps: f.motion?.speedMaxMps ?? 2.0,
    },
    control: f.control ?? {
      mode: "drive",
      tiltRollPct: 50,
      heightPct: 50,
      speed: "med",
      lights: "med",
      vision: "rgb",
      driveDir: "stop",
      walkDir: "stop",
      gimbal: { pitch: 0, yaw: 0 },
      estopActive: false,
    },
    cameras: f.cameras ?? {
      rgb: { recording: true, fps: 30, resolution: "1080p", streamUrl: "" },
      thermal: { recording: false, fps: 24, resolution: "720p", streamUrl: "" },
    },
    log: f.log ?? [],
    alerts: f.alerts ?? [],
  };
}

function isFrame(raw: unknown): raw is TelemetryFrame {
  if (!raw || typeof raw !== "object") return false;
  return true;
}
