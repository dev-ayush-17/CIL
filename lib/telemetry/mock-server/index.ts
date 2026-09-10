import { WebSocketServer, type WebSocket } from "ws";
import type {
  AlertEntry,
  ControlCommand,
  SysLogEntry,
  TelemetryFrame,
} from "../schema";

const PORT = Number(process.env.TELEMETRY_WS_PORT ?? 8765);

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function walk(n: number, min: number, max: number, step: number) {
  return clamp(n + (Math.random() - 0.5) * step, min, max);
}

function iso() {
  return new Date().toISOString();
}

function clock() {
  return new Date().toISOString().slice(11, 19);
}

const logs: SysLogEntry[] = [
  { ts: clock(), source: "SYS", message: "LINK ESTABLISHED — SECTOR 7 PORTAL" },
  { ts: clock(), source: "LDR", message: "LIDAR CALIBRATION LOCKED" },
];

const alerts: AlertEntry[] = [];

const state: TelemetryFrame = {
  seq: 0,
  receivedAt: iso(),
  pose: null,
  mission: {
    id: "DELTA-4",
    phase: "survey",
    robotOnline: true,
    elapsedSec: 1842,
    distanceM: 126.4,
    tunnelProgressPct: 38,
    sector: "S7-PORTAL",
  },
  link: {
    quality: "online",
    batteryPct: 84,
    signalPct: 92,
    snrDbm: -65,
    nodesDropped: 3,
    nodesTotal: 10,
  },
  power: {
    mainPct: 85,
    voltageV: 24.1,
    currentA: 12.4,
    batteryHealthPct: 84.3,
  },
  thermal: {
    mainboard: { currentC: 42, minC: 38, maxC: 45, avgC: 41 },
    ambientC: 28,
    humidityPct: 65,
  },
  gas: {
    coPpm: 4,
    coStatus: "ok",
    coStats: { currentC: 4, minC: 2, maxC: 6, avgC: 3.8 },
    ch4Ppm: 0.02,
    ch4Status: "ok",
    ch4Warn: false,
    ch4Crit: false,
    ch4WarnThresholdPpm: 5,
    ch4ExplThresholdPpm: 10,
  },
  air: { pm1: 12, pm25: 34, pm10: 45 },
  water: "dry",
  lidar: { leftM: 1.2, rightM: 0.8 },
  motion: { speedMps: 1.12, speedMaxMps: 2 },
  control: {
    mode: "drive",
    tiltRollPct: 56,
    heightPct: 58,
    speed: "med",
    lights: "med",
    vision: "rgb",
    driveDir: "stop",
    walkDir: "stop",
    gimbal: { pitch: 0, yaw: 0 },
    estopActive: false,
  },
  cameras: {
    rgb: { recording: true, fps: 30, resolution: "1080p", streamUrl: "" },
    thermal: { recording: false, fps: 24, resolution: "720p", streamUrl: "" },
  },
  log: [...logs],
  alerts: [],
};

function pushLog(source: SysLogEntry["source"], message: string) {
  logs.unshift({ ts: clock(), source, message });
  if (logs.length > 24) logs.pop();
}

function applyCommand(cmd: ControlCommand) {
  switch (cmd.type) {
    case "set_mode":
      state.control.mode = cmd.mode;
      pushLog("NAV", `OP MODE ${cmd.mode.toUpperCase()}`);
      break;
    case "set_posture":
      state.control.tiltRollPct = cmd.tiltRollPct;
      state.control.heightPct = cmd.heightPct;
      break;
    case "posture_preset":
      if (cmd.preset === "crouch") {
        state.control.tiltRollPct = 22;
        state.control.heightPct = 28;
      } else {
        state.control.tiltRollPct = 50;
        state.control.heightPct = 62;
      }
      pushLog("NAV", `POSTURE ${cmd.preset.toUpperCase()}`);
      break;
    case "drive":
      state.control.driveDir = cmd.dir;
      break;
    case "walk":
      state.control.walkDir = cmd.dir;
      break;
    case "set_speed":
      state.control.speed = cmd.speed;
      break;
    case "set_lights":
      state.control.lights = cmd.intensity;
      pushLog("SYS", `LIGHTS ${cmd.intensity.toUpperCase()}`);
      break;
    case "gimbal":
      if (cmd.dir === "up") state.control.gimbal.pitch = clamp(state.control.gimbal.pitch + 4, -40, 40);
      if (cmd.dir === "down") state.control.gimbal.pitch = clamp(state.control.gimbal.pitch - 4, -40, 40);
      if (cmd.dir === "left") state.control.gimbal.yaw = clamp(state.control.gimbal.yaw - 6, -80, 80);
      if (cmd.dir === "right") state.control.gimbal.yaw = clamp(state.control.gimbal.yaw + 6, -80, 80);
      if (cmd.dir === "center") state.control.gimbal = { pitch: 0, yaw: 0 };
      break;
    case "set_vision":
      state.control.vision = cmd.mode;
      pushLog("SYS", `VISION ${cmd.mode.toUpperCase()}`);
      break;
    case "mission_note":
      pushLog("SYS", `NOTE ${cmd.text.slice(0, 80)}`);
      break;
    case "estop":
      state.control.estopActive = true;
      state.control.driveDir = "stop";
      state.control.walkDir = "stop";
      state.motion.speedMps = 0;
      pushLog("SYS", "EMERGENCY STOP TRIGGERED - MOTION HALTED");
      break;
    case "reset_estop":
      state.control.estopActive = false;
      pushLog("SYS", "EMERGENCY STOP RESET - SYSTEM STANDBY");
      break;
  }
}

function tick() {
  state.seq += 1;
  state.receivedAt = iso();
  state.mission.elapsedSec += 1;
  
  // Motion is disabled if estop is active or direction is stopped
  const moving =
    !state.control.estopActive &&
    ((state.control.mode === "drive" && state.control.driveDir !== "stop") ||
      (state.control.mode === "walk" && state.control.walkDir !== "stop"));
      
  const gear = state.control.speed === "fast" ? 1.6 : state.control.speed === "med" ? 1.1 : 0.45;
  state.motion.speedMps = moving
    ? walk(gear, gear * 0.8, gear * 1.15, 0.08)
    : walk(0.05, 0, 0.12, 0.04);
    
  if (state.control.estopActive) {
    state.motion.speedMps = 0;
  }
  
  if (moving) {
    state.mission.distanceM += state.motion.speedMps;
    state.mission.tunnelProgressPct = clamp(
      state.mission.tunnelProgressPct + state.motion.speedMps * 0.04,
      0,
      100,
    );
  }

  state.power.mainPct = walk(state.power.mainPct, 18, 98, 0.35);
  state.link.batteryPct = state.power.mainPct;
  state.power.batteryHealthPct = walk(state.power.batteryHealthPct, 70, 96, 0.2);
  state.power.voltageV = walk(state.power.voltageV, 22.4, 25.2, 0.08);
  state.power.currentA = walk(state.power.currentA, moving ? 10 : 6, moving ? 18 : 13, 0.4);
  state.link.signalPct = walk(state.link.signalPct, 48, 99, 1.8);
  state.link.snrDbm = walk(state.link.snrDbm, -82, -48, 1.2);
  state.link.nodesDropped = clamp(
    Math.round(walk(state.link.nodesDropped, 0, 8, 0.4)),
    0,
    state.link.nodesTotal,
  );

  const mb = state.thermal.mainboard;
  mb.currentC = walk(mb.currentC, 36, 58, 0.45);
  mb.minC = Math.min(mb.minC, mb.currentC);
  mb.maxC = Math.max(mb.maxC, mb.currentC);
  mb.avgC = mb.avgC * 0.92 + mb.currentC * 0.08;
  state.thermal.ambientC = walk(state.thermal.ambientC, 22, 36, 0.25);
  state.thermal.humidityPct = walk(state.thermal.humidityPct, 48, 92, 0.6);

  const spike = state.seq % 47 === 0;
  state.gas.ch4Ppm = spike ? walk(6.2, 5.4, 8.8, 0.6) : walk(state.gas.ch4Ppm, 0.01, 2.4, 0.18);
  state.gas.ch4Warn = state.gas.ch4Ppm >= state.gas.ch4WarnThresholdPpm * 0.2;
  state.gas.ch4Crit = state.gas.ch4Ppm >= state.gas.ch4WarnThresholdPpm;
  state.gas.coPpm = walk(state.gas.coPpm, 0.4, 9, 0.35);
  state.gas.coStats.currentC = state.gas.coPpm;
  state.gas.coStats.minC = Math.min(state.gas.coStats.minC, state.gas.coPpm);
  state.gas.coStats.maxC = Math.max(state.gas.coStats.maxC, state.gas.coPpm);
  state.gas.coStats.avgC = state.gas.coStats.avgC * 0.9 + state.gas.coPpm * 0.1;

  state.air.pm1 = walk(state.air.pm1, 4, 28, 1.1);
  state.air.pm25 = walk(state.air.pm25, 10, 55, 1.6);
  state.air.pm10 = walk(state.air.pm10, 18, 80, 2.1);

  state.lidar.leftM = walk(state.lidar.leftM, 0.18, 2.4, 0.08);
  state.lidar.rightM = walk(state.lidar.rightM, 0.18, 2.4, 0.08);
  state.water = state.thermal.humidityPct > 90 && Math.random() > 0.92 ? "wet" : "dry";

  state.cameras.rgb.fps = Math.round(walk(state.cameras.rgb.fps, 24, 30, 1.2));
  state.cameras.thermal.fps = Math.round(walk(state.cameras.thermal.fps, 18, 26, 1));

  if (state.link.signalPct < 55) state.link.quality = "degraded";
  else state.link.quality = "online";
  state.mission.robotOnline = true;

  if (state.seq % 19 === 0) {
    pushLog("COM", `MESH PING ${state.link.signalPct.toFixed(0)}%  SNR ${state.link.snrDbm.toFixed(0)} dBm`);
  }
  if (state.seq % 31 === 0) {
    pushLog("NAV", `CHAINAGE ${state.mission.distanceM.toFixed(1)} m  SECTOR ${state.mission.sector}`);
  }

  const nextAlerts: AlertEntry[] = [];
  if (state.gas.ch4Crit) {
    nextAlerts.push({
      id: `ch4-${state.seq}`,
      ts: clock(),
      severity: "hazard",
      code: "GAS-CH4",
      message: `CH4 ${state.gas.ch4Ppm.toFixed(2)} ppm above warn ${state.gas.ch4WarnThresholdPpm}`,
    });
    if (state.seq % 5 === 0) pushLog("GAS", "CH4 THRESHOLD BREACH");
  } else if (state.gas.ch4Warn) {
    nextAlerts.push({
      id: `ch4w-${state.seq}`,
      ts: clock(),
      severity: "caution",
      code: "GAS-CH4",
      message: `CH4 climbing ${state.gas.ch4Ppm.toFixed(2)} ppm`,
    });
  }
  if (state.lidar.rightM < 0.35 || state.lidar.leftM < 0.35) {
    nextAlerts.push({
      id: `clr-${state.seq}`,
      ts: clock(),
      severity: "caution",
      code: "LIDAR-CLR",
      message: `Clearance L ${state.lidar.leftM.toFixed(2)} m  R ${state.lidar.rightM.toFixed(2)} m`,
    });
  }
  if (state.link.quality === "degraded") {
    nextAlerts.push({
      id: `lnk-${state.seq}`,
      ts: clock(),
      severity: "caution",
      code: "COM-SNR",
      message: `Link degraded ${state.link.snrDbm.toFixed(0)} dBm`,
    });
  }
  alerts.splice(0, alerts.length, ...nextAlerts.slice(0, 6));
  if (mb.currentC > 52) {
    alerts.push({
      id: `tmp-${state.seq}`,
      ts: clock(),
      severity: "caution",
      code: "MB-TEMP",
      message: `Mainboard ${mb.currentC.toFixed(1)} °C`,
    });
  }

  state.log = [...logs];
  state.alerts = [...alerts];
}

const wss = new WebSocketServer({ port: PORT });
const sockets = new Set<WebSocket>();

wss.on("connection", (socket) => {
  sockets.add(socket);
  console.log(`[mock-telemetry] client connected (${sockets.size})`);
  
  // Send initial frame
  socket.send(JSON.stringify({ type: "frame", frame: state }));

  socket.on("message", (buf) => {
    try {
      const msg = JSON.parse(String(buf)) as {
        type: string;
        commandId: string;
        timestamp: string;
        command?: ControlCommand;
      };

      if (msg.type === "ping" && msg.commandId) {
        // Send Pong back
        const pong = {
          type: "pong",
          commandId: msg.commandId,
          timestamp: msg.timestamp,
          at: iso(),
        };
        socket.send(JSON.stringify(pong));
        return;
      }

      if (msg.type === "command" && msg.commandId && msg.command) {
        const cmd = msg.command;
        const isEstop = cmd.type === "estop" || cmd.type === "reset_estop";

        // Simulated rejection criteria (3% random failure or note containing "fail"/"reject")
        const shouldFail =
          !isEstop &&
          (Math.random() < 0.03 ||
            (cmd.type === "mission_note" &&
              (cmd.text.toLowerCase().includes("fail") || cmd.text.toLowerCase().includes("reject"))));

        if (shouldFail) {
          const ack = {
            type: "ack",
            commandId: msg.commandId,
            ok: false,
            error: "SIMULATED_TRANSMISSION_ERROR",
            at: iso(),
          };
          socket.send(JSON.stringify(ack));
          console.log(`[mock-telemetry] command REJECTED: ${msg.commandId}`);
          return;
        }

        applyCommand(cmd);
        
        const ack = {
          type: "ack",
          commandId: msg.commandId,
          ok: true,
          at: iso(),
        };
        socket.send(JSON.stringify(ack));
        console.log(`[mock-telemetry] command ACKed: ${msg.commandId} (${cmd.type})`);
      }
    } catch (err) {
      console.error("[mock-telemetry] bad inbound", err);
    }
  });

  socket.on("close", () => {
    sockets.delete(socket);
    console.log(`[mock-telemetry] client left (${sockets.size})`);
  });
});

setInterval(() => {
  tick();
  
  // Periodically emit asynchronous device logs/faults (15% chance per tick)
  if (Math.random() < 0.15 && sockets.size > 0) {
    const logTypes: Array<{ severity: "info" | "caution" | "hazard"; source: string; message: string }> = [
      { severity: "caution", source: "PWR", message: "BATTERY_TEMPERATURE_ELEVATED" },
      { severity: "info", source: "SYS", message: "AUTONOMOUS_TUNNEL_MAPPING_CALIBRATED" },
      { severity: "caution", source: "GAS", message: "CO_LEVELS_TEMPORARILY_PEAKING" },
      { severity: "hazard", source: "LDR", message: "LIDAR_SENSORS_DIRT_COATING_DETECTED" },
      { severity: "info", source: "COM", message: "ROUTER_SIGNAL_OPTIMIZED" },
    ];
    const choice = logTypes[Math.floor(Math.random() * logTypes.length)];
    const deviceLog = {
      type: "log",
      ts: clock(),
      severity: choice.severity,
      source: choice.source,
      message: choice.message,
    };
    const payload = JSON.stringify(deviceLog);
    for (const s of sockets) {
      if (s.readyState === s.OPEN) s.send(payload);
    }
  }

  // Periodic Telemetry Frames broadcast
  const payload = JSON.stringify({ type: "frame", frame: state });
  for (const s of sockets) {
    if (s.readyState === s.OPEN) s.send(payload);
  }
}, 1000);

console.log(`[mock-telemetry] ws://127.0.0.1:${PORT}`);
