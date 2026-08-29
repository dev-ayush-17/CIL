/**
 * ============================================================================
 * CIL MIN UGV ESP32 WebSocket Controller Reference
 * 
 * ILLUSTRATIVE REFERENCE SKETCH ONLY — UNVERIFIED
 * DO NOT ATTEMPT TO COMPILE directly as production firmware.
 * Keep out of the Next.js compilation paths.
 * ============================================================================
 * 
 * Target dependencies:
 * - ArduinoJson v6 or v7 (JSON serialization)
 * - ESPAsyncWebServer & AsyncTCP (WebSocket hosting)
 * 
 * Network Recommendation:
 * - Configure the ESP32 with a static IP or set up an mDNS responder (e.g. "cil-ugv.local")
 *   so that the dashboard's environment variable `NEXT_PUBLIC_TELEMETRY_WS_URL` can point
 *   to a persistent URL (e.g. `ws://cil-ugv.local/ws`) without changing on reboot.
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

// WiFi configurations
const char* ssid = "CIL_UGV_FIELD_AP";
const char* password = "coal_india_secured";

// WebSocket Server Port & Path
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// Global Telemetry Frame Variables (Simulated State)
int seq = 0;
bool estopActive = false;
float speedMps = 0.0;
String driveDir = "stop";

// Periodical frame dispatch timing
unsigned long lastTelemetrySent = 0;
const unsigned long telemetryInterval = 1000; // 1 second

// Function Declarations
void handleWebSocketMessage(void *arg, uint8_t *data, size_t len, AsyncWebSocketClient *client);
void sendTelemetryFrame(AsyncWebSocketClient *client);
void sendAck(AsyncWebSocketClient *client, const char* commandId, bool ok, const char* errorReason = nullptr);
void sendPong(AsyncWebSocketClient *client, const char* commandId, const char* timestamp);
void sendDeviceLog(const char* severity, const char* source, const char* message);

// Setup entry-point
void setup() {
  Serial.begin(115200);

  // 1. Establish Wi-Fi station or AP connection
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected.");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // 2. Setup WebSocket Callbacks
  ws.onEvent([](AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
    switch (type) {
      case WS_EVT_CONNECT:
        Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
        break;
      case WS_EVT_DISCONNECT:
        Serial.printf("WebSocket client #%u disconnected\n", client->id());
        break;
      case WS_EVT_DATA:
        handleWebSocketMessage(arg, data, len, client);
        break;
      case WS_EVT_PONG:
      case WS_EVT_ERROR:
        break;
    }
  });

  server.addHandler(&ws);
  server.begin();
  Serial.println("HTTP and WebSocket server started.");
}

// Main execution loop
void loop() {
  ws.cleanupClients();

  // Handle periodic telemetry broadcast to all connected clients
  unsigned long now = millis();
  if (now - lastTelemetrySent >= telemetryInterval) {
    lastTelemetrySent = now;
    // Broadcast telemetry frames to all clients
    if (ws.count() > 0) {
      ws.textAll(compileTelemetryJSON());
    }
  }

  // Failsafe check: If we have client connection but no heartbeat ping within timeout,
  // the UGV should perform an emergency failsafe (stop motors).
  // [Implement microcontroller safety timeouts here]
}

// Parses inbound JSON messages (heartbeats and commands)
void handleWebSocketMessage(void *arg, uint8_t *data, size_t len, AsyncWebSocketClient *client) {
  AwsFrameInfo *info = (AwsFrameInfo*)arg;
  if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
    
    // Allocate JSON Document
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, data, len);
    
    if (error) {
      Serial.print("JSON Deserialization failed: ");
      Serial.println(error.c_str());
      return;
    }

    const char* type = doc["type"];
    const char* commandId = doc["commandId"];
    
    if (!type || !commandId) return;

    // A. Handle Heartbeat Ping
    if (strcmp(type, "ping") == 0) {
      const char* timestamp = doc["timestamp"];
      sendPong(client, commandId, timestamp);
      return;
    }

    // B. Handle Operations Commands
    if (strcmp(type, "command") == 0) {
      JsonObject command = doc["command"];
      const char* cmdType = command["type"];
      
      if (!cmdType) {
        sendAck(client, commandId, false, "MISSING_COMMAND_TYPE");
        return;
      }

      // Check E-Stop restriction: reject motion commands if E-STOP is active
      if (estopActive && strcmp(cmdType, "reset_estop") != 0) {
        sendAck(client, commandId, false, "ROBOT_HALTED_ESTOP_ACTIVE");
        return;
      }

      // Execute Command Types
      if (strcmp(cmdType, "estop") == 0) {
        estopActive = true;
        speedMps = 0.0;
        driveDir = "stop";
        sendAck(client, commandId, true);
        sendDeviceLog("hazard", "SYS", "EMERGENCY_STOP_ACTUATED");
      } 
      else if (strcmp(cmdType, "reset_estop") == 0) {
        estopActive = false;
        sendAck(client, commandId, true);
        sendDeviceLog("info", "SYS", "EMERGENCY_STOP_CLEARED");
      } 
      else if (strcmp(cmdType, "drive") == 0) {
        driveDir = command["dir"].as<String>();
        sendAck(client, commandId, true);
      } 
      else if (strcmp(cmdType, "set_mode") == 0) {
        // Switch modes drive/walk
        sendAck(client, commandId, true);
      }
      else {
        // Acknowledge other types
        sendAck(client, commandId, true);
      }
    }
  }
}

// Formulate and send correlated command ACK
void sendAck(AsyncWebSocketClient *client, const char* commandId, bool ok, const char* errorReason) {
  StaticJsonDocument<256> doc;
  doc["type"] = "ack";
  doc["commandId"] = commandId;
  doc["ok"] = ok;
  if (!ok && errorReason) {
    doc["error"] = errorReason;
  }
  doc["at"] = "2026-08-29T18:00:00.000Z"; // Or read dynamic timestamp from RTC

  String buffer;
  serializeJson(doc, buffer);
  client->text(buffer);
}

// Formulate and send pong response to ping heartbeat
void sendPong(AsyncWebSocketClient *client, const char* commandId, const char* timestamp) {
  StaticJsonDocument<256> doc;
  doc["type"] = "pong";
  doc["commandId"] = commandId;
  doc["timestamp"] = timestamp;
  doc["at"] = "2026-08-29T18:00:00.000Z"; // Or read dynamic timestamp from RTC

  String buffer;
  serializeJson(doc, buffer);
  client->text(buffer);
}

// Compile current state and return telemetry frame JSON string
String compileTelemetryJSON() {
  StaticJsonDocument<1024> doc;
  doc["type"] = "frame";
  
  JsonObject frame = doc.createNestedObject("frame");
  frame["seq"] = seq++;
  frame["receivedAt"] = "2026-08-29T18:00:00.000Z";
  
  JsonObject control = frame.createNestedObject("control");
  control["mode"] = "drive";
  control["estopActive"] = estopActive;
  control["driveDir"] = driveDir;
  // [Populate other properties as defined in docs/ws-protocol.md]

  String buffer;
  serializeJson(doc, buffer);
  return buffer;
}

// Asynchronously dispatch device logs
void sendDeviceLog(const char* severity, const char* source, const char* message) {
  if (ws.count() > 0) {
    StaticJsonDocument<256> doc;
    doc["type"] = "log";
    doc["ts"] = "18:00:00"; // Read from RTC clock
    doc["severity"] = severity;
    doc["source"] = source;
    doc["message"] = message;

    String buffer;
    serializeJson(doc, buffer);
    ws.textAll(buffer);
  }
}
