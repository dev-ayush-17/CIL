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

// WiFi Configuration (Router / Mobile Hotspot credentials)
const char *ssid = "Phone 3";
const char *password = "uvsingh987";

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

// WebServer & WebSocket Server on Port 8766
AsyncWebServer server(8766);
AsyncWebSocket ws("/ws");

unsigned long lastBroadcastTime = 0;
const unsigned long BROADCAST_INTERVAL_MS = 100; // Broadcast 10 Hz
unsigned long frameSequence = 0;

void onWebSocketEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("[WebSocket ESP3] Client connected #%u from %s\n", client->id(), client->remoteIP().toString().c_str());
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

  // Initialize I2C Bus
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  // Configure XSHUT Pins for Address Multiplexing
  pinMode(LEFT_XSHUT, OUTPUT);
  pinMode(RIGHT_XSHUT, OUTPUT);
  digitalWrite(LEFT_XSHUT, LOW);
  digitalWrite(RIGHT_XSHUT, LOW);
  delay(10);

  // 1. Initialize Left ToF Sensor
  digitalWrite(LEFT_XSHUT, HIGH);
  delay(10);
  if (!leftSensor.init()) {
    Serial.println("[ERROR] Left VL53L0X ToF sensor failed to initialize!");
  } else {
    leftSensor.setAddress(0x30);
    leftSensor.setTimeout(500);
    leftSensor.startContinuous();
    Serial.println("[OK] Left VL53L0X ToF initialized at address 0x30");
  }

  // 2. Initialize Right ToF Sensor
  digitalWrite(RIGHT_XSHUT, HIGH);
  delay(10);
  if (!rightSensor.init()) {
    Serial.println("[ERROR] Right VL53L0X ToF sensor failed to initialize!");
  } else {
    rightSensor.setAddress(0x31);
    rightSensor.setTimeout(500);
    rightSensor.startContinuous();
    Serial.println("[OK] Right VL53L0X ToF initialized at address 0x31");
  }

  // Configure Static IP
  if (!WiFi.config(local_IP, gateway, subnet, primaryDNS)) {
    Serial.println("[ERROR] Failed to configure ESP3 Static IP!");
  }

  // Connect WiFi
  WiFi.begin(ssid, password);
  Serial.printf("[WiFi] Connecting to %s...", ssid);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\n[WiFi] Connected successfully!");
  Serial.printf("[WiFi] ESP3 Fixed IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[WebSocket] Endpoint: ws://%s:8766/ws\n", WiFi.localIP().toString().c_str());

  // Setup WebSocket Server
  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);
  server.begin();
  Serial.println("[HTTP/WS] Server started on port 8766");
}

void loop() {
  ws.cleanupClients();

  unsigned long now = millis();
  if (now - lastBroadcastTime >= BROADCAST_INTERVAL_MS) {
    lastBroadcastTime = now;
    frameSequence++;

    // Read range values in millimeters, convert to meters
    uint16_t rawLeftMm = leftSensor.readRangeContinuousMillimeters();
    uint16_t rawRightMm = rightSensor.readRangeContinuousMillimeters();

    float leftM = (leftSensor.timeoutOccurred() || rawLeftMm > 2500) ? 2.50 : (float)rawLeftMm / 1000.0f;
    float rightM = (rightSensor.timeoutOccurred() || rawRightMm > 2500) ? 2.50 : (float)rawRightMm / 1000.0f;

    // Build JSON WebSocket Payload for Digital Twin 3D Cave Wall Rendering
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

    // Broadcast to all connected WebSocket clients (Digital Twin dashboard)
    ws.textAll(jsonOutput);
  }
}