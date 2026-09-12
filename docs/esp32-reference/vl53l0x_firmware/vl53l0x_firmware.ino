/**
 * UGV Tunnel-Assist Robot — ESP32 Firmware (VL53L0X ToF + Static IP)
 * Hardware: ESP32 + Single VL53L0X Time-of-Flight Distance Sensor over I2C
 *
 * HARDWARE WIRING SPECIFICATION:
 * -----------------------------------------------------------------------------
 * 1. VL53L0X ToF Sensor Pinout:
 *    - VCC  ---> ESP32 3.3V (or 5V if sensor module has onboard 3.3V LDO regulator)
 *    - GND  ---> ESP32 GND
 *    - SDA  ---> ESP32 GPIO 21 (Default I2C Data Pin)
 *    - SCL  ---> ESP32 GPIO 22 (Default I2C Clock Pin)
 *
 * 2. Static IP Setup:
 *    - Static IP address assigned below so ESP32 IP address does NOT change.
 *    - Edit local_IP, gateway, and subnet constants to match your router/phone hotspot.
 *
 * DEPENDENCIES (Install via Arduino IDE Library Manager):
 *  - "Adafruit_VL53L0X" by Adafruit (v1.2.0 or newer)
 *  - "ArduinoJson" by Benoit Blanchon (v6 or v7)
 *  - "ESPAsyncWebServer" by Mathieu Carbou (Supports ESP32 Core 3.x)
 *  - "AsyncTCP" by Mathieu Carbou
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "Adafruit_VL53L0X.h"

// ============================================================================
// Network & Static IP Configuration (EDIT THESE FOR YOUR NETWORK)
// ============================================================================
const char* ssid = "YOUR_WIFI_NAME";         // <-- Edit Wi-Fi / Hotspot SSID
const char* password = "YOUR_WIFI_PASSWORD"; // <-- Edit Wi-Fi / Hotspot Password

// Fixed Static IP Address Configuration
IPAddress local_IP(10, 52, 239, 215);  // <-- ESP32 Fixed Static IP Address
IPAddress gateway(10, 52, 239, 1);    // <-- Gateway IP (Router/Hotspot)
IPAddress subnet(255, 255, 255, 0);   // Subnet Mask
IPAddress primaryDNS(8, 8, 8, 8);     // Primary DNS

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// ============================================================================
// Hardware Pin Definitions & VL53L0X Instance
// ============================================================================
const int I2C_SDA_PIN = 21;
const int I2C_SCL_PIN = 22;

Adafruit_VL53L0X lox = Adafruit_VL53L0X();
bool tofSensorOnline = false;

// System Telemetry State
unsigned long lastSend = 0;
int seq = 0;
bool estopActive = false;
String driveDir = "stop";

// ============================================================================
// WebSocket Message / Command Handler
// ============================================================================
void sendAck(AsyncWebSocketClient *client, const char* commandId, bool ok) {
  JsonDocument doc;
  doc["type"] = "ack";
  doc["commandId"] = commandId;
  doc["ok"] = ok;
  String out;
  serializeJson(doc, out);
  client->text(out);
}

void handleMessage(AsyncWebSocketClient *client, uint8_t *data, size_t len) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, data, len);
  if (err) return;

  const char* type = doc["type"] | "unknown";
  const char* commandId = doc["commandId"] | "unknown";

  if (strcmp(type, "ping") == 0) {
    JsonDocument pong;
    pong["type"] = "pong";
    pong["commandId"] = commandId;
    String out;
    serializeJson(pong, out);
    client->text(out);
    return;
  }

  if (strcmp(type, "command") == 0) {
    JsonObject command = doc["command"];
    const char* cmdType = command["type"] | "unknown";

    if (strcmp(cmdType, "drive") == 0) {
      driveDir = command["dir"].as<String>();
    } else if (strcmp(cmdType, "estop") == 0) {
      estopActive = true;
      driveDir = "stop";
    } else if (strcmp(cmdType, "reset_estop") == 0) {
      estopActive = false;
    }

    sendAck(client, commandId, true);
  }
}

void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type,
               void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("[WS] Client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("[WS] Client #%u disconnected\n", client->id());
  } else if (type == WS_EVT_DATA) {
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
      handleMessage(client, data, len);
    }
  }
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println(" UGV Tunnel-Assist Robot — ESP32 Sensor Server");
  Serial.println(" Hardware: Single VL53L0X ToF Sensor + Static IP");
  Serial.println("==================================================");

  // 1. Initialize I2C & VL53L0X Sensor
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Serial.println("[ToF] Initializing VL53L0X sensor on I2C (SDA=21, SCL=22)...");
  if (!lox.begin()) {
    Serial.println("[ToF] ERROR: Failed to detect VL53L0X sensor! Check I2C wiring.");
    tofSensorOnline = false;
  } else {
    Serial.println("[ToF] SUCCESS: VL53L0X ToF sensor online!");
    lox.startRangeContinuous();
    tofSensorOnline = true;
  }

  // 2. Configure Static IP Address
  Serial.print("[WiFi] Configuring Fixed Static IP: ");
  Serial.println(local_IP);
  if (!WiFi.config(local_IP, gateway, subnet, primaryDNS)) {
    Serial.println("[WiFi] WARNING: Static IP configuration failed! Falling back to DHCP.");
  }

  // 3. Connect to Wi-Fi
  Serial.print("[WiFi] Connecting to WiFi SSID: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("[WiFi] Connected! Fixed ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // 4. Start HTTP & WebSocket Server
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "UGV Robot ESP32 VL53L0X Telemetry Server Online!\nWebSocket endpoint active at /ws");
  });

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.begin();
  Serial.print("[WS] WebSocket Server listening -> ws://");
  Serial.print(WiFi.localIP());
  Serial.println("/ws\n");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  ws.cleanupClients();

  unsigned long now = millis();

  // Broadcast Telemetry Frame every 200 ms (5 Hz update rate)
  if (now - lastSend >= 200) {
    lastSend = now;

    // Read VL53L0X ToF Distance Measurement
    float distanceLeftM = 1.20; // Default constant fallback if out of range
    if (tofSensorOnline && lox.isRangeComplete()) {
      uint16_t rangeMm = lox.readRange();
      if (rangeMm > 30 && rangeMm < 2000) { // Valid range 30mm (3cm) to 2000mm (2m)
        distanceLeftM = rangeMm / 1000.0f;  // Convert millimeters to meters
      }
    }

    // Keep right wall constant at 1.20 meters as specified
    float distanceRightM = 1.20;

    Serial.printf("[READING] VL53L0X ToF Left: %.2f m | Right Wall: %.2f m (constant)\n",
                  distanceLeftM, distanceRightM);

    // Broadcast WebSocket Frame if clients connected
    if (ws.count() > 0) {
      JsonDocument doc;
      doc["type"] = "frame";
      
      JsonObject frame = doc["frame"].to<JsonObject>();
      frame["seq"] = seq++;
      frame["receivedAt"] = "2026-09-11T00:00:00.000Z";

      // 1. ToF Sensor readings (Both 'tof' and 'lidar' fields included for maximum compatibility)
      JsonObject tof = frame["tof"].to<JsonObject>();
      tof["left"] = distanceLeftM;
      tof["right"] = distanceRightM;

      JsonObject lidar = frame["lidar"].to<JsonObject>();
      lidar["leftM"] = distanceLeftM;
      lidar["rightM"] = distanceRightM;

      // 2. Robot Pose
      JsonObject pose = frame["pose"].to<JsonObject>();
      pose["x"] = 0.0;
      pose["z"] = 0.0;
      pose["yaw"] = 0.0;

      // 3. Gas & Sensor telemetry defaults (only ToF is connected)
      JsonObject gas = frame["gas"].to<JsonObject>();
      gas["ch4Ppm"] = 0.0;
      gas["ch4Status"] = "ok";
      gas["coPpm"] = 0.0;
      gas["coStatus"] = "ok";

      JsonObject sensors = frame["sensors"].to<JsonObject>();
      sensors["methane"] = 0.0;
      sensors["co"] = 0.0;
      sensors["sulfur"] = 0.0;
      sensors["co2"] = 400.0;
      sensors["o2"] = 20.9;
      sensors["water"] = 0.0;

      // 4. Mission & System telemetry defaults
      JsonObject mission = frame["mission"].to<JsonObject>();
      mission["id"] = "DELTA-4";
      mission["phase"] = "survey";
      mission["robotOnline"] = true;
      mission["elapsedSec"] = now / 1000;
      mission["distanceM"] = distanceLeftM;
      mission["tunnelProgressPct"] = 35.0;
      mission["sector"] = "SECTOR-S7";

      JsonObject control = frame["control"].to<JsonObject>();
      control["estopActive"] = estopActive;
      control["driveDir"] = driveDir;
      control["mode"] = "drive";

      JsonObject power = frame["power"].to<JsonObject>();
      power["mainPct"] = 95;
      power["voltageV"] = 24.1;
      power["currentA"] = 1.2;

      JsonObject thermal = frame["thermal"].to<JsonObject>();
      thermal["ambientC"] = 25.0;
      thermal["humidityPct"] = 55;

      JsonObject link = frame["link"].to<JsonObject>();
      link["quality"] = "online";
      link["batteryPct"] = 95;
      link["signalPct"] = 98;
      link["snrDbm"] = -60;
      link["nodesDropped"] = 0;
      link["nodesTotal"] = 10;

      JsonObject air = frame["air"].to<JsonObject>();
      air["pm1"] = 10;
      air["pm25"] = 25;
      air["pm10"] = 35;

      JsonObject motion = frame["motion"].to<JsonObject>();
      motion["speedMps"] = 0.0;
      motion["speedMaxMps"] = 2.0;

      String out;
      serializeJson(doc, out);
      ws.textAll(out);
    }
  }
}
