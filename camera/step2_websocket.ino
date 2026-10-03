/**
 * ESP32-S CAM STEP 2: WebSocket Connection Test
 * Board: ESP32-S Camera Module (AI Thinker ESP32-CAM)
 * WebSocket Port: 8765
 * Endpoint: ws://<ESP32_IP>:8765/ws
 * Test Web Page: http://<ESP32_IP>:8765/
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// Pin Definitions for ESP32-S CAM
#define LED_BUILTIN_RED 33 // Active LOW

// Wi-Fi Credentials
const char* ssid = "Phone 3";
const char* password = "uvsingh987";

// Async Web Server & WebSocket on port 8765
AsyncWebServer server(8765);
AsyncWebSocket ws("/ws");

unsigned long lastPing = 0;
uint32_t frameCounter = 0;

// Embedded HTML Test Page
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>ESP32-S CAM WebSocket Test</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: monospace; background: #0b0f19; color: #38bdf8; text-align: center; padding: 20px; }
    .card { background: #161f30; padding: 20px; border-radius: 8px; border: 1px solid #38bdf8; max-width: 600px; margin: auto; }
    .status { font-size: 20px; font-weight: bold; color: #ef4444; }
    .online { color: #22c55e; }
    #log { background: #000; text-align: left; padding: 10px; height: 180px; overflow-y: auto; border: 1px solid #334155; margin-top: 15px; color: #a5f3fc; }
  </style>
</head>
<body>
  <div class="card">
    <h2>📷 ESP32-S CAM WebSocket Server (Port 8765)</h2>
    <p>Status: <span id="st" class="status">DISCONNECTED</span></p>
    <p>WebSocket Endpoint: <span id="url"></span></p>
    <div id="log">Connecting...</div>
  </div>

  <script>
    const wsUrl = `ws://${window.location.hostname}:8765/ws`;
    document.getElementById("url").innerText = wsUrl;
    const log = document.getElementById("log");
    const st = document.getElementById("st");

    function addLog(msg) {
      log.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
      log.scrollTop = log.scrollHeight;
    }

    const socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      st.innerText = "CONNECTED 🟢";
      st.className = "status online";
      addLog("Connected to ESP32-S CAM WebSocket!");
    };
    socket.onmessage = (e) => {
      addLog("Rx: " + e.data);
    };
    socket.onclose = () => {
      st.innerText = "DISCONNECTED 🔴";
      st.className = "status";
      addLog("WebSocket disconnected.");
    };
  </script>
</body>
</html>
)rawliteral";

void handleWebSocketMessage(void *arg, uint8_t *data, size_t len) {
  AwsFrameInfo *info = (AwsFrameInfo*)arg;
  if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
    data[len] = 0;
    Serial.printf("[WebSocket Rx] %s\n", (char*)data);
  }
}

void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type,
             void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("[WebSocket] Client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
      client->text("{\"camera\":\"ESP32-S CAM\",\"status\":\"online\",\"msg\":\"WebSocket Connected!\"}");
      break;
    case WS_EVT_DISCONNECT:
      Serial.printf("[WebSocket] Client #%u disconnected\n", client->id());
      break;
    case WS_EVT_DATA:
      handleWebSocketMessage(arg, data, len);
      break;
    case WS_EVT_PONG:
    case WS_EVT_ERROR:
      break;
  }
}

void setup() {
  // Disable brownout detector for ESP32-S stability
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(500);

  pinMode(LED_BUILTIN_RED, OUTPUT);
  digitalWrite(LED_BUILTIN_RED, HIGH); // Active LOW

  Serial.println("\n=======================================================");
  Serial.println("  ESP32-S CAM STEP 2: WEBSOCKET TEST SERVER (PORT 8765)");
  Serial.println("=======================================================");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  WiFi.setSleep(false);

  Serial.printf("[Wi-Fi] Connecting to %s...", ssid);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    digitalWrite(LED_BUILTIN_RED, !digitalRead(LED_BUILTIN_RED));
    Serial.print(".");
  }

  digitalWrite(LED_BUILTIN_RED, LOW); // Solid Red LED ON when connected
  Serial.println("\n[Wi-Fi] Connected successfully!");
  Serial.printf("[Wi-Fi] ESP32-S CAM IP: %s\n", WiFi.localIP().toString().c_str());

  // Attach WebSocket
  ws.onEvent(onEvent);
  server.addHandler(&ws);

  // Serve test page at http://<IP>:8765/
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send_P(200, "text/html", index_html);
  });

  server.begin();
  Serial.printf("[OK] WebSocket server active at ws://%s:8765/ws\n", WiFi.localIP().toString().c_str());
  Serial.printf("[OK] Test web page active at http://%s:8765/\n\n", WiFi.localIP().toString().c_str());
}

void loop() {
  if (millis() - lastPing > 1000) {
    lastPing = millis();
    frameCounter++;

    if (ws.count() > 0) {
      StaticJsonDocument<200> doc;
      doc["type"] = "camera_status";
      doc["module"] = "ESP32-S CAM";
      doc["status"] = "online";
      doc["frame"] = frameCounter;
      doc["clients"] = ws.count();
      doc["rssi"] = WiFi.RSSI();

      String jsonOut;
      serializeJson(doc, jsonOut);
      ws.textAll(jsonOut);

      Serial.printf("[ESP32-S CAM] Frame #%u | Broadcast to %u client(s)\n", frameCounter, ws.count());
    } else {
      Serial.printf("[ESP32-S CAM] Frame #%u | Clients: 0\n", frameCounter);
    }
  }

  static unsigned long lastCleanup = 0;
  if (millis() - lastCleanup > 2000) {
    ws.cleanupClients();
    lastCleanup = millis();
  }
}
