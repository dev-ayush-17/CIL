/** Contract for one telemetry update. Components render this shape only. */

export type ConnectionQuality = "online" | "degraded" | "offline";
export type DriveMode = "drive" | "walk";
export type SpeedGear = "slow" | "med" | "fast";
export type LightLevel = "off" | "low" | "med" | "high";
export type VisionMode = "rgb" | "thermal" | "ir";
export type WaterState = "dry" | "wet";
export type MissionPhase = "preflight" | "ingress" | "survey" | "hold" | "egress";
export type AlertSeverity = "info" | "caution" | "hazard";
export type SysLogLevel = "SYS" | "LDR" | "COM" | "GAS" | "NAV" | "PWR";

export interface TemperatureStats {
  currentC: number;
  minC: number;
  maxC: number;
  avgC: number;
}

export interface LidarClearance {
  leftM: number;
  rightM: number;
}

export interface Particulates {
  pm1: number;
  pm25: number;
  pm10: number;
}

export interface CameraMeta {
  recording: boolean;
  fps: number;
  resolution: string;
  /** Stream URL when a real encoder is attached; empty string = mock renderer. */
  streamUrl: string;
}

export interface SysLogEntry {
  ts: string;
  source: SysLogLevel;
  message: string;
}

export interface AlertEntry {
  id: string;
  ts: string;
  severity: AlertSeverity;
  code: string;
  message: string;
}

export interface TelemetryFrame {
  seq: number;
  receivedAt: string;
  mission: {
    id: string;
    phase: MissionPhase;
    robotOnline: boolean;
    elapsedSec: number;
    distanceM: number;
    tunnelProgressPct: number;
    sector: string;
  };
  link: {
    quality: ConnectionQuality;
    batteryPct: number;
    signalPct: number;
    snrDbm: number;
    nodesDropped: number;
    nodesTotal: number;
  };
  power: {
    mainPct: number;
    voltageV: number;
    currentA: number;
    batteryHealthPct: number;
  };
  thermal: {
    mainboard: TemperatureStats;
    ambientC: number;
    humidityPct: number;
  };
  gas: {
    coPpm: number;
    coStats: TemperatureStats;
    ch4Ppm: number;
    ch4Warn: boolean;
    ch4Crit: boolean;
    ch4WarnThresholdPpm: number;
    ch4ExplThresholdPpm: number;
  };
  air: Particulates;
  water: WaterState;
  lidar: LidarClearance;
  motion: {
    speedMps: number;
    speedMaxMps: number;
  };
  control: {
    mode: DriveMode;
    tiltRollPct: number;
    heightPct: number;
    speed: SpeedGear;
    lights: LightLevel;
    vision: VisionMode;
    driveDir: "stop" | "fwd" | "back" | "left" | "right";
    walkDir: "stop" | "fwd" | "back" | "left" | "right";
    gimbal: { pitch: number; yaw: number };
  };
  cameras: {
    rgb: CameraMeta;
    thermal: CameraMeta;
  };
  log: SysLogEntry[];
  alerts: AlertEntry[];
}

export type ControlCommand =
  | { type: "set_mode"; mode: DriveMode }
  | { type: "set_posture"; tiltRollPct: number; heightPct: number }
  | { type: "posture_preset"; preset: "crouch" | "stand" }
  | { type: "drive"; dir: TelemetryFrame["control"]["driveDir"] }
  | { type: "walk"; dir: TelemetryFrame["control"]["walkDir"] }
  | { type: "set_speed"; speed: SpeedGear }
  | { type: "set_lights"; intensity: LightLevel }
  | { type: "gimbal"; dir: "up" | "down" | "left" | "right" | "center" }
  | { type: "set_vision"; mode: VisionMode }
  | { type: "mission_note"; text: string };

export interface ControlAck {
  ok: true;
  type: "ack";
  command: ControlCommand;
  at: string;
}

export interface WsInbound {
  type: "frame";
  frame: TelemetryFrame;
}

export interface WsOutbound {
  type: "command";
  command: ControlCommand;
}
