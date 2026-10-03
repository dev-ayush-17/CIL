/**
 * ESP32 STEP 3: Complete ToF Sensor + WebSocket Firmware
 * Reads Dual/Single VL53L0X Time-of-Flight Sensors and streams live distance data over WebSocket on Port 8766.
 *
 * HARDWARE WIRING SPECIFICATION:
 * 1. Common I2C Bus:
 *    - ESP32 GPIO 21 ---> Both VL53L0X SDA Pins (Shared Data Line)
 *    - ESP32 GPIO 22 ---> Both VL53L0X SCL Pins (Shared Clock Line)
 *    - ESP32 3.3V    ---> Both VL53L0X VCC Pins
 *    - ESP32 GND     ---> Both VL53L0X GND Pins
 *
 * 2. XSHUT Pin Address Multiplexing (Controls Left vs Right Sensor):
 *    - ESP32 GPIO 25 ---> Left VL53L0X XSHUT Pin (Configured as I2C Address 0x30)
 *    - ESP32 GPIO 26 ---> Right VL53L0X XSHUT Pin (Configured as I2C Address 0x31)
 */

#include <WiFi.h>
#include <Wire.h>
#include <VL53L0X.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

// WiFi Credentials
const char* ssid = "Phone 3";
const char* password = "uvsingh987";

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

void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.println("\n=======================================================");
    Serial.printf("  [SUCCESS] DIGITAL TWIN CLIENT CONNECTED!\n");
    Serial.printf("  Client ID: #%u | IP: %s\n", client->id(), client->remoteIP().toString().c_str());
    Serial.println("=======================================================\n");

    client->text("{\"status\":\"CONNECTED\",\"message\":\"ESP3 ToF Sensor Ready\"}");
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("[WebSocket] Dashboard client disconnected #%u\n", client->id());
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("  ESP32 STEP 3 — TOF SENSOR + WEBSOCKET SERVER");
  Serial.println("=======================================================");

  // Initialize I2C Bus at 100kHz standard speed
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

  // 3. Fallback: Test default I2C address 0x29 (Single Sensor)
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

  // Connect WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.printf("[WiFi] Connecting to %s", ssid);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[SUCCESS] Connected to WiFi!");
  Serial.print("[ESP32 IP ADDRESS] : ");
  Serial.println(WiFi.localIP());

  // Allow Cross-Origin Requests
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "*");

  // HTTP Test Web Page
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "UGV ESP3 ToF WebSocket Server OK");
  });

  // Attach WebSocket handlers
  ws.onEvent(onWsEvent);
  wsRoot.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.addHandler(&wsRoot);
  server.begin();

  Serial.println("=======================================================");
  Serial.printf("  ToF WebSocket Server Running on Port 8766!\n");
  Serial.printf("  Endpoint: ws://%s:8766/ws\n", WiFi.localIP().toString().c_str());
  Serial.println("=======================================================");
}

void loop() {
  // Throttle client cleanup to every 2 seconds
  static unsigned long lastCleanup = 0;
  if (millis() - lastCleanup >= 2000) {
    lastCleanup = millis();
    ws.cleanupClients();
    wsRoot.cleanupClients();
  }

  unsigned long now = millis();
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
      rightM = leftM;
    }

    // Build JSON Telemetry Payload
    StaticJsonDocument<256> doc;
    doc["seq"] = frameSequence;
    doc["ts"] = now;
    
    JsonObject tof = doc.createNestedObject("tof");
    tof["left"] = leftM;
    tof["right"] = rightM;

    JsonObject lidar = doc.createNestedObject("lidar");
    lidar["leftM"] = leftM;
    lidar["rightM"] = rightM;

    String jsonStr;
    serializeJson(doc, jsonStr);

    // Broadcast to Digital Twin dashboard WebSocket clients
    if (ws.count() > 0) ws.textAll(jsonStr);
    if (wsRoot.count() > 0) wsRoot.textAll(jsonStr);

    Serial.printf("[ToF ESP3] Frame #%lu | Left: %.2f m | Right: %.2f m | Active Clients: %u\n",
                  frameSequence, leftM, rightM, (unsigned int)(ws.count() + wsRoot.count()));
  }
}
