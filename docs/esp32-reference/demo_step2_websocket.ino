/**
 * ESP32 STEP 2: Simple WebSocket Connection Test
 * ESP32 IP: 10.232.110.215
 * WebSocket Port: 8766
 * WebSocket Endpoint: ws://10.232.110.215:8766/ws (or /)
 * HTTP Test Page: http://10.232.110.215:8766/
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

// WiFi Credentials
const char* ssid = "moto g64 5G_3117";
const char* password = "uvsingh987";

AsyncWebServer server(8766);
AsyncWebSocket ws("/ws");
AsyncWebSocket wsRoot("/");

unsigned long lastTime = 0;
unsigned long packetCounter = 0;

void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.println("\n=======================================================");
    Serial.printf("  [SUCCESS] WEBSOCKET CLIENT CONNECTED!\n");
    Serial.printf("  Client ID: #%u | IP: %s\n", client->id(), client->remoteIP().toString().c_str());
    Serial.println("=======================================================\n");

    // Send instant welcome ACK to laptop browser
    client->text("{\"status\":\"CONNECTED\",\"message\":\"Welcome from ESP32 WebSocket!\"}");
  } 
  else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("[WebSocket] Client disconnected #%u\n", client->id());
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("  ESP32 STEP 2 — WEBSOCKET SERVER TEST");
  Serial.println("=======================================================");

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

  // CORS Headers
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "*");

  // HTTP Test Web Page (Open http://10.232.110.215:8766 in Chrome/Edge)
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    String html = "<!DOCTYPE html><html><head><title>ESP32 WS Test</title></head>"
                  "<body style='font-family:sans-serif; background:#0F172A; color:#E2E8F0; padding:40px; text-align:center;'>"
                  "<h1 style='color:#38BDF8;'>ESP32 WebSocket Server Active!</h1>"
                  "<p>IP Address: <b>10.232.110.215</b> | Port: <b>8766</b></p>"
                  "<div id='out' style='background:#1E293B; padding:20px; border-radius:10px; font-family:monospace; margin-top:20px;'>Connecting WebSocket...</div>"
                  "<script>"
                  "const ws = new WebSocket('ws://' + location.host + '/ws');"
                  "ws.onopen = () => document.getElementById('out').innerHTML = '<h2 style=\"color:#4ADE80;\">🟢 WebSocket Connected Successfully!</h2>';"
                  "ws.onmessage = (e) => document.getElementById('out').innerHTML += '<br>Received: ' + e.data;"
                  "ws.onerror = (e) => document.getElementById('out').innerHTML = '<h2 style=\"color:#F87171;\">🔴 Connection Failed</h2>';"
                  "</script></body></html>";
    request->send(200, "text/html", html);
  });

  // Attach WebSocket handlers
  ws.onEvent(onWsEvent);
  wsRoot.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.addHandler(&wsRoot);
  server.begin();

  Serial.println("=======================================================");
  Serial.printf("  WebSocket Server Started on Port 8766!\n");
  Serial.printf("  Endpoints: ws://%s:8766/ws and ws://%s:8766/\n", WiFi.localIP().toString().c_str(), WiFi.localIP().toString().c_str());
  Serial.printf("  Browser Test URL: http://%s:8766/\n", WiFi.localIP().toString().c_str());
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

  // Broadcast ping packet every 1 second
  if (millis() - lastTime >= 1000) {
    lastTime = millis();
    packetCounter++;

    StaticJsonDocument<128> doc;
    doc["status"] = "OK";
    doc["count"] = packetCounter;
    doc["ip"] = WiFi.localIP().toString();

    String jsonStr;
    serializeJson(doc, jsonStr);

    if (ws.count() > 0) ws.textAll(jsonStr);
    if (wsRoot.count() > 0) wsRoot.textAll(jsonStr);

    Serial.printf("[WebSocket Alive] Packet #%lu sent | Active Clients: %u\n", packetCounter, (unsigned int)(ws.count() + wsRoot.count()));
  }
}
