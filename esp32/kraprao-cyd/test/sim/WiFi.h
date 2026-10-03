#pragma once
#include "Arduino.h"
struct IPAddressSim {
  String toString() const { return "192.168.1.50"; }
};
struct WiFiSim {
  IPAddressSim localIP() { return {}; }
  int RSSI() { return -58; }
};
extern WiFiSim WiFi;
