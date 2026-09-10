# ESP32 + VL53L0X ToF Sensor Setup Guide

This guide provides instructions for flashing the ESP32 firmware with a single **VL53L0X Time-of-Flight (ToF)** distance sensor and configuring a **Fixed Static IP Address**.

---

## 1. Hardware Pinout & Wiring

| VL53L0X Pin | ESP32 Pin | Description |
| :--- | :--- | :--- |
| **VCC** | **3.3V** (or 5V) | Power supply input |
| **GND** | **GND** | Ground connection |
| **SDA** | **GPIO 21** | I2C Data line |
| **SCL** | **GPIO 22** | I2C Clock line |

> **Note**: If your VL53L0X module includes an `XSHUT` pin, leave it unconnected or pull it HIGH (3.3V) for normal operation.

---

## 2. Required Arduino IDE Libraries

Install the following libraries via **Tools > Manage Libraries...** (Ctrl+Shift+I):

1. **Adafruit_VL53L0X** (by Adafruit) — for reading the ToF sensor over I2C.
2. **ArduinoJson** (by Benoit Blanchon, v6 or v7) — for encoding WebSocket JSON telemetry.
3. **ESPAsyncWebServer** (by Mathieu Carbou) — for non-blocking HTTP and WebSockets.
4. **AsyncTCP** (by Mathieu Carbou) — required dependency for ESPAsyncWebServer on ESP32.

---

## 3. Fixed Static IP Address Setup

In [`docs/esp32-reference/firmware.ino`](file:///c:/Users/l/OneDrive/Desktop/Hackathons/CIL/docs/esp32-reference/firmware.ino), locate the Network Configuration section (lines 40-48):

```cpp
const char* ssid = "YOUR_WIFI_NAME";         // <-- Set Wi-Fi / Hotspot Name
const char* password = "YOUR_WIFI_PASSWORD"; // <-- Set Wi-Fi Password

// Fixed Static IP Configuration
IPAddress local_IP(10, 52, 239, 215);  // <-- Desired Fixed Static IP
IPAddress gateway(10, 52, 239, 1);    // <-- Gateway IP (Router/Phone Hotspot)
IPAddress subnet(255, 255, 255, 0);   // Subnet Mask
IPAddress primaryDNS(8, 8, 8, 8);     // Primary DNS
```

- Update `local_IP` to your desired fixed IP (e.g. `10.52.239.215` or `192.168.1.200`).
- Update `gateway` to match your router or phone hotspot IP (usually ending in `.1`).

---

## 4. How To Test & Verify

1. Open [`docs/esp32-reference/firmware.ino`](file:///c:/Users/l/OneDrive/Desktop/Hackathons/CIL/docs/esp32-reference/firmware.ino) in Arduino IDE.
2. Select Board: **ESP32 Dev Module** (or your specific ESP32 board).
3. Select COM Port and click **Upload**.
4. Open **Serial Monitor** at **115200 baud**.
5. You will see:
   ```text
   [WiFi] Connected! Fixed ESP32 IP Address: 10.52.239.215
   [ToF] SUCCESS: VL53L0X ToF sensor online!
   [WS] WebSocket Server listening -> ws://10.52.239.215/ws
   [READING] VL53L0X ToF Left: 0.85 m | Right Wall: 1.20 m (constant)
   ```
6. In the Digital Twin / Dashboard UI:
   - Click the **"Live ESP32 Data"** toggle switch.
   - Enter `ws://10.52.239.215/ws` in the IP address box and click **Connect**.
   - Watch the 3D cave walls dynamically map out in real-time as you move objects in front of the VL53L0X sensor!
