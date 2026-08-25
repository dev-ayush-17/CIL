# UGV Tunnel-Assist Robot Dashboard (CIL MIN Hackathon)

An industrial field-ops console designed from scratch for Coal India Ltd's autonomous tunneling division. This dashboard allows real-time telemetry monitoring, mission logging, remote robot control, and interactive 3D mapping while the unmanned ground vehicle (UGV) is inside an active mine tunnel.

## Visual Design Identity
Built on a custom **Machined Steel & Warm Amber** theme, this console deviates from typical SaaS mockups and sci-fi neon aesthetics in favor of a rugged, high-contrast field terminal. Features include:
- Compact condensed typography (`Barlow Condensed` for labels/headers, `IBM Plex Mono` for tabular telemetry and logs).
- Machined panel borders, bevel details, calibration grid lines, and crosshair overlays.
- Flat solid layouts (no rounded SaaS cards, no neon-cyan glows, no floating blurred orbs).

---

## 1. Quick Start

Run the application locally from a clean clone:

```bash
# 1. Install dependencies (Next.js, Recharts, ws, model-viewer)
npm install

# 2. Run the mock WebSocket telemetry server (ports to ws://127.0.0.1:8765)
npm run mock:telemetry

# 3. Start the Next.js development server (in a separate terminal)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the console.

---

## 2. Project Folder Structure

```
├── app/
│   ├── globals.css         # Global tailwind imports and custom style classes
│   ├── layout.tsx          # Font optimization (Barlow Condensed & IBM Plex Mono)
│   └── page.tsx            # App entry point (wraps shell inside telemetry & view providers)
├── components/
│   ├── alerts/             # Active fault list panel
│   ├── analytics/          # Live charts, radial dials, and 3D model viewer
│   ├── cameras/            # Simulated/live camera streams (RGB and Thermal)
│   ├── control/            # Robot operations pads, presets, lighting, operator logs
│   ├── health/             # Telemetry indicators, LIDAR distance bars, and battery
│   ├── environment/        # Atmosphere status gauges (CH4, CO, Particulates)
│   ├── shell/              # Header state indicators, UTC clock, and scrolling sys log
│   └── ui/                 # Reusable layout bezels and radial gauge meters
├── lib/
│   └── telemetry/
│       ├── schema.ts       # Unified TelemetryFrame typescript schema and commands
│       ├── mapper.ts       # ESP32 mapper integration entry-point
│       ├── use-telemetry.ts# React hook managing WebSocket connections and backoff
│       └── mock-server/    # Standalone ws mock server simulating real-world runs
├── public/
│   └── models/
│       └── robot.glb       # Placeholder 3D model asset (replace with actual robot GLB)
├── tokens.css              # Custom OKLCH palette, font sizes, and layout spacing tokens
└── package.json            # Scripts and dependencies
```

---

## 3. Hardware Integration Guide (ESP32 / Real UGV Bus)

The entire application is architected around a single dynamic telemetry bus. Swapping the mock data server for the real ESP32 system does not require modifying any UI components.

Follow these steps to wire up the hardware console:

### Step A: Configure the WebSocket URL
Create a `.env.local` file in the root directory (or set the system environment variables) and point the telemetry hook to the IP address or host of your ESP32's WebSocket server:

```env
# Point to your ESP32 WebSocket server (e.g., if ESP32 runs at 192.168.1.50:80)
NEXT_PUBLIC_TELEMETRY_WS_URL=ws://192.168.1.50:80
```

### Step B: Map ESP32 Payload to TelemetryFrame
If your ESP32 emits JSON with keys differing from the default `TelemetryFrame` schema (defined in [`lib/telemetry/schema.ts`](./lib/telemetry/schema.ts)), you only need to update the mapper function in [`lib/telemetry/mapper.ts`](./lib/telemetry/mapper.ts).

For example, if the ESP32 sends a compact object like `{ seq: 101, bat: 84.5, methane: 0.05 }`, configure it in `mapper.ts`:

```typescript
// lib/telemetry/mapper.ts
import type { TelemetryFrame } from "./schema";

export function mapInboundPayload(raw: any): TelemetryFrame {
  // 1. Build a valid TelemetryFrame object using default values for missing data
  return {
    seq: raw.seq ?? 0,
    receivedAt: new Date().toISOString(),
    mission: {
      id: "DELTA-4",
      phase: "survey",
      robotOnline: true,
      elapsedSec: raw.elapsed ?? 0,
      distanceM: raw.dist ?? 0,
      tunnelProgressPct: raw.progress ?? 0,
      sector: "SECTOR-S7",
    },
    link: {
      quality: "online",
      batteryPct: raw.bat ?? 100,
      signalPct: raw.sig ?? 100,
      snrDbm: raw.snr ?? -50,
      nodesDropped: 0,
      nodesTotal: 10,
    },
    power: {
      mainPct: raw.bat ?? 100,
      voltageV: raw.v ?? 24.0,
      currentA: raw.a ?? 1.5,
      batteryHealthPct: 98,
    },
    thermal: {
      mainboard: { currentC: raw.temp ?? 35, minC: 30, maxC: 60, avgC: 35 },
      ambientC: raw.ambient ?? 25,
      humidityPct: raw.hum ?? 50,
    },
    gas: {
      coPpm: raw.co ?? 0,
      coStats: { currentC: raw.co ?? 0, minC: 0, maxC: 10, avgC: raw.co ?? 0 },
      ch4Ppm: raw.methane ?? 0,
      ch4Warn: (raw.methane ?? 0) >= 5,
      ch4Crit: (raw.methane ?? 0) >= 10,
      ch4WarnThresholdPpm: 5,
      ch4ExplThresholdPpm: 10,
    },
    air: { pm1: raw.pm1 ?? 0, pm25: raw.pm25 ?? 0, pm10: raw.pm10 ?? 0 },
    water: raw.water_detected ? "wet" : "dry",
    lidar: { leftM: raw.lidar_l ?? 2.0, rightM: raw.lidar_r ?? 2.0 },
    motion: { speedMps: raw.speed ?? 0, speedMaxMps: 2.0 },
    control: {
      mode: raw.mode === 1 ? "walk" : "drive",
      tiltRollPct: raw.tilt ?? 50,
      heightPct: raw.height ?? 50,
      speed: "med",
      lights: "med",
      vision: "rgb",
      driveDir: "stop",
      walkDir: "stop",
      gimbal: { pitch: 0, yaw: 0 },
    },
    cameras: {
      rgb: { recording: true, fps: 30, resolution: "1080p", streamUrl: raw.video_url ?? "" },
      thermal: { recording: false, fps: 24, resolution: "720p", streamUrl: "" },
    },
    log: [],
    alerts: [],
  };
}
```

### Step C: Receiving Commands on the ESP32
When an operator interacts with console controls (modes, lighting presets, directional keys, notes), the React client transmits control commands over the WebSocket connection in the following shape:

```json
{
  "type": "command",
  "command": {
    "type": "set_lights",
    "intensity": "high"
  }
}
```

Ensure your ESP32's WebSocket server parses incoming text frames, checks for the `"command"` type, and triggers the hardware actuators accordingly.
