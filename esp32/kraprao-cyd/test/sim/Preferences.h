#pragma once
#include "Arduino.h"
// In-memory stand-in for the ESP32 Preferences (NVS) API
struct Preferences {
  bool begin(const char *, bool = false) { return true; }
  void end() {}
  String getString(const char *, const String &def = "") { return def; }
  size_t putString(const char *, const String &v) { return v.length(); }
};
