# UGV Tunnel Monitoring and Control Dashboard

A real-time monitoring and control dashboard for an Unmanned Ground Vehicle (UGV) designed for underground tunnel exploration and industrial inspection. The application provides live telemetry monitoring, mission tracking, remote robot control, environmental sensing, camera feeds, and interactive 3D visualization.

The dashboard communicates with an ESP32-based hardware system through WebSockets, enabling bidirectional communication between the robot and the operator console.

## Features

- **Real-Time Telemetry:** Monitor battery level, voltage, current, temperature, speed, and communication status.
- **Remote Robot Control:** Control movement, operating modes, lighting, and robot posture through an interactive interface.
- **Environmental Monitoring:** Track methane (CH₄), carbon monoxide (CO), particulate matter, humidity, and water detection.
- **Live Camera Feeds:** Support RGB and thermal camera streams.
- **3D Robot Visualization:** Display the robot model and support interactive visualization.
- **Mission Tracking:** Monitor mission duration, tunnel progress, distance traveled, and operational status.
- **Alert Management:** Display sensor warnings, communication failures, and system faults.
- **Operator Logging:** Record operational notes, commands, and mission events.
- **Emergency Stop:** Provide an emergency-stop interface for halting robot movement.
- **WebSocket Communication:** Exchange telemetry data and control commands with the hardware system.
- **Mock Telemetry Server:** Test dashboard functionality without requiring physical hardware.

## Visual Design

The dashboard uses a **Machined Steel and Warm Amber** visual theme inspired by industrial control systems.

Design characteristics include:

- Condensed typography using Barlow Condensed.
- Monospaced telemetry and logs using IBM Plex Mono.
- High-contrast panels with machined borders and bevel details.
- Calibration grids, measurement markers, and crosshair overlays.
- A compact, information-dense layout optimized for monitoring and control.

The interface avoids excessive rounded cards, neon effects, and decorative visual elements to maintain a practical industrial appearance.

## Tech Stack

- **Frontend:** Next.js, React, TypeScript
- **Styling:** CSS, Tailwind CSS, custom design tokens
- **Charts:** Recharts
- **Communication:** WebSockets
- **Hardware Interface:** ESP32
- **3D Visualization:** Model Viewer
- **Gas Sensors:** MQ-4 methane sensor and MQ-7 carbon monoxide sensor

## Project Structure

```text
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── alerts/
│   ├── analytics/
│   ├── cameras/
│   ├── control/
│   ├── health/
│   ├── environment/
│   ├── shell/
│   └── ui/
├── lib/
│   └── telemetry/
│       ├── schema.ts
│       ├── mapper.ts
│       ├── use-telemetry.ts
│       └── mock-server/
├── public/
│   └── models/
│       └── robot.glb
├── docs/
│   ├── ws-protocol.md
│   └── esp32-reference/
│       └── firmware.ino
├── tokens.css
└── package.json
```

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js and npm
- Git
- A modern web browser

An ESP32 is optional when using the mock telemetry server.

### Installation

Clone the repository and navigate to the project directory:

```bash
git clone <repository-url>
cd <project-directory>
npm install
```

### Run the Mock Telemetry Server

Open a terminal and run:

```bash
npm run mock:telemetry
```

The mock WebSocket server runs at:

```text
ws://127.0.0.1:8765
```

### Start the Development Server

Open a separate terminal and execute:

```bash
npm run dev
```

Open the dashboard at:

http://localhost:3000

## Hardware Integration

The dashboard uses a common telemetry interface, allowing mock data to be replaced with real ESP32 telemetry without requiring changes to individual UI components, provided the incoming data is mapped to the expected schema.

### 1. Configure the WebSocket Connection

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_TELEMETRY_WS_URL=ws://192.168.1.50:80
```

Replace the example IP address and port with those of your WebSocket server.

Restart the Next.js development server after changing environment variables.

**Note:** The ESP32 WebSocket server must be reachable from the browser running the dashboard. For production deployments, use an appropriately secured connection and configure the network accordingly.

### 2. Map ESP32 Telemetry

The expected telemetry structure is defined in:

`lib/telemetry/schema.ts`

The incoming payload transformation is handled by:

`lib/telemetry/mapper.ts`

For example, an ESP32 may send a compact JSON object:

```json
{
  "seq": 101,
  "bat": 84.5,
  "methane": 0.05,
  "co": 2.1,
  "temp": 35
}
```

The mapper converts these fields into the application's unified telemetry structure.

Example:

```typescript
import type { TelemetryFrame } from "./schema";

export function mapInboundPayload(raw: any): TelemetryFrame {
  return {
    // Map incoming hardware values to the
    // complete TelemetryFrame structure.
    // Supply appropriate defaults and status fields.
  } as TelemetryFrame;
}
```

This is a structural illustration, not a complete drop-in implementation. Populate every required field according to the actual `TelemetryFrame` definition.

### 3. Send Commands to the Robot

Commands from the dashboard are transmitted over WebSockets using a command envelope.

Example lighting command:

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

The ESP32 firmware should validate the command, execute the requested operation when safe, and return an acknowledgment.

Example acknowledgment:

```json
{
  "type": "ack",
  "commandId": "abc123xyz",
  "ok": true,
  "at": "2026-08-29T18:00:00.120Z"
}
```

The `commandId` links the acknowledgment to the original command.

Refer to `docs/ws-protocol.md` and `docs/esp32-reference/firmware.ino` for the corresponding protocol and firmware implementation.

## Telemetry and Control Testing

### 1. Movement Controls

- Open the Robot Control panel.
- Press and hold the directional controls.
- Verify that movement commands are sent at the configured interval.
- Release the control and confirm that a stop command is transmitted.
- Test both drive and walk modes if supported by the robot.

### 2. Slider Controls

- Adjust the posture sliders.
- Confirm that outgoing updates are throttled during movement.
- Release the slider and verify that the final value is transmitted.

The described configuration uses a 150 ms transmission interval during slider movement.

### 3. Emergency Stop

- Locate the Emergency Stop control in the Safety System module.
- Activate it and verify that the robot receives the stop command.
- Confirm that the interface indicates a halted state.
- Reset the emergency stop only after verifying that it is safe to resume operation.

**Safety note:** A dashboard-side emergency stop is not a substitute for an independent hardware safety circuit. Actual robot stopping behavior must be verified on the physical system.

### 4. Connection and Reconnection

- Stop the mock telemetry server.
- Observe the connection status in the dashboard.
- Confirm that unavailable connections disable normal control commands.
- Restart the server and verify automatic reconnection.
- Check stale-link detection when telemetry stops arriving.

The example configuration sends heartbeats every 3 seconds and marks the connection stale after approximately 8 seconds without a valid heartbeat.

### 5. Command Acknowledgment and Failure Handling

- Open the Operator Note panel.
- Enter a test message such as `fail sensor scan` or `reject command`.
- Submit the note.
- Verify that the mock server returns a simulated rejection.
- Confirm that the interface displays an appropriate failure or unconfirmed status.

The mock server may also simulate occasional transmission failures to test error handling.

## Gas Sensor Integration

The dashboard supports telemetry from MQ-4 methane and MQ-7 carbon monoxide sensors connected to an ESP32.

### 1. Hardware Connections

| Component | ESP32 Connection |
|---|---|
| MQ-4 analog output | GPIO32 (ADC1) |
| MQ-7 analog output | GPIO34 (ADC1) |
| Sensor power | Appropriate regulated supply |
| Ground | Common ground |

MQ-series sensors use internal heaters and commonly require a 5 V supply. Their analog outputs must be conditioned to remain within the ESP32's permitted ADC input voltage.

#### Voltage Divider

For an output that can reach 5 V, a 10 kΩ upper resistor and a 20 kΩ lower resistor provide the following relationship:

```text
Sensor Analog Out
       |
    [10 kΩ]
       |
       +---------- ESP32 ADC Input
       |
    [20 kΩ]
       |
      GND
```

The ADC voltage is:

\[
V_{\mathrm{ADC}} =
V_{\mathrm{sensor}}\times\frac{20}{10+20}
\]

Therefore:

\[
V_{\mathrm{sensor}}=1.5V_{\mathrm{ADC}}
\]

Verify the sensor module's actual output range and the ESP32 board's ADC limits before connecting the circuit.

### 2. Sensor Initialization States

The example firmware uses three sensor initialization states:

| State | Example Duration | Description |
|---|---|---|
| `warming_up` | 0–30 seconds | Initial sensor warm-up |
| `calibrating` | 30–45 seconds | Baseline measurement |
| `ok` | After 45 seconds | Sensor data available |

These timings are configurable examples, not guaranteed stabilization times. MQ sensors may require substantially longer initial conditioning and warm-up, depending on the sensor, manufacturer, operating conditions, and calibration procedure.

During calibration, the firmware estimates baseline resistance values under appropriate reference conditions. The dashboard displays the current sensor state so operators can distinguish initialization from active measurements.

### 3. Gas Concentration Calculation

Gas concentration can be estimated using a calibrated relationship of the form:

\[
PPM=a\left(\frac{R_s}{R_0}\right)^b
\]

Where:

- \(PPM\) is the estimated gas concentration in parts per million.
- \(R_s\) is the current sensor resistance.
- \(R_0\) is the reference resistance established during calibration.
- \(a\) and \(b\) are calibration-dependent constants.

The constants must be derived from appropriate sensor calibration data. Raw ADC readings or generic curve coefficients should not be treated as accurate gas concentration measurements.

### 4. Verification Procedure

1. Upload the ESP32 firmware from `docs/esp32-reference/firmware.ino`.
2. Open the Arduino Serial Monitor at 115200 baud.
3. Verify that raw ADC readings, sensor resistance, and status messages are reported.
4. Observe the initialization and calibration state transitions.
5. Inspect WebSocket messages in the browser's developer tools.
6. Confirm that telemetry frames include `coPpm`, `ch4Ppm`, `coStatus`, and `ch4Status`.
7. Open the Atmosphere panel and verify that sensor readings and status indicators update.
8. Confirm that the Analytics view reflects incoming methane measurements.

Use appropriate calibration equipment and safe test procedures. Do not release flammable gas or use an open flame to test sensors in an underground or potentially hazardous environment.

## Environmental Monitoring

The environmental monitoring interface can display:

- Methane concentration (CH₄)
- Carbon monoxide concentration (CO)
- Particulate matter (PM1, PM2.5, and PM10)
- Ambient temperature
- Humidity
- Water detection status

Thresholds should be configurable according to the application, sensor specifications, applicable safety standards, and site requirements.

**Important:** MQ-series sensors are suitable for prototyping and indicative monitoring, but they should not be treated as certified mine-safety instruments without appropriate certification, calibration, validation, and system-level assessment.

## Configuration and Troubleshooting

### Dashboard Does Not Connect

- Verify that the WebSocket server is running.
- Check the configured `NEXT_PUBLIC_TELEMETRY_WS_URL`.
- Confirm that the browser can reach the ESP32 over the network.
- Inspect browser developer tools for WebSocket connection errors.
- Check firewall rules and network configuration.

### Sensor Readings Are Incorrect

- Verify the sensor wiring and supply voltage.
- Confirm that the ADC input voltage is within permitted limits.
- Check the voltage-divider configuration.
- Allow appropriate sensor conditioning and warm-up time.
- Validate the calibration coefficients against reference measurements.

### Commands Are Not Executed

- Confirm that the WebSocket connection is active.
- Inspect outgoing command messages.
- Verify the command type and payload against the protocol specification.
- Check firmware-side validation and acknowledgment handling.
- Confirm that hardware interlocks permit the requested action.

### 3D Model Is Missing

Verify that the robot model exists at:

`public/models/robot.glb`

Replace the placeholder model with a compatible GLB asset if necessary.

## Security and Safety Considerations

- Validate incoming telemetry and command payloads.
- Authenticate and authorize remote control clients.
- Use secure WebSocket connections where supported by the deployment architecture.
- Restrict access to robot-control interfaces.
- Implement command timeouts and safe defaults.
- Provide an independent hardware emergency-stop mechanism.
- Validate all environmental measurements before using them for safety-critical decisions.
- Test control behavior in a controlled environment before operating the physical robot.

## Future Improvements

Potential enhancements include:

- Integration with additional sensors and robot platforms.
- Improved 3D tunnel mapping and localization.
- Historical telemetry storage and mission replay.
- Configurable alert thresholds and notification workflows.
- Advanced diagnostics and predictive maintenance.
- Authentication, role-based access, and audit logging.
- Integration with validated environmental monitoring systems.

## License

Add the appropriate license for your project before distributing or reusing the source code.

## Contributing

Contributions, bug reports, and feature suggestions are welcome. Please document changes to the telemetry schema, WebSocket protocol, and hardware integration so that the dashboard and firmware remain compatible.