# CIL MIN UGV WebSocket Wire Protocol Specification (v2.0)

This document defines the bidirectional WebSocket wire protocol used between the **Tunnel Assist Dashboard** (client) and the **ESP32 Robot Controller** (server). 

The ESP32 runs the WebSocket server on a local IP/hostname (e.g. at path `/ws`), and the browser-based dashboard connects to it over local Wi-Fi.

---

## 1. Message Envelope Architecture

All messages sent over the WebSocket link are JSON-formatted strings. 
To ensure compatibility with the ESP32 (memory-constrained environment), fields are kept flat, structured, and short.

### 1.1 Outbound Messages (Dashboard → ESP32)

Outbound messages are sent in one of two formats: **Commands** or **Heartbeat Pings**.

#### A. Command Envelope
Sent when an operator interacts with controls on the dashboard.
```json
{
  "type": "command",
  "commandId": "abc123xyz",
  "timestamp": "2026-08-29T18:00:00.000Z",
  "command": {
    "type": "<COMMAND_TYPE>",
    ...
  }
}
```

#### B. Heartbeat Ping
Sent by the dashboard automatically on a 3-second interval to check connection liveness.
```json
{
  "type": "ping",
  "commandId": "ping-987",
  "timestamp": "2026-08-29T18:00:03.000Z"
}
```

---

### 1.2 Inbound Messages (ESP32 → Dashboard)

The ESP32 sends telemetry streams, command acknowledgements, heartbeat responses (pongs), or system logs.

#### A. Telemetry Frame
Emitted by the ESP32 periodically (e.g. every 1 second). Represents the active state of sensors and controls.
```json
{
  "type": "frame",
  "frame": {
    "seq": 1042,
    "receivedAt": "2026-08-29T18:00:00.000Z",
    "mission": {
      "id": "DELTA-4",
      "phase": "survey",
      "robotOnline": true,
      "elapsedSec": 1845,
      "distanceM": 129.8,
      "tunnelProgressPct": 39.2,
      "sector": "S7-PORTAL"
    },
    "link": {
      "quality": "online",
      "batteryPct": 83,
      "signalPct": 91,
      "snrDbm": -66,
      "nodesDropped": 3,
      "nodesTotal": 10
    },
    "power": {
      "mainPct": 83,
      "voltageV": 23.9,
      "currentA": 12.1,
      "batteryHealthPct": 84.1
    },
    "thermal": {
      "mainboard": { "currentC": 42.5, "minC": 38, "maxC": 48, "avgC": 41.8 },
      "ambientC": 28.2,
      "humidityPct": 64.8
    },
    "gas": {
      "coPpm": 3.8,
      "coStats": { "currentC": 3.8, "minC": 2, "maxC": 8, "avgC": 3.6 },
      "ch4Ppm": 0.04,
      "ch4Warn": false,
      "ch4Crit": false,
      "ch4WarnThresholdPpm": 5.0,
      "ch4ExplThresholdPpm": 10.0
    },
    "air": { "pm1": 11.5, "pm25": 33.2, "pm10": 44.1 },
    "water": "dry",
    "lidar": { "leftM": 1.25, "rightM": 0.82 },
    "motion": { "speedMps": 1.15, "speedMaxMps": 2.0 },
    "control": {
      "mode": "drive",
      "tiltRollPct": 56,
      "heightPct": 58,
      "speed": "med",
      "lights": "med",
      "vision": "rgb",
      "driveDir": "stop",
      "walkDir": "stop",
      "gimbal": { "pitch": 0, "yaw": 0 },
      "estopActive": false
    },
    "cameras": {
      "rgb": { "recording": true, "fps": 30, "resolution": "1080p", "streamUrl": "" },
      "thermal": { "recording": false, "fps": 24, "resolution": "720p", "streamUrl": "" }
    }
  }
}
```

#### B. Command Acknowledgement (ACK)
Sent immediately after processing an outbound command envelope to notify the dashboard of success/failure.
```json
{
  "type": "ack",
  "commandId": "abc123xyz",
  "ok": true,
  "at": "2026-08-29T18:00:00.120Z"
}
```
If a command fails or is rejected:
```json
{
  "type": "ack",
  "commandId": "abc123xyz",
  "ok": false,
  "error": "LIDAR_OBSTACLE_DETECTED",
  "at": "2026-08-29T18:00:00.120Z"
}
```

#### C. Heartbeat Pong
Sent by the ESP32 in response to receiving a heartbeat ping command.
```json
{
  "type": "pong",
  "commandId": "ping-987",
  "timestamp": "2026-08-29T18:00:03.000Z",
  "at": "2026-08-29T18:00:03.010Z"
}
```

#### D. Device Log
Sent by the ESP32 to log an asynchronous event, diagnostic code, or fault state. Dashboard appends this directly to the system log ticker and alerts.
```json
{
  "type": "log",
  "ts": "18:00:05",
  "severity": "caution",
  "source": "PWR",
  "message": "BATTERY_VOLTAGE_FLUCUATING"
}
```
*Note: Severity can be `"info" | "caution" | "hazard"`. Source can be `"SYS" | "LDR" | "COM" | "GAS" | "NAV" | "PWR"`.*

---

## 2. Command Set Specification

### 2.1 Mode Selector
Sets the locomotion mode of the robot.
- **Command Payload**:
  ```json
  { "type": "set_mode", "mode": "drive" } // or "walk"
  ```

### 2.2 Posture Controls (Sliders and Presets)
Sets continuous posture percentages or applies crouch/stand presets.
- **Sliders Command Payload**:
  ```json
  { "type": "set_posture", "tiltRollPct": 56, "heightPct": 58 }
  ```
- **Presets Command Payload**:
  ```json
  { "type": "posture_preset", "preset": "crouch" } // or "stand"
  ```

### 2.3 Drive Controls (Held/Continuous)
Dispatched at a throttled interval while a direction is held. The D-Pad triggers `drive` commands.
- **Move Command Payload**:
  ```json
  { "type": "drive", "dir": "fwd" } // "fwd" | "back" | "left" | "right"
  ```
- **Stop Command Payload** (sent once immediately on pointer release/leave):
  ```json
  { "type": "drive", "dir": "stop" }
  ```
- **Speed Selector Payload**:
  ```json
  { "type": "set_speed", "speed": "med" } // "slow" | "med" | "fast"
  ```

### 2.4 Walk Controls (Held/Continuous)
Dispatched at a throttled interval while a direction is held. The D-Pad triggers `walk` commands.
- **Move Command Payload**:
  ```json
  { "type": "walk", "dir": "fwd" } // "fwd" | "back" | "left" | "right"
  ```
- **Stop Command Payload** (sent once immediately on pointer release/leave):
  ```json
  { "type": "walk", "dir": "stop" }
  ```

### 2.5 Lighting Controls
Sets the light level.
- **Command Payload**:
  ```json
  { "type": "set_lights", "intensity": "med" } // "off" | "low" | "med" | "high"
  ```

### 2.6 Gimbal Controls (Held/Continuous)
Adjusts gimbal pitch and yaw relative steps.
- **Move Command Payload**:
  ```json
  { "type": "gimbal", "dir": "up" } // "up" | "down" | "left" | "right"
  ```
- **Stop Command Payload** (sent once immediately on pointer release/leave):
  ```json
  { "type": "gimbal", "dir": "center" }
  ```

### 2.7 Vision Mode Selector
Sets active camera video/sensor configurations.
- **Command Payload**:
  ```json
  { "type": "set_vision", "mode": "rgb" } // "rgb" | "thermal" | "ir"
  ```

### 2.8 Operator System Log Notes
Allows injection of timestamps and notes into the system logs.
- **Command Payload**:
  ```json
  { "type": "mission_note", "text": "Operator initiated visual scan" }
  ```

### 2.9 Emergency Stop (Safety Priority)
High-priority control. Must trigger immediately upon pressing E-STOP.
- **E-Stop Command Payload**:
  ```json
  { "type": "estop" }
  ```
- **E-Stop Reset Command Payload**:
  ```json
  { "type": "reset_estop" }
  ```

---

## 3. Communication Timing & Safety Rules

1. **Explicit Stop Command**: The UGV must never assume a stopped state based on a timeout or absence of frames. When the D-pads are released, a command with `"dir": "stop"` (or `"dir": "center"`) is sent.
2. **Heartbeat Link Failure (Failsafe)**: The ESP32 must keep track of incoming heartbeat ping frames. If no ping is received for **5 seconds**, the ESP32 must halt all driving and walking motors immediately to fail-safe in the event of wireless signal loss.
3. **Throttled Updates**: The dashboard throttles rapid D-pad signals to once every 200ms and slider updates to once every 150ms to keep JSON buffer usage on the ESP32 low. E-STOP commands bypass all throttles.
