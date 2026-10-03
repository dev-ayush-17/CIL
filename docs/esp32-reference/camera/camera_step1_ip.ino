/**
 * ESP32-S CAM STEP 1: Wi-Fi IP Retriever Sketch
 * Board Selection in Arduino IDE: "AI Thinker ESP32-CAM" or "ESP32 Wrover Module"
 * Hardware: ESP32-S Camera Module (OV2640 Sensor)
 * Purpose: Connects to Wi-Fi and prints assigned IP Address to Serial Monitor
 */

#include <WiFi.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// Onboard Status LED (GPIO 33 on ESP32-S CAM, Active LOW)
#define LED_BUILTIN_RED 33

// Wi-Fi Credentials
const char* ssid = "Phone 3";         // e.g. "moto g64 5G_3117" or "Phone 3"
const char* password = "uvsingh987";  // Wi-Fi Password

void setup() {
  // Disable brownout detector to prevent ESP32-S power resets on Wi-Fi connect
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(1000);

  pinMode(LED_BUILTIN_RED, OUTPUT);
  digitalWrite(LED_BUILTIN_RED, HIGH); // Off by default (Active LOW)

  Serial.println("\n=======================================================");
  Serial.println("  ESP32-S CAMERA MODULE (STEP 1: WI-FI IP RETRIEVER)");
  Serial.println("=======================================================");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  WiFi.setSleep(false);

  Serial.printf("[Wi-Fi] Connecting ESP32-S CAM to '%s'...", ssid);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    digitalWrite(LED_BUILTIN_RED, !digitalRead(LED_BUILTIN_RED)); // Blink red LED
    Serial.print(".");
    attempts++;
    if (attempts > 40) {
      Serial.println("\n[Wi-Fi] Retrying Wi-Fi connection...");
      WiFi.begin(ssid, password);
      attempts = 0;
    }
  }

  digitalWrite(LED_BUILTIN_RED, LOW); // Turn RED LED ON solid when connected

  Serial.println("\n\n=======================================================");
  Serial.println("  [SUCCESS] ESP32-S CAM CONNECTED TO WI-FI!");
  Serial.print("  [ASSIGNED IP ADDRESS]: http://");
  Serial.println(WiFi.localIP());
  Serial.println("=======================================================\n");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[ESP32-S CAM] Online | IP: %s | Signal (RSSI): %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("[ESP32-S CAM] Wi-Fi Disconnected!");
    digitalWrite(LED_BUILTIN_RED, HIGH); // Off
  }
  delay(3000);
}
