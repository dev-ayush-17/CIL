/**
 * ESP32-S CAM STEP 3: Complete Camera Firmware with Dual Stream
 * (WebSocket Binary Camera Stream on Port 8765 + MJPEG Stream on Port 81)
 *
 * Board Selection in Arduino IDE: "AI Thinker ESP32-CAM" or "ESP32 Wrover Module"
 * Hardware: ESP32-S Camera Module (OV2640 Sensor)
 *
 * Endpoints:
 *  - WebSocket Stream: ws://<ESP32_IP>:8765/ws (Binary JPEG & JSON metadata)
 *  - MJPEG Video Stream: http://<ESP32_IP>:81/stream
 *  - Web Dashboard: http://<ESP32_IP>:8765/
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include "esp_http_server.h"
#include <ArduinoJson.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// Wi-Fi Credentials
const char* ssid = "Phone 3";
const char* password = "uvsingh987";

// ESP32-S CAM Board Pinout (AI-Thinker Pin Configuration)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22
#define FLASH_LED_GPIO     4
#define LED_BUILTIN_RED   33 // Active LOW

AsyncWebServer server(8765);
AsyncWebSocket ws("/ws");
httpd_handle_t stream_httpd = NULL;

uint32_t frameCounter = 0;
unsigned long lastFrameTime = 0;
float currentFps = 0.0;

// Embedded HTML Test Dashboard for live browser testing
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>ESP32-S CAM Live WebSocket Stream</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; background: #080d1a; color: #38bdf8; text-align: center; margin: 0; padding: 15px; }
    h2 { margin-bottom: 5px; color: #f8fafc; }
    .status { font-size: 14px; color: #ef4444; font-weight: bold; margin-bottom: 15px; }
    .online { color: #22c55e; }
    .stream-box { display: inline-block; background: #0f172a; padding: 10px; border-radius: 12px; border: 2px solid #38bdf8; max-width: 640px; width: 100%; }
    img { width: 100%; height: auto; border-radius: 8px; background: #000; display: block; }
    .badge { margin-top: 10px; font-family: monospace; font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <h2>📷 ESP32-S CAM Live WebSocket & MJPEG Console</h2>
  <div id="st" class="status">CONNECTING TO WEBSOCKET...</div>

  <div class="stream-box">
    <img id="stream" alt="Live Camera Stream" src="" />
    <div class="badge" id="meta">Frames Received: 0 | FPS: 0.0</div>
  </div>

  <script>
    const img = document.getElementById("stream");
    const st = document.getElementById("st");
    const meta = document.getElementById("meta");
    let count = 0;
    let lastTime = performance.now();

    const wsUrl = `ws://${window.location.hostname}:8765/ws`;
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "blob";

    socket.onopen = () => {
      st.innerText = "🟢 WEBSOCKET CONNECTED (LIVE STREAMING ON PORT 8765)";
      st.className = "status online";
    };

    socket.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        img.onload = () => URL.revokeObjectURL(url);
        img.src = url;
        count++;
        const now = performance.now();
        const fps = (1000 / (now - lastTime)).toFixed(1);
        lastTime = now;
        meta.innerText = `WebSocket Frame #${count} | Render FPS: ${fps}`;
      } else {
        try {
          const data = JSON.parse(event.data);
          console.log("Telemetry:", data);
        } catch(e) {}
      }
    };

    socket.onclose = () => {
      st.innerText = "🔴 WEBSOCKET DISCONNECTED (FALLING BACK TO MJPEG STREAM)";
      st.className = "status";
      img.src = `http://${window.location.hostname}:81/stream`;
    };
  </script>
</body>
</html>
)rawliteral";

// HTTP MJPEG Stream Handler for Port 81
#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  char part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("[ERROR] ESP32-S Frame capture failed");
      res = ESP_FAIL;
    } else {
      size_t hlen = snprintf(part_buf, 64, _STREAM_PART, fb->len);
      res = httpd_resp_send_chunk(req, part_buf, hlen);
      if (res == ESP_OK) {
        res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
      }
      if (res == ESP_OK) {
        res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
      }
      esp_camera_fb_return(fb);
      fb = NULL;
    }
    if (res != ESP_OK) break;
    delay(40);
  }
  return res;
}

void startMJPEGServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 81;

  httpd_uri_t stream_uri = {
    .uri       = "/stream",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    Serial.println("[OK] HTTP MJPEG stream ready at http://<ESP32_IP>:81/stream");
  }
}

void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type,
             void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("[WebSocket] Client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.printf("[WebSocket] Client #%u disconnected\n", client->id());
  }
}

void setup() {
  // Disable brownout detector to prevent ESP32-S power resets
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(500);

  Serial.println("\n=======================================================");
  Serial.println("  ESP32-S CAM STEP 3: FULL CAMERA WEBSOCKET FIRMWARE");
  Serial.println("=======================================================");

  pinMode(FLASH_LED_GPIO, OUTPUT);
  digitalWrite(FLASH_LED_GPIO, LOW);
  pinMode(LED_BUILTIN_RED, OUTPUT);
  digitalWrite(LED_BUILTIN_RED, HIGH); // Active LOW

  // Camera Configuration for ESP32-S CAM
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // PSRAM Memory Allocation Check
  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
    config.grab_mode = CAMERA_GRAB_LATEST;
    Serial.println("[OK] PSRAM Detected! Using VGA resolution with dual framebuffer.");
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    Serial.println("[WARNING] PSRAM Not Found. Using QVGA resolution.");
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[ERROR] ESP32-S Camera init failed with code 0x%x\n", err);
    return;
  }
  Serial.println("[OK] OV2640 Camera Hardware Initialized!");

  // Connect Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  WiFi.setSleep(false);

  Serial.printf("[Wi-Fi] Connecting to %s...", ssid);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    digitalWrite(LED_BUILTIN_RED, !digitalRead(LED_BUILTIN_RED));
    Serial.print(".");
  }

  digitalWrite(LED_BUILTIN_RED, LOW); // Turn RED LED ON solid
  Serial.println("\n[Wi-Fi] Connected successfully!");
  Serial.printf("[Wi-Fi] ESP32-S CAM Assigned IP: %s\n", WiFi.localIP().toString().c_str());

  // WebSocket Server Setup
  ws.onEvent(onEvent);
  server.addHandler(&ws);

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send_P(200, "text/html", index_html);
  });

  server.begin();
  Serial.printf("[OK] WebSocket server ready at ws://%s:8765/ws\n", WiFi.localIP().toString().c_str());

  // Start MJPEG Server
  startMJPEGServer();
}

void loop() {
  if (ws.count() > 0) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (fb) {
      ws.binaryAll((uint8_t*)fb->buf, fb->len);
      esp_camera_fb_return(fb);

      frameCounter++;
      unsigned long now = millis();
      if (now - lastFrameTime >= 1000) {
        currentFps = (frameCounter * 1000.0) / (now - lastFrameTime);
        Serial.printf("[ESP32-S CAM] Live Stream | Frame #%u | FPS: %.1f | Clients: %u\n",
                      frameCounter, currentFps, ws.count());
        frameCounter = 0;
        lastFrameTime = now;
      }
    }
  } else {
    delay(200);
  }

  static unsigned long lastCleanup = 0;
  if (millis() - lastCleanup > 2000) {
    ws.cleanupClients();
    lastCleanup = millis();
  }
}
