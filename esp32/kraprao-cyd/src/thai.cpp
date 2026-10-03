// Thai text for LVGL, which draws marks without OpenType positioning (see tools/make_fonts.py):
//  - a tone mark after an upper vowel (ั ิ ี ึ ื ็ ํ) uses its raised copy at U+F70A..U+F70E
//  - "tone + ำ" becomes "ํ + raised tone + า", so น้ำ keeps the tone above the circle
// Only for display: names sent to the POS stay unchanged.
#include "app.h"

static bool isUpperVowel(uint32_t c) {
  return c == 0x0E31 || (c >= 0x0E34 && c <= 0x0E37) || c == 0x0E47 || c == 0x0E4D;
}

static bool isTone(uint32_t c) { return c >= 0x0E48 && c <= 0x0E4C; }

static void put(String &out, uint32_t c) {
  char b[4] = {0, 0, 0, 0};
  if (c < 0x80) {
    b[0] = char(c);
  } else if (c < 0x800) {
    b[0] = char(0xC0 | (c >> 6));
    b[1] = char(0x80 | (c & 0x3F));
  } else {
    b[0] = char(0xE0 | (c >> 12));
    b[1] = char(0x80 | ((c >> 6) & 0x3F));
    b[2] = char(0x80 | (c & 0x3F));
  }
  out += b;
}

// Next code point of UTF-8 text at i (advances i); malformed bytes pass through one by one
static uint32_t next(const String &s, size_t &i) {
  const uint8_t c = s[i];
  if (c >= 0xE0 && c < 0xF0 && i + 2 < s.length()) {
    const uint32_t cp = ((c & 0x0F) << 12) | ((uint8_t(s[i + 1]) & 0x3F) << 6) | (uint8_t(s[i + 2]) & 0x3F);
    i += 3;
    return cp;
  }
  if (c >= 0xC0 && c < 0xE0 && i + 1 < s.length()) {
    const uint32_t cp = ((c & 0x1F) << 6) | (uint8_t(s[i + 1]) & 0x3F);
    i += 2;
    return cp;
  }
  i++;
  return c;
}

String thaiDisplay(const String &text) {
  bool hasThai = false;
  for (size_t i = 0; i < text.length() && !hasThai; i++) hasThai = uint8_t(text[i]) == 0xE0;
  if (!hasThai) return text;

  String out;
  out.reserve(text.length() + 8);
  uint32_t prev = 0;
  size_t i = 0;
  while (i < text.length()) {
    const uint32_t c = next(text, i);
    if (isTone(c)) {
      size_t j = i;
      const uint32_t after = j < text.length() ? next(text, j) : 0;
      if (after == 0x0E33) {  // tone + sara am
        put(out, 0x0E4D);
        put(out, 0xF70A + (c - 0x0E48));
        put(out, 0x0E32);
        i = j;
        prev = 0x0E32;
        continue;
      }
      put(out, isUpperVowel(prev) ? 0xF70A + (c - 0x0E48) : c);
    } else {
      put(out, c);
    }
    prev = c;
  }
  return out;
}
