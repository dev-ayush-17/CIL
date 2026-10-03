/**
 * ESP32 STEP 1: Simple WiFi IP Address Checker
 * Upload this sketch to your ESP32 to get its assigned IP address.
 */

#include <WiFi.h>

// WiFi Credentials (update ssid & password as needed)
const char* ssid = "moto g64 5G_3117";
const char* password = "uvsingh987";

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n=======================================================");
  Serial.println("  ESP32 STEP 1 — SIMPLE WIFI IP ADDRESS CHECKER");
  Serial.println("=======================================================");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.printf("[WiFi] Connecting to %s", ssid);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n=======================================================");
  Serial.println("  [SUCCESS] Connected to WiFi!");
  Serial.print("  [ESP32 IP ADDRESS] : ");
  Serial.println(WiFi.localIP());
  Serial.println("=======================================================");
}

void loop() {
  delay(5000);
  Serial.print("[WiFi Alive] ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}
