/**
 * UGV Tunnel-Assist Robot — ESP32 Firmware Phase 3
 * Real MQ-4 (Methane) & MQ-7 (Carbon Monoxide) Sensor Integration over WebSocket
 *
 * HARDWARE & WIRING SPECIFICATION:
 * -----------------------------------------------------------------------------
 * 1. Power Supply:
 *    - MQ-4 and MQ-7 modules require +5V VCC for internal heaters.
 *    - Connect sensor VCC to ESP32 5V (VIN) pin or external 5V power supply.
 *    - Connect sensor GND to ESP32 GND (common ground required).
 *
 * 2. Voltage Dividers (CRITICAL FOR SAFETY):
 *    - Sensor Analog Output (0V - 5V) can exceed ESP32 ADC max safe limit (3.3V).
 *    - Pass each sensor AO through a Voltage Divider before connecting to ESP32:
 *        Sensor AO  ----[ 10k resistor ]----+---- ESP32 ADC Pin
 *                                           |
 *                                     [ 20k resistor ]
 *                                           |
 *                                          GND
 *    - Voltage ratio: V_adc = V_sensor * (20k / (10k + 20k)) = V_sensor * (2/3)
 *    - Sensor Voltage multiplier: V_sensor = V_adc * 1.5
 *
 * 3. ADC1 Pin Selection (Wi-Fi Safe):
 *    - MQ-4 (Methane CH4) Analog Pin -> GPIO 32 (ADC1 Channel 4)
 *    - MQ-7 (Carbon Monoxide CO) Analog Pin -> GPIO 34 (ADC1 Channel 6)
 *    - NOTE: Do NOT use ADC2 pins (GPIO 0, 2, 4, 12-15, 25-27) as Wi-Fi disables ADC2!
 *
 * DEPENDENCIES (Install via Arduino IDE Library Manager):
 *  - "ArduinoJson" by Benoit Blanchon (v6 or v7)
 *  - "ESPAsyncWebServer" by Mathieu Carbou (Supports ESP32 Core 3.x)
 *  - "AsyncTCP" by Mathieu Carbou
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

// ============================================================================
// WiFi & Network Config
// ============================================================================
const char* ssid = "YOUR_WIFI_NAME";       // <-- Edit Wi-Fi Name
const char* password = "YOUR_WIFI_PASSWORD"; // <-- Edit Wi-Fi Password

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// ============================================================================
// Gas Sensor Pin & Electrical Specs
// ============================================================================
const int MQ4_PIN = 32; // ADC1_CH4
const int MQ7_PIN = 34; // ADC1_CH6

const float RL_VALUE = 10.0;          // Load resistance in kOhm
const float VOLTAGE_DIVIDER_MULT = 1.5; // (10k + 20k) / 20k = 1.5
const float VCC_VOLTS = 5.0;

// Sensor Status States
enum SensorState { WARMING_UP, CALIBRATING, SENSOR_OK };
SensorState currentSensorState = WARMING_UP;

// Warm-up & Calibration Timing (ms)
const unsigned long WARMUP_DURATION_MS = 30000;    // 30 seconds warm-up
const unsigned long CALIBRATION_DURATION_MS = 15000; // 15 seconds clean air R0 calibration
unsigned long bootTimeMs = 0;

// Computed R0 Baseline Resistances (kOhm)
float R0_MQ4 = 10.0; // Default fallback
float R0_MQ7 = 10.0; // Default fallback

// Accumulators for R0 Calibration
float R0_MQ4_Sum = 0.0;
float R0_MQ7_Sum = 0.0;
int calibrationSamples = 0;

// Current Sensor Readings
float currentCh4Ppm = 0.0;
float currentCoPpm = 0.0;

// Control / System State
unsigned long lastSend = 0;
int seq = 0;
bool estopActive = false;
String driveDir = "stop";

// ============================================================================
// Gas Calculation Helpers
// ============================================================================
// Oversample ADC 10 times to reduce noise
float readMilliVoltsAveraged(int pin) {
  long sumMv = 0;
  for (int i = 0; i < 10; i++) {
    sumMv += analogReadMilliVolts(pin);
    delay(2);
  }
  return sumMv / 10.0;
}

// Convert ADC voltage to Sensor Resistance (Rs) in kOhm
float calculateRs(float rawMv) {
  float vAdc = rawMv / 1000.0;
  float vSensor = vAdc * VOLTAGE_DIVIDER_MULT;
  if (vSensor < 0.1) vSensor = 0.1; // Protect against divide-by-zero
  if (vSensor >= VCC_VOLTS) vSensor = VCC_VOLTS - 0.05;
  
  float rs = ((VCC_VOLTS - vSensor) / vSensor) * RL_VALUE;
  return rs;
}

// MQ-4 Methane PPM: ppm = 1012.7 * (Rs / R0)^(-2.786)
float calculateMq4Ppm(float rs, float r0) {
  if (r0 <= 0.0) r0 = 1.0;
  float ratio = rs / r0;
  float ppm = 1012.7 * pow(ratio, -2.786);
  return (ppm < 0.0) ? 0.0 : ppm;
}

// MQ-7 CO PPM: ppm = 99.042 * (Rs / R0)^(-1.518)
float calculateMq7Ppm(float rs, float r0) {
  if (r0 <= 0.0) r0 = 1.0;
  float ratio = rs / r0;
  float ppm = 99.042 * pow(ratio, -1.518);
  return (ppm < 0.0) ? 0.0 : ppm;
}

// ============================================================================
// WebSocket Response Helpers
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
  if (err) {
    Serial.print("[WS] JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

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
    Serial.print("[COMMAND] Type: ");
    Serial.println(cmdType);

    if (strcmp(cmdType, "drive") == 0) {
      driveDir = command["dir"].as<String>();
      Serial.print("  -> drive direction: ");
      Serial.println(driveDir);
    } else if (strcmp(cmdType, "estop") == 0) {
      estopActive = true;
      driveDir = "stop";
      Serial.println("  -> EMERGENCY STOP TRIGGERED");
    } else if (strcmp(cmdType, "reset_estop") == 0) {
      estopActive = false;
      Serial.println("  -> E-STOP CLEARED");
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
  Serial.println(" Phase 3: Real MQ-4 Methane & MQ-7 CO Integration");
  Serial.println("==================================================");

  // Configure ADC Pins
  pinMode(MQ4_PIN, INPUT);
  pinMode(MQ7_PIN, INPUT);

  // Connect Wi-Fi
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("[WiFi] Connected! ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // Start WebSocket Server & HTTP Status Handler
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "UGV Tunnel-Assist Robot ESP32 Telemetry Server Online!\nWebSocket endpoint active at /ws");
  });

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.begin();
  Serial.print("[WS] WebSocket Server Listening -> ws://");
  Serial.print(WiFi.localIP());
  Serial.println("/ws\n");

  bootTimeMs = millis();
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  ws.cleanupClients();

  unsigned long now = millis();
  unsigned long elapsed = now - bootTimeMs;

  // --------------------------------------------------------------------------
  // Sensor State Machine: Warm-up -> Calibration -> OK
  // --------------------------------------------------------------------------
  if (elapsed < WARMUP_DURATION_MS) {
    currentSensorState = WARMING_UP;
  } else if (elapsed < (WARMUP_DURATION_MS + CALIBRATION_DURATION_MS)) {
    if (currentSensorState != CALIBRATING) {
      currentSensorState = CALIBRATING;
      Serial.println("\n[GAS] Warm-up complete. Starting clean-air R0 calibration...");
    }
  } else {
    if (currentSensorState != SENSOR_OK) {
      currentSensorState = SENSOR_OK;
      if (calibrationSamples > 0) {
        R0_MQ4 = R0_MQ4_Sum / calibrationSamples;
        R0_MQ7 = R0_MQ7_Sum / calibrationSamples;
      }
      Serial.println("\n[GAS] Calibration complete! Computed baselines:");
      Serial.printf("      MQ-4 (Methane) R0: %.2f kOhm\n", R0_MQ4);
      Serial.printf("      MQ-7 (CO) R0:      %.2f kOhm\n\n", R0_MQ7);
    }
  }

  // Read analog pins & calculate resistance
  float rawMvMQ4 = readMilliVoltsAveraged(MQ4_PIN);
  float rawMvMQ7 = readMilliVoltsAveraged(MQ7_PIN);
  float rsMQ4 = calculateRs(rawMvMQ4);
  float rsMQ7 = calculateRs(rawMvMQ7);

  if (currentSensorState == CALIBRATING) {
    // Accumulate clean air baseline resistance (assuming ratio Rs/R0 ~ 4.4 for MQ4, ~27 for MQ7 in clean air)
    R0_MQ4_Sum += (rsMQ4 / 4.4);
    R0_MQ7_Sum += (rsMQ7 / 27.0);
    calibrationSamples++;
  } else if (currentSensorState == SENSOR_OK) {
    currentCh4Ppm = calculateMq4Ppm(rsMQ4, R0_MQ4);
    currentCoPpm = calculateMq7Ppm(rsMQ7, R0_MQ7);
  }

  // --------------------------------------------------------------------------
  // 1 Hz Telemetry Broadcast & Serial Diagnostics
  // --------------------------------------------------------------------------
  if (now - lastSend >= 1000) {
    lastSend = now;

    const char* statusStr = (currentSensorState == WARMING_UP) ? "warming_up" :
                            (currentSensorState == CALIBRATING) ? "calibrating" : "ok";

    // Serial Diagnostics
    Serial.printf("[READING] State: %-12s | MQ4(CH4): %5.2f mV, Rs: %5.2f kOhm -> %6.2f PPM | MQ7(CO): %5.2f mV, Rs: %5.2f kOhm -> %6.2f PPM\n",
                  statusStr, rawMvMQ4, rsMQ4, currentCh4Ppm, rawMvMQ7, rsMQ7, currentCoPpm);

    // Broadcast WebSocket Frame if clients connected
    if (ws.count() > 0) {
      JsonDocument doc;
      doc["type"] = "frame";
      
      JsonObject frame = doc["frame"].to<JsonObject>();
      frame["seq"] = seq++;
      frame["receivedAt"] = "2026-09-09T00:00:00.000Z";

      // Gas telemetry matching schema.ts
      JsonObject gas = frame["gas"].to<JsonObject>();
      gas["ch4Ppm"] = currentCh4Ppm;
      gas["ch4Status"] = statusStr;
      gas["ch4Warn"] = (currentCh4Ppm >= 1.0);
      gas["ch4Crit"] = (currentCh4Ppm >= 5.0);
      gas["ch4WarnThresholdPpm"] = 1.0;
      gas["ch4ExplThresholdPpm"] = 5.0;

      gas["coPpm"] = currentCoPpm;
      gas["coStatus"] = statusStr;
      JsonObject coStats = gas["coStats"].to<JsonObject>();
      coStats["currentC"] = currentCoPpm;
      coStats["minC"] = 0.0;
      coStats["maxC"] = currentCoPpm;
      coStats["avgC"] = currentCoPpm;

      // Mission & System telemetry
      JsonObject mission = frame["mission"].to<JsonObject>();
      mission["id"] = "DELTA-4";
      mission["phase"] = "survey";
      mission["robotOnline"] = true;
      mission["elapsedSec"] = (now - bootTimeMs) / 1000;
      mission["distanceM"] = 12.4;
      mission["tunnelProgressPct"] = 28.5;
      mission["sector"] = "SECTOR-S7";

      JsonObject control = frame["control"].to<JsonObject>();
      control["estopActive"] = estopActive;
      control["driveDir"] = driveDir;
      control["mode"] = "drive";

      JsonObject power = frame["power"].to<JsonObject>();
      power["mainPct"] = 88;
      power["voltageV"] = 24.2;
      power["currentA"] = 1.8;

      JsonObject thermal = frame["thermal"].to<JsonObject>();
      thermal["ambientC"] = 26.5;
      thermal["humidityPct"] = 58;

      JsonObject link = frame["link"].to<JsonObject>();
      link["quality"] = "online";
      link["batteryPct"] = 88;
      link["signalPct"] = 92;
      link["snrDbm"] = -65;
      link["nodesDropped"] = 0;
      link["nodesTotal"] = 10;

      JsonObject air = frame["air"].to<JsonObject>();
      air["pm1"] = 12;
      air["pm25"] = 34;
      air["pm10"] = 45;

      JsonObject lidar = frame["lidar"].to<JsonObject>();
      lidar["leftM"] = 1.8;
      lidar["rightM"] = 1.8;

      JsonObject motion = frame["motion"].to<JsonObject>();
      motion["speedMps"] = 0.0;
      motion["speedMaxMps"] = 2.0;

      String out;
      serializeJson(doc, out);
      ws.textAll(out);
    }
  }
}
