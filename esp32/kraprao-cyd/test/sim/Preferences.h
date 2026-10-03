#pragma once
#include "Arduino.h"
// In-memory stand-in for the ESP32 Preferences (NVS) API
extern int simDeviceMode;  // sim.cpp: 0 = order terminal, 1 = payment display
struct Preferences {
  uint8_t getUChar(const char *key, uint8_t def = 0) { return strcmp(key, "mode") == 0 ? simDeviceMode : def; }
  size_t putUChar(const char *, uint8_t v) { return 1; }
  bool begin(const char *, bool = false) { return true; }
  void end() {}
  String getString(const char *, const String &def = "") { return def; }
  size_t putString(const char *, const String &v) { return v.length(); }
};
