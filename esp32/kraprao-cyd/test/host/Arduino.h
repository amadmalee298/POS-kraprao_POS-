// Minimal stand-in for the Arduino core so documents.cpp (and ArduinoJson's String support) and
// the UI (test/sim) compile on a computer. Only what the terminal's code uses.
#pragma once
#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <type_traits>

class String : public std::string {
 public:
  String() {}
  String(const char *s) : std::string(s ? s : "") {}
  String(const std::string &s) : std::string(s) {}
  template <typename T, typename = typename std::enable_if<std::is_integral<T>::value>::type>
  explicit String(T v) : std::string(std::to_string(v)) {}
  String &operator=(const char *s) {
    assign(s ? s : "");
    return *this;
  }
  bool concat(const char *s) {
    append(s);
    return true;
  }
  bool isEmpty() const { return empty(); }
  String substring(size_t from) const { return String(substr(from)); }
  void remove(size_t from) { erase(from); }
  void toLowerCase() { std::transform(begin(), end(), begin(), ::tolower); }
};

inline String operator+(const String &a, const String &b) {
  return String(static_cast<const std::string &>(a) + static_cast<const std::string &>(b));
}
inline String operator+(const String &a, const char *b) { return String(static_cast<const std::string &>(a) + b); }
inline String operator+(const char *a, const String &b) { return String(a + static_cast<const std::string &>(b)); }
template <typename T, typename = typename std::enable_if<std::is_arithmetic<T>::value>::type>
inline String operator+(const String &a, T v) {
  return a + String(std::to_string(v));
}

#define constrain(x, lo, hi) ((x) < (lo) ? (lo) : ((x) > (hi) ? (hi) : (x)))
uint32_t millis();
struct EspClass {
  uint32_t getFreeHeap() { return 123 * 1024; }
  void restart() {}
};
extern EspClass ESP;
