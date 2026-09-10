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

### Step C: Outbound Commands Format (Dashboard → ESP32)
When an operator interacts with console controls (modes, lighting presets, directional keys, notes), the React client transmits commands over the WebSocket connection wrapped in a command envelope:

```json
{
  "type": "command",
  "commandId": "abc123xyz",
  "timestamp": "2026-08-29T18:00:00.000Z",
  "command": {
    "type": "set_lights",
    "intensity": "high"
  }
}
```

Your ESP32 firmware should parse this JSON payload, trigger the hardware actuators, and respond back immediately with an acknowledgment (`ack`) package using the same `commandId` to confirm the action took effect:

```json
{
  "type": "ack",
  "commandId": "abc123xyz",
  "ok": true,
  "at": "2026-08-29T18:00:00.120Z"
}
```

Detailed payloads and types are documented in the [WebSocket Wire Protocol Spec](docs/ws-protocol.md) and demonstrated in the [ESP32 Reference Sketch](docs/esp32-reference/firmware.ino).

---

## 4. Console Verification & Testing Instructions

To test and verify the Phase 2 bidirectional link features locally, run the Next.js console alongside the stateful mock server:

### A. Testing Pointer-Held Controls
- Navigate to the **Robot Control** panel.
- Click and hold Fwd/Back/Left/Right on the **Drive Control** or **Walk Control** D-Pads.
- Observe the telemetry terminal output (or command logs). The dashboard will continuously dispatch throttled movement packages (every 200ms) while held down.
- Release the mouse/pointer or drag the cursor out of the button boundaries: verify that an explicit `"stop"` command is immediately dispatched.

### B. Testing Slider Throttling
- Click and drag the **Posture** (Tilt/Roll or Height) sliders.
- The UI handles the drag smoothly in local state and throttles outgoing WebSocket frames to a 150ms interval to prevent buffer overflow on the hardware side.
- Upon release, the final precise coordinate is immediately sent over the wire.

### C. Testing Emergency Stop (E-STOP)
- The E-STOP safety control is located inside the **Safety System** module on the left side (always visible regardless of the current active view).
- Click **EMERGENCY STOP**:
  - The E-STOP command immediately bypasses the normal command queue and sends the `{ type: "estop" }` command.
  - Telemetry speed variables immediately drop to `0.00 M/S` and walk/drive D-pads display a locked, halted state.
- Press **RESET E-STOP** to re-enable operations.

### D. Testing Connection Lifecycles & Stale Link Indicators
- Terminate the mock server terminal (`Ctrl+C`). 
- Watch the **UTC Status Lamp** in the top header: it will transition to `Connecting` and then `Offline`. All controls are automatically disabled to prevent dead commands.
- Restart the mock server: the link will automatically reconnect with backoff.
- The heartbeat sends pings every 3s. If the mock server stops replying but the socket remains open, the status lamp transitions to a flashing `Stale Link` warning after 8s.

### E. Testing Optimistic UI & Rejection Paths
- The mock server is configured to simulate random packet transmission failures ~3% of the time.
- To trigger a deterministic failure: navigate to **Operator Note**, type `"fail"` or `"reject"` (e.g., `"fail sensor scan"`), and click **Stamp Log**.
- The mock server will return `ok: false` with a simulated error.
- Verify that the Bezel header displays a flashing `WAITING FOR ACK ⚠️` or `UNCONFIRMED ⚠️` warning frame, demonstrating the reconciliation handler.

---

## 5. Phase 3: Real Gas Sensor Data (MQ-4 Methane & MQ-7 CO)

Phase 3 implements the first live sensor-to-dashboard pipeline using physical MQ-4 (CH4) and MQ-7 (CO) analog resistive gas sensors connected directly to the ESP32.

### A. Hardware Wiring & Voltage Divider Specification
- **Power Supply:** Connect VCC to ESP32 +5V (VIN) or external 5V regulated power supply (5V required for internal heaters). Connect GND to common ground.
- **ADC Pin Selection (ADC1 Safe):**
  - **MQ-4 (Methane CH4):** Connect to **GPIO32** (ADC1 Channel 4).
  - **MQ-7 (Carbon Monoxide CO):** Connect to **GPIO34** (ADC1 Channel 6).
  - *Do NOT use ADC2 pins (GPIO 0, 2, 4, 12-15, 25-27) as Wi-Fi operations disable ADC2!*
- **Voltage Divider Circuit:**
  ```text
  Sensor Analog Out (0V - 5V) ----[ 10k Ω ]----+---- ESP32 ADC Pin (0V - 3.3V Max)
                                               |
                                           [ 20k Ω ]
                                               |
                                              GND
  ```
  - Ratio: $V_{\text{ADC}} = V_{\text{sensor}} \times \frac{20\text{k}}{10\text{k} + 20\text{k}} = V_{\text{sensor}} \times \frac{2}{3}$
  - Multiplier: $V_{\text{sensor}} = V_{\text{ADC}} \times 1.5$

### B. Boot Warm-Up & Clean-Air Calibration State Machine
1. **WARMING_UP State (0–30s):** Sensors heat up to operational temperature. Telemetry frames broadcast `coStatus: "warming_up"` and `ch4Status: "warming_up"`. Dashboard displays amber `WARMING UP` badges and dims numeric values.
2. **CALIBRATING State (30–45s):** Automatically averages clean-air sensor resistance readings over 15 seconds to compute baseline $R_0$ values for MQ-4 and MQ-7. Telemetry frames broadcast `coStatus: "calibrating"` and `ch4Status: "calibrating"`. Dashboard displays cyan `CALIBRATING R0` badges.
3. **SENSOR_OK State (>45s):** Live exponential curve regressions calculate exact gas concentration in PPM ($PPM = a \cdot (R_s / R_0)^b$). Telemetry frames broadcast `coStatus: "ok"` and `ch4Status: "ok"`. Dashboard updates values live.

### C. 5-Step Verification Checklist
1. **Serial-level Sanity Check:** Flash [`docs/esp32-reference/firmware.ino`](docs/esp32-reference/firmware.ino) to ESP32. Open Arduino Serial Monitor at 115200 baud. Confirm raw ADC mV, computed $R_s$, and PPM logs print every second. Expose MQ-4 to gas stimulus (e.g. unlit lighter in ventilated area) and observe PPM spike.
2. **Warm-Up Behavior Check:** Reset ESP32 and observe status transition sequence in Serial Monitor: `warming_up` (30s) $\rightarrow$ `calibrating` (15s) $\rightarrow$ `ok` (baselines $R_0$ logged).
3. **Wire-Level Check:** Open Chrome DevTools $\rightarrow$ Network $\rightarrow$ WS $\rightarrow$ Messages tab while connected to ESP32. Verify incoming telemetry JSON frames contain `"coPpm"`, `"ch4Ppm"`, `"coStatus"`, and `"ch4Status"`.
4. **Dashboard UI Check:** View Atmosphere panel in Dashboard. Confirm `WARMING UP` / `CALIBRATING R0` badges display during initial boot and transition cleanly to live numbers labeled `(approx)`.
5. **Stimulus-Response Check:** Perform gas stimulus test near MQ-4 while watching live Dashboard UI. Confirm Atmosphere panel row and Analytics view Methane line-chart update in real time.
