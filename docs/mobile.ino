#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoOTA.h>
#include <Preferences.h>

// ==========================================
// WIFI & IP CONFIGURATION
// ==========================================
const char* ssid = "YOUR_WIFI_SSID";        
const char* password = "YOUR_WIFI_PASSWORD"; 

// Set to 'true' if you want to force the static IP
// Set to 'false' to let your router assign an IP automatically (Recommended)
bool useStaticIP = true; 

// Matching your exact Wi-Fi network settings
IPAddress local_IP(10, 232, 110, 100);   // The robot's new permanent IP
IPAddress gateway(10, 232, 110, 148);    // Your router's gateway from cmd
IPAddress subnet(255, 255, 255, 0);      // Your subnet from cmd
IPAddress primaryDNS(8, 8, 8, 8);
IPAddress secondaryDNS(8, 8, 4, 4);

WebServer server(80);
WebSocketsServer webSocket = WebSocketsServer(81);
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver();
Preferences prefs;

// ==========================================
// FUNCTION PROTOTYPES
// ==========================================
float filterMotion(float target, float current, int strength);
void writeMicrosecondsToPCA(uint8_t channel, float microSec);
void handleRoot();
void handleCmd();
void handleDrive();
void handleSpeed();
void broadcastTwinCommand(String mode, String dir);

// ==========================================
// ULTRASONIC SENSOR PINS (HC-SR04)
// ==========================================
#define LEFT_TRIG  5
#define LEFT_ECHO  18
#define RIGHT_TRIG 19
#define RIGHT_ECHO 21

float readUltrasonicCm(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout (~5m max)
  if (duration == 0) return -1.0;
  float dist = (duration * 0.0343) / 2.0;
  return (dist >= 2.0 && dist <= 400.0) ? dist : -1.0;
}

unsigned long lastUltrasonicRead = 0;
float currentLeftDistM = 0.0;
float currentRightDistM = 0.0;

// ==========================================
// CALIBRATED HARDWARE CONSTANTS
// ==========================================
int fl_DOWN = 1600, fl_UP = 800;
int fr_DOWN = 1600, fr_UP = 800;
int bl_DOWN = 1400, bl_UP = 2200;
int br_DOWN = 1400, br_UP = 2200;
int slider_MIN = 1300, slider_MAX = 1700;
int rot_OFFSET = 200, rot_TWIST = 800;

float servo1Pos, servo2Pos, servo3Pos, servo4Pos, servo5Pos, servo6Pos;
float s1F, s2F, s3F, s4F, s5F, s6F;

unsigned long currentMillis;
long previousMillis = 0;
long previousWalkMillis = 0;
int stepTime = 200; 
int filterVal = 5;  
int walkCount = 0;

int currentMode = 1; 
int walkAction = 0;  
int driveAction = 0; 
int driveSpeed = 150; 

// ==========================================
// SLEEK MOBILE CONTROLLER HTML DASHBOARD
// ==========================================
const char* htmlPage PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <title>Mini Dog Mobile Controller</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-align: center; background-color: #0F172A; color: #F8FAFC; margin: 0; padding: 16px; }
    h2 { color: #38BDF8; margin-top: 5px; margin-bottom: 4px; font-size: 22px; }
    .badge { display: inline-block; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38BDF8; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-family: monospace; margin-bottom: 15px; }
    
    .mode-switch { display: flex; gap: 8px; max-width: 360px; margin: 0 auto 16px auto; }
    .mode-btn { flex: 1; padding: 12px; font-size: 14px; font-weight: bold; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: #1E293B; color: #94A3B8; cursor: pointer; transition: all 0.2s; }
    .mode-btn.active-drive { background: linear-gradient(135deg, #F97316, #EA580C); color: white; border-color: #F97316; box-shadow: 0 0 12px rgba(249,115,22,0.4); }
    .mode-btn.active-walk { background: linear-gradient(135deg, #3B82F6, #2563EB); color: white; border-color: #3B82F6; box-shadow: 0 0 12px rgba(59,130,246,0.4); }

    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; max-width: 360px; margin: 10px auto 20px auto; }
    .btn { background: #1E293B; color: #F8FAFC; border: 2px solid #38BDF8; padding: 18px 10px; font-size: 16px; font-weight: bold; border-radius: 12px; cursor: pointer; touch-action: manipulation; transition: transform 0.1s, background 0.1s; }
    .btn:active { transform: scale(0.95); background: #38BDF8; color: #0F172A; }
    
    .btn-drive { border-color: #F97316; }
    .btn-drive:active { background: #F97316; color: white; }
    
    .btn-stop { grid-column: span 1; border-color: #EF4444; background: rgba(239,68,68,0.15); color: #FCA5A5; }
    .btn-stop:active { background: #EF4444; color: white; }

    .slider-box { background: #1E293B; padding: 16px; border-radius: 12px; max-width: 360px; margin: 0 auto 16px auto; text-align: left; border: 1px solid rgba(255,255,255,0.05); }
    .slider-box h4 { margin: 0 0 8px 0; color: #38BDF8; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    input[type=range] { width: 100%; height: 6px; background: #334155; border-radius: 4px; outline: none; margin-top: 8px; }
    .val-display { color: #F97316; font-weight: bold; float: right; font-family: monospace; }
    
    #ws-status { font-size: 11px; color: #10B981; font-weight: 600; margin-top: 10px; }
  </style>
  <script>
    let activeMode = 'drive'; 

    function setMode(mode) {
      activeMode = mode;
      document.getElementById('btn-mode-drive').className = 'mode-btn' + (mode === 'drive' ? ' active-drive' : '');
      document.getElementById('btn-mode-walk').className = 'mode-btn' + (mode === 'walk' ? ' active-walk' : '');
      
      const buttons = document.querySelectorAll('.grid .btn-dir');
      buttons.forEach(b => {
        if (mode === 'drive') b.classList.add('btn-drive');
        else b.classList.remove('btn-drive');
      });
      
      fetch('/cmd?action=stop');
    }

    function sendDir(dir) {
      if (activeMode === 'drive') {
        fetch('/drive?action=' + dir);
      } else {
        fetch('/cmd?action=' + dir);
      }
    }

    function updateSpeed(val) {
      document.getElementById('w_spd_v').innerText = val;
      fetch('/setSpeed?val=' + val);
    }
  </script>
</head>
<body>

  <h2>Mini Dog Controller</h2>
  <div class="badge">IP: %IP_ADDRESS% &bull; WS Port: 81</div>

  <div class="mode-switch">
    <button id="btn-mode-drive" class="mode-btn active-drive" onclick="setMode('drive')">⚙ Wheel Drive</button>
    <button id="btn-mode-walk" class="mode-btn" onclick="setMode('walk')">🐕 Walk Mode</button>
  </div>

  <div class="slider-box">
    <h4>Wheel Drive Speed <span id="w_spd_v" class="val-display">%driveSpeed%</span></h4>
    <input type="range" id="w_spd" min="50" max="500" value="%driveSpeed%" oninput="updateSpeed(this.value)">
  </div>

  <div class="grid">
    <div></div>
    <button class="btn btn-dir btn-drive" onclick="sendDir('forward')">▲ FWD</button>
    <div></div>
    
    <button class="btn btn-dir btn-drive" onclick="sendDir('left')">◀ LFT</button>
    <button class="btn btn-stop" onclick="sendDir('stop')">⏹ STOP</button>
    <button class="btn btn-dir btn-drive" onclick="sendDir('right')">RGT ▶</button>
    
    <div></div>
    <button class="btn btn-dir btn-drive" onclick="sendDir('backward')">▼ BCK</button>
    <div></div>
  </div>

  <div id="ws-status">🟢 Digital Twin WebSocket Sync Active</div>

</body>
</html>
)rawliteral";

// ==========================================
// WEBSOCKET BROADCAST TO DIGITAL TWIN
// ==========================================
void broadcastTwinCommand(String mode, String dir) {
  String json = "{\"type\":\"command\",\"mode\":\"" + mode + "\",\"command\":{\"type\":\"" + mode + "\",\"dir\":\"" + dir + "\"}}";
  webSocket.broadcastTXT(json);
  Serial.println("🌐 [WS Broadcast to Twin]: " + json);
}

// ==========================================
// SERVER ROUTING HANDLERS
// ==========================================
void handleRoot() {
  String html = String(htmlPage);
  html.replace("%driveSpeed%", String(driveSpeed));
  html.replace("%IP_ADDRESS%", WiFi.localIP().toString());
  
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "text/html", html);
}

void handleCmd() { 
  server.sendHeader("Access-Control-Allow-Origin", "*");
  if (server.hasArg("action")) {
    String action = server.arg("action");
    currentMode = 0;
    driveAction = 0; 
    
    if (action == "stop") { walkAction = 0; }
    else if (action == "forward") { walkAction = 1; walkCount = 0; }
    else if (action == "backward") { walkAction = 2; walkCount = 0; }
    else if (action == "left") { walkAction = 3; walkCount = 0; }
    else if (action == "right") { walkAction = 4; walkCount = 0; }
    
    broadcastTwinCommand("walk", action);
    server.send(200, "text/plain", "OK");
  } else {
    server.send(400, "text/plain", "Bad Request");
  }
}

void handleDrive() { 
  server.sendHeader("Access-Control-Allow-Origin", "*");
  if (server.hasArg("action")) {
    String action = server.arg("action");
    currentMode = 1;
    walkAction = 0; 
    
    if (action == "stop") { driveAction = 0; }
    else if (action == "forward") { driveAction = 1; }
    else if (action == "backward") { driveAction = 2; }
    else if (action == "left") { driveAction = 3; }
    else if (action == "right") { driveAction = 4; }
    
    broadcastTwinCommand("drive", action);
    server.send(200, "text/plain", "OK");
  } else {
    server.send(400, "text/plain", "Bad Request");
  }
}

void handleSpeed() { 
  server.sendHeader("Access-Control-Allow-Origin", "*");
  if (server.hasArg("val")) {
    driveSpeed = server.arg("val").toInt();
    prefs.putInt("d_spd", driveSpeed);
    server.send(200, "text/plain", "Speed Set");
  }
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_CONNECTED) {
    IPAddress ip = webSocket.remoteIP(num);
    Serial.printf("🟢 [Twin] Connected client #%u from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
  }
}

// ==========================================
// MAIN SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  
  // Ultrasonic Sensor Pin Setup
  pinMode(LEFT_TRIG, OUTPUT);
  pinMode(LEFT_ECHO, INPUT);
  pinMode(RIGHT_TRIG, OUTPUT);
  pinMode(RIGHT_ECHO, INPUT);
  digitalWrite(LEFT_TRIG, LOW);
  digitalWrite(RIGHT_TRIG, LOW);
  
  // Explicitly begin I2C just in case PCA requires strict GPIO
  Wire.begin(); 
  
  prefs.begin("minidog", false);
  driveSpeed = prefs.getInt("d_spd", 150);

  servo1Pos = fl_DOWN; servo2Pos = br_DOWN; servo3Pos = fr_DOWN; 
  servo4Pos = bl_DOWN; servo5Pos = 1500; servo6Pos = 1500;
  s1F = fl_DOWN; s2F = br_DOWN; s3F = fr_DOWN; 
  s4F = bl_DOWN; s5F = 1500; s6F = 1500;

  pwm.begin();
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(50);  
  delay(100);
  
  // Fix Wi-Fi configuration
  WiFi.mode(WIFI_STA);
  
  // Force reset DHCP first before applying static IP to prevent cache glitches
  WiFi.config(IPAddress(0,0,0,0), IPAddress(0,0,0,0), IPAddress(0,0,0,0));
  delay(100);
  
  if(useStaticIP) {
    // Only apply static IP if the boolean is true
    WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS);
    Serial.println("Using Static IP Configuration...");
  } else {
    // Let router assign an IP dynamically
    Serial.println("Using DHCP Configuration...");
  }
  
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi ");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\n✅ Connected to Wi-Fi!");
  Serial.print("🌐 Open this IP in your phone's browser: http://");
  Serial.println(WiFi.localIP());

  ArduinoOTA.setHostname("MiniDog-Controller");
  ArduinoOTA.begin();

  // Start HTTP Server
  server.on("/", handleRoot);
  server.on("/cmd", handleCmd);
  server.on("/drive", handleDrive);
  server.on("/setSpeed", handleSpeed);
  server.begin();

  // Start WebSocket Server on Port 81 for Digital Twin Sync
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("✅ WebSocket Server running on port 81");
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
    
  server.handleClient(); 
  webSocket.loop();
  ArduinoOTA.handle(); 
  currentMillis = millis();

  // 1. WALKING STEP SEQUENCER
  if (currentMillis - previousWalkMillis >= stepTime) {
    previousWalkMillis = currentMillis;

    if (walkAction == 0 && driveAction == 0) { // COMPLETE STOP
      servo1Pos = fl_DOWN; servo2Pos = br_DOWN;
      servo3Pos = fr_DOWN; servo4Pos = bl_DOWN;
      servo5Pos = 1500;    servo6Pos = 1500;
      walkCount = 0;
    }
    else if (walkAction == 1) { // FWD
      if (walkCount == 0) { servo1Pos = fl_UP; servo2Pos = br_UP; walkCount = 1; } 
      else if (walkCount == 1) { servo5Pos = slider_MAX; walkCount = 2; } 
      else if (walkCount == 2) { servo1Pos = fl_DOWN; servo2Pos = br_DOWN; walkCount = 3; } 
      else if (walkCount == 3) { servo3Pos = fr_UP; servo4Pos = bl_UP; walkCount = 4; } 
      else if (walkCount == 4) { servo5Pos = slider_MIN; walkCount = 5; } 
      else if (walkCount == 5) { servo3Pos = fr_DOWN; servo4Pos = bl_DOWN; walkCount = 6; } 
      else if (walkCount == 6) { walkCount = 0; }
    }
    else if (walkAction == 2) { // BCK
      if (walkCount == 0) { servo1Pos = fl_UP; servo2Pos = br_UP; walkCount = 1; } 
      else if (walkCount == 1) { servo5Pos = slider_MIN; walkCount = 2; } 
      else if (walkCount == 2) { servo1Pos = fl_DOWN; servo2Pos = br_DOWN; walkCount = 3; } 
      else if (walkCount == 3) { servo3Pos = fr_UP; servo4Pos = bl_UP; walkCount = 4; } 
      else if (walkCount == 4) { servo5Pos = slider_MAX; walkCount = 5; } 
      else if (walkCount == 5) { servo3Pos = fr_DOWN; servo4Pos = bl_DOWN; walkCount = 6; } 
      else if (walkCount == 6) { walkCount = 0; }
    }
    else if (walkAction == 3) { // LEFT TURN
      if (walkCount == 0) { servo1Pos = fl_UP; servo2Pos = br_UP; walkCount = 1; } 
      else if (walkCount == 1) { servo5Pos = 1500; servo6Pos = rot_TWIST; walkCount = 2; } 
      else if (walkCount == 2) { servo1Pos = fl_DOWN; servo2Pos = br_DOWN; walkCount = 3; } 
      else if (walkCount == 3) { servo3Pos = fr_UP; servo4Pos = bl_UP; walkCount = 4; } 
      else if (walkCount == 4) { servo6Pos = 1500; walkCount = 5; } 
      else if (walkCount == 5) { servo3Pos = fr_DOWN; servo4Pos = bl_DOWN; walkCount = 0; }
    }
    else if (walkAction == 4) { // RIGHT TURN
      if (walkCount == 0) { servo3Pos = fr_UP; servo4Pos = bl_UP; walkCount = 1; } 
      else if (walkCount == 1) { servo5Pos = 1500; servo6Pos = rot_TWIST; walkCount = 2; } 
      else if (walkCount == 2) { servo3Pos = fr_DOWN; servo4Pos = bl_DOWN; walkCount = 3; } 
      else if (walkCount == 3) { servo1Pos = fl_UP; servo2Pos = br_UP; walkCount = 4; } 
      else if (walkCount == 4) { servo6Pos = 1500; walkCount = 5; } 
      else if (walkCount == 5) { servo1Pos = fl_DOWN; servo2Pos = br_DOWN; walkCount = 0; }
    }
  }

  // 2. THE MOTION FILTER & WHEEL OUTPUT
  if (currentMillis - previousMillis >= 10) {
    previousMillis = currentMillis;

    s1F = filterMotion(servo1Pos, s1F, filterVal);
    s2F = filterMotion(servo2Pos, s2F, filterVal);
    s3F = filterMotion(servo3Pos, s3F, filterVal);
    s4F = filterMotion(servo4Pos, s4F, filterVal);
    s5F = filterMotion(servo5Pos, s5F, filterVal);
    s6F = filterMotion(servo6Pos, s6F, filterVal);

    int fl_w = 1500, br_w = 1500, fr_w = 1500, bl_w = 1500; // 1500 = Stop
    if (driveAction > 0) {
      walkAction = 0; 
      servo1Pos = fl_DOWN; servo2Pos = br_DOWN;
      servo3Pos = fr_DOWN; servo4Pos = bl_DOWN;
      servo5Pos = 1500;    servo6Pos = 1500;

      if (driveAction == 1) { // FWD
        fl_w = 1500 + driveSpeed; bl_w = 1500 + driveSpeed;
        fr_w = 1500 - driveSpeed; br_w = 1500 - driveSpeed;
      } else if (driveAction == 2) { // BCK
        fl_w = 1500 - driveSpeed; bl_w = 1500 - driveSpeed;
        fr_w = 1500 + driveSpeed; br_w = 1500 + driveSpeed;
      } else if (driveAction == 3) { // TURN LEFT
        fl_w = 1500 - driveSpeed; bl_w = 1500 - driveSpeed;
        fr_w = 1500 - driveSpeed; br_w = 1500 - driveSpeed;
      } else if (driveAction == 4) { // TURN RIGHT
        fl_w = 1500 + driveSpeed; bl_w = 1500 + driveSpeed;
        fr_w = 1500 + driveSpeed; br_w = 1500 + driveSpeed;
      }
    }

    writeMicrosecondsToPCA(0, s1F); 
    writeMicrosecondsToPCA(1, s2F); 
    writeMicrosecondsToPCA(2, s3F); 
    writeMicrosecondsToPCA(3, s4F); 
    writeMicrosecondsToPCA(4, s5F); 
    writeMicrosecondsToPCA(5, s6F + rot_OFFSET); 

    writeMicrosecondsToPCA(10, fl_w); 
    writeMicrosecondsToPCA(6,  fr_w); 
    writeMicrosecondsToPCA(8,  bl_w); 
    writeMicrosecondsToPCA(12, br_w); 
  }
  
  // 3. ULTRASONIC SENSOR TELEMETRY & WEBSOCKET BROADCAST
  if (currentMillis - lastUltrasonicRead >= 150) {
    lastUltrasonicRead = currentMillis;
    float lCm = readUltrasonicCm(LEFT_TRIG, LEFT_ECHO);
    delayMicroseconds(1000);
    float rCm = readUltrasonicCm(RIGHT_TRIG, RIGHT_ECHO);

    currentLeftDistM = (lCm > 0) ? (lCm / 100.0) : 0.0;
    currentRightDistM = (rCm > 0) ? (rCm / 100.0) : 0.0;

    String json = "{\"type\":\"ultrasonic\",\"ultrasonic\":{\"left\":" + String(currentLeftDistM, 3) + 
                   ",\"right\":" + String(currentRightDistM, 3) + "},\"left_cm\":" + String(lCm, 1) + 
                   ",\"right_cm\":" + String(rCm, 1) + "}";
    webSocket.broadcastTXT(json);
  }
  
  // Yield to allow ESP32 core networking tasks to process properly
  yield(); 
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
float filterMotion(float target, float current, int strength) {  
  return (target + (current * strength)) / (strength + 1);  
}

void writeMicrosecondsToPCA(uint8_t channel, float microSec) {
  int tick = (microSec * 4096) / 20000;
  pwm.setPWM(channel, 0, tick);
}