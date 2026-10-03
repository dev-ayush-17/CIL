// ============================================================================
// ESP32 HC-SR04 DUAL ULTRASONIC SENSOR WEBSOCKET & SERIAL STREAMER
// Provides distance telemetry to DigitalTwin 3D Visualization for Wall Building
// ============================================================================

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h> // Ensure ArduinoJson library is installed if using JSON object builder

// ==========================================
// WIFI CONFIGURATION
// ==========================================
const char* ssid     = "YOUR_WIFI_SSID";     // Change to your Wi-Fi SSID
const char* password = "YOUR_WIFI_PASSWORD"; // Change to your Wi-Fi Password

// Static IP setup (Optional - matches mobile.ino network)
bool useStaticIP = false; 
IPAddress local_IP(10, 232, 110, 101);
IPAddress gateway(10, 232, 110, 148);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(8, 8, 8, 8);

// WebSocket Server on Port 8766 (also compatible with port 81)
WebSocketsServer webSocket = WebSocketsServer(8766);

// ==========================================
// SENSOR PIN DEFINITIONS (HC-SR04)
// ==========================================
#define LEFT_TRIG  5
#define LEFT_ECHO  18

#define RIGHT_TRIG 19
#define RIGHT_ECHO 21

// Pulse timeout in microseconds (30ms timeout = max ~5 meters range)
#define PULSE_TIMEOUT 30000 

unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 100; // Sample and broadcast every 100ms

float leftDistCm = -1.0;
float rightDistCm = -1.0;
float leftDistM = 0.0;
float rightDistM = 0.0;

// ==========================================
// DISTANCE MEASUREMENT FUNCTION
// ==========================================
float measureDistanceCm(int trigPin, int echoPin) {
  // Clear TRIG
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);

  // Send 10 us pulse to TRIG
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  // Measure ECHO pulse length in microseconds
  long duration = pulseIn(echoPin, HIGH, PULSE_TIMEOUT);

  // If timeout (no echo received)
  if (duration == 0) {
    return -1.0;
  }

  // Calculate distance in cm (Speed of sound = 0.0343 cm/us)
  float distance = (duration * 0.0343) / 2.0;

  // Filter out noise / impossible values
  if (distance < 2.0 || distance > 400.0) {
    return -1.0;
  }

  return distance;
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  if (type == WStype_CONNECTED) {
    IPAddress ip = webSocket.remoteIP(num);
    Serial.printf("🟢 [Ultrasonic WS] Client #%u connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
  } else if (type == WStype_DISCONNECTED) {
    Serial.printf("🔴 [Ultrasonic WS] Client #%u disconnected\n", num);
  }
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n==============================================");
  Serial.println("  HC-SR04 Ultrasonic Telemetry Server Starting  ");
  Serial.println("==============================================");

  pinMode(LEFT_TRIG, OUTPUT);
  pinMode(LEFT_ECHO, INPUT);
  pinMode(RIGHT_TRIG, OUTPUT);
  pinMode(RIGHT_ECHO, INPUT);

  digitalWrite(LEFT_TRIG, LOW);
  digitalWrite(RIGHT_TRIG, LOW);

  WiFi.mode(WIFI_STA);

  if (useStaticIP) {
    WiFi.config(local_IP, gateway, subnet, primaryDNS);
    Serial.println("Using Static IP Configuration...");
  }

  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi: ");
  Serial.print(ssid);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n✅ Wi-Fi Connected!");
  Serial.print("🌐 ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // Start WebSocket Server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("✅ WebSocket Server running on port 8766");
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  webSocket.loop();

  unsigned long currentMillis = millis();
  if (currentMillis - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = currentMillis;

    // Measure Left Sensor
    leftDistCm = measureDistanceCm(LEFT_TRIG, LEFT_ECHO);

    // Small delay between sensors to avoid ultrasonic crosstalk / interference
    delayMicroseconds(2000);

    // Measure Right Sensor
    rightDistCm = measureDistanceCm(RIGHT_TRIG, RIGHT_ECHO);

    // Convert to meters
    leftDistM  = (leftDistCm > 0) ? (leftDistCm / 100.0) : 0.0;
    rightDistM = (rightDistCm > 0) ? (rightDistCm / 100.0) : 0.0;

    // Print to Serial Monitor
    Serial.print("Left: ");
    if (leftDistCm > 0) { Serial.print(leftDistCm, 1); Serial.print(" cm ("); Serial.print(leftDistM, 2); Serial.print("m)"); }
    else { Serial.print("OUT OF RANGE"); }

    Serial.print(" | Right: ");
    if (rightDistCm > 0) { Serial.print(rightDistCm, 1); Serial.print(" cm ("); Serial.print(rightDistM, 2); Serial.print("m)"); }
    else { Serial.print("OUT OF RANGE"); }
    Serial.println();

    // Broadcast JSON payload via WebSocket to Digital Twin
    // Format provides both meters and cm for maximum dashboard compatibility
    String jsonPayload = "{\"type\":\"ultrasonic\",\"ultrasonic\":{\"left\":" + String(leftDistM, 3) + 
                         ",\"right\":" + String(rightDistM, 3) + "},\"left_cm\":" + String(leftDistCm, 1) + 
                         ",\"right_cm\":" + String(rightDistCm, 1) + "}";
    
    webSocket.broadcastTXT(jsonPayload);
  }
}