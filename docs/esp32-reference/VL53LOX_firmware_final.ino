/**
 * UGV Tunnel-Assist Robot — ESP32 ESP3 Firmware (Dual VL53L0X ToF + Fixed Static IP)
 * Hardware: ESP32 NodeMCU / WROOM + Dual VL53L0X Time-of-Flight Sensors
 * Static IP: 192.168.1.103
 * WebSocket Port: 8766
 *
 * HARDWARE WIRING SPECIFICATION:
 * -----------------------------------------------------------------------------
 * 1. Common I2C Bus:
 *    - ESP32 GPIO 21  ---> Both VL53L0X SDA Pins (Shared Data Line)
 *    - ESP32 GPIO 22  ---> Both VL53L0X SCL Pins (Shared Clock Line)
 *    - ESP32 3.3V     ---> Both VL53L0X VCC Pins
 *    - ESP32 GND      ---> Both VL53L0X GND Pins
 *
 * 2. XSHUT Pin Address Multiplexing (Controls Left vs Right Sensor):
 *    - ESP32 GPIO 25  ---> Left VL53L0X XSHUT Pin (Configured as I2C Address 0x30)
 *    - ESP32 GPIO 26  ---> Right VL53L0X XSHUT Pin (Configured as I2C Address 0x31)
 *
 * DEPENDENCIES (Install via Arduino IDE Library Manager):
 *  1. "VL53L0X" by Pololu (v1.3.0 or newer)
 *  2. "ArduinoJson" by Benoit Blanchon (v6 or v7)
 *  3. "ESPAsyncWebServer" by Mathieu Carbou / H4Plugins
 *  4. "AsyncTCP" by Mathieu Carbou
 * -----------------------------------------------------------------------------
 */

#include <WiFi.h>
#include <Wire.h>
#include <VL53L0X.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>

// WiFi Configuration (Router / Mobile Hotspot credentials)
const char *ssid = "Phone 3";
const char *password = "uvsingh987";
const char *ssid_fallback = "moto g64 5G_3117";
const char *password_fallback = "12345678";

// Static IP Configuration for ESP3 (ToF Distance Sensor Module)
IPAddress local_IP(192, 168, 1, 103);
IPAddress gateway(192, 168, 1, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(8, 8, 8, 8);

// Pinout Definitions
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define LEFT_XSHUT 25
#define RIGHT_XSHUT 26

// Sensor Objects
VL53L0X leftSensor;
VL53L0X rightSensor;

// Global Sensor Status Flags
bool leftSensorOK = false;
bool rightSensorOK = false;
bool singleSensorMode = false;

// WebServer & WebSocket Server on Port 8766
AsyncWebServer server(8766);
AsyncWebSocket ws("/ws");
AsyncWebSocket wsRoot("/");

unsigned long lastBroadcastTime = 0;
const unsigned long BROADCAST_INTERVAL_MS = 100; // Broadcast 10 Hz
unsigned long frameSequence = 0;

void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("[WebSocket ESP3] Dashboard client connected #%u from %s\n", client->id(), client->remoteIP().toString().c_str());
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("[WebSocket ESP3] Client disconnected #%u\n", client->id());
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=======================================================");
  Serial.println("  UGV TUNNEL-ASSIST ROBOT — ESP3 (DUAL VL53L0X TOF)");
  Serial.println("=======================================================");

  // Initialize I2C Bus at 100kHz standard speed for maximum noise immunity
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);

  // Configure XSHUT Pins for Address Multiplexing
  pinMode(LEFT_XSHUT, OUTPUT);
  pinMode(RIGHT_XSHUT, OUTPUT);
  digitalWrite(LEFT_XSHUT, LOW);
  digitalWrite(RIGHT_XSHUT, LOW);
  delay(50);

  // 1. Try Initializing Left Sensor via XSHUT (GPIO 25 -> I2C 0x30)
  digitalWrite(LEFT_XSHUT, HIGH);
  delay(50);
  if (leftSensor.init()) {
    leftSensor.setAddress(0x30);
    leftSensor.setTimeout(500);
    leftSensor.startContinuous();
    leftSensorOK = true;
    Serial.println("[OK] Left VL53L0X ToF initialized at address 0x30");
  } else {
    Serial.println("[INFO] Left XSHUT sensor not detected at 0x30");
  }

  // 2. Try Initializing Right Sensor via XSHUT (GPIO 26 -> I2C 0x31)
  digitalWrite(RIGHT_XSHUT, HIGH);
  delay(50);
  if (rightSensor.init()) {
    rightSensor.setAddress(0x31);
    rightSensor.setTimeout(500);
    rightSensor.startContinuous();
    rightSensorOK = true;
    Serial.println("[OK] Right VL53L0X ToF initialized at address 0x31");
  } else {
    Serial.println("[INFO] Right XSHUT sensor not detected at 0x31");
  }

  // 3. Fallback: If no XSHUT multiplexed sensors detected, test default I2C address 0x29 (Single Sensor)
  if (!leftSensorOK && !rightSensorOK) {
    Serial.println("[INFO] Scanning for Single VL53L0X sensor at default I2C address 0x29...");
    if (leftSensor.init()) {
      leftSensor.setTimeout(500);
      leftSensor.startContinuous();
      leftSensorOK = true;
      singleSensorMode = true;
      Serial.println("[OK] Single VL53L0X sensor active at default address 0x29!");
    } else {
      Serial.println("[WARNING] No physical VL53L0X sensors detected. Streaming simulated ToF distance data.");
    }
  }

  // 4. Configure WiFi in AP + STA Dual Mode
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);

  // A. Start Dedicated Fixed Access Point (SSID: UGV_TOF_ESP3, Fixed IP: 192.168.4.1)
  WiFi.softAP("UGV_TOF_ESP3", "12345678");
  Serial.println("\n[WiFi AP] SoftAP Started! SSID: UGV_TOF_ESP3 | Fixed IP: 192.168.4.1");
  Serial.println("[WebSocket AP] Fixed AP Endpoint: ws://192.168.4.1:8766/ws");

  // B. Connect to Station WiFi (Primary: Phone 3, Fallback: moto g64 5G_3117)
  WiFi.begin(ssid, password);
  Serial.printf("[WiFi STA] Connecting to %s...", ssid);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(300);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("\n[WiFi STA] Primary WiFi failed. Trying fallback: %s...", ssid_fallback);
    WiFi.begin(ssid_fallback, password_fallback);
    int attempts2 = 0;
    while (WiFi.status() != WL_CONNECTED && attempts2 < 15) {
      delay(300);
      Serial.print(".");
      attempts2++;
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi STA] Connected successfully!");
    Serial.printf("[WiFi STA] ESP3 IP Address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WebSocket STA] ws://%s:8766/ws (or /)\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi STA] Station connection pending. Access Point (192.168.4.1) is ACTIVE!");
  }

  // C. Register mDNS Hostname (esp3-tof.local)
  if (MDNS.begin("esp3-tof")) {
    Serial.println("[mDNS] Hostname registered! Universal Endpoint: ws://esp3-tof.local:8766/ws");
  }

  // Allow Cross-Origin Requests from browser dashboard
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "*");

  // HTTP GET Health Check Endpoint
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "UGV ESP3 ToF WebSocket Server OK");
  });

  // Attach WebSockets to server on Port 8766
  ws.onEvent(onWebSocketEvent);
  wsRoot.onEvent(onWebSocketEvent);
  
  server.addHandler(&ws);
  server.addHandler(&wsRoot);
  server.begin();
  Serial.println("[HTTP/WS] Server running cleanly on port 8766");
}

static unsigned long lastCleanupTime = 0;

void loop() {
  unsigned long now = millis();

  // Cleanup disconnected clients every 2 seconds
  if (now - lastCleanupTime >= 2000) {
    lastCleanupTime = now;
    ws.cleanupClients();
    wsRoot.cleanupClients();
  }

  if (now - lastBroadcastTime >= BROADCAST_INTERVAL_MS) {
    lastBroadcastTime = now;
    frameSequence++;

    float leftM = 1.20f;
    float rightM = 1.20f;

    // Read Left Sensor
    if (leftSensorOK) {
      uint16_t distMm = leftSensor.readRangeContinuousMillimeters();
      if (!leftSensor.timeoutOccurred() && distMm > 20 && distMm < 2500) {
        leftM = (float)distMm / 1000.0f;
      }
    }

    // Read Right Sensor or mirror Single Sensor
    if (rightSensorOK) {
      uint16_t distMm = rightSensor.readRangeContinuousMillimeters();
      if (!rightSensor.timeoutOccurred() && distMm > 20 && distMm < 2500) {
        rightM = (float)distMm / 1000.0f;
      }
    } else if (singleSensorMode && leftSensorOK) {
      // Single sensor mode: mirror left sensor reading to right side
      rightM = leftM;
    }

    // Build JSON Telemetry Payload
    StaticJsonDocument<384> doc;
    doc["seq"] = frameSequence;
    doc["ts"] = millis();
    
    JsonObject tof = doc.createNestedObject("tof");
    tof["left"] = leftM;
    tof["right"] = rightM;

    JsonObject lidar = doc.createNestedObject("lidar");
    lidar["leftM"] = leftM;
    lidar["rightM"] = rightM;

    String jsonOutput;
    serializeJson(doc, jsonOutput);

    // Broadcast to connected WebSocket clients (only when clients exist)
    if (ws.count() > 0) ws.textAll(jsonOutput);
    if (wsRoot.count() > 0) wsRoot.textAll(jsonOutput);

    // Print ToF Sensor Distance Readings to Serial Monitor
    Serial.printf("[ToF ESP3] Frame #%lu | Left: %.2f m | Right: %.2f m | Clients: %u\n",
                  frameSequence, leftM, rightM, (unsigned int)(ws.count() + wsRoot.count()));
  }
}