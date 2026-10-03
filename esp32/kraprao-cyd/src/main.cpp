// ครัวกะเพรา POS — order terminal for the ESP32-2432S028R ("Cheap Yellow Display")
//
// A 2.8" touch screen that takes orders into the shop's existing POS (same Firebase project):
// it shows the published menu, builds the order, sends it as a QR order that the POS / KDS
// approves, and follows its status until it is ready.
#include <Arduino.h>
#include <lvgl.h>

#include "app.h"

// On-board RGB LED (active low) and speaker connector
static constexpr int PIN_LED_R = 4;
static constexpr int PIN_LED_G = 16;
static constexpr int PIN_LED_B = 17;
static constexpr int PIN_SPEAKER = 26;

static constexpr uint32_t DIM_AFTER_MS = 2 * 60 * 1000;

void setLed(bool r, bool g, bool b) {
  digitalWrite(PIN_LED_R, r ? LOW : HIGH);
  digitalWrite(PIN_LED_G, g ? LOW : HIGH);
  digitalWrite(PIN_LED_B, b ? LOW : HIGH);
}

// Non-blocking beeps: queued here and played from loop()
static int beepsLeft = 0;
static uint32_t nextBeepAt = 0;

void beep(int times) { beepsLeft = max(beepsLeft, times * 2); }

static void serviceBeeper() {
  if (!beepsLeft || millis() < nextBeepAt) return;
  if (beepsLeft % 2 == 0) tone(PIN_SPEAKER, 2400, 120);
  beepsLeft--;
  nextBeepAt = millis() + 150;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  setLed(false, false, false);

  displayBegin();
  uiBegin();
  cloudBegin();
}

void loop() {
  NetEvent ev;
  while (cloudPoll(ev)) uiHandleEvent(ev);

  // Dim the backlight when nobody touches the screen; the first touch brings it back
  static bool dimmed = false;
  const bool idle = lv_display_get_inactive_time(nullptr) > DIM_AFTER_MS;
  if (idle != dimmed) {
    dimmed = idle;
    displaySetBacklight(idle ? 30 : 200);
  }

  serviceBeeper();
  lv_timer_handler();
  delay(5);
}
