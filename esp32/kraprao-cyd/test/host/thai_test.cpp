// thaiDisplay(): raised tone marks after upper vowels, split ำ after a tone mark
#include <iostream>

#include "app.h"

static std::string u(std::initializer_list<uint32_t> cps) {
  std::string s;
  for (uint32_t c : cps) {
    if (c < 0x80) s += char(c);
    else if (c < 0x800) { s += char(0xC0 | (c >> 6)); s += char(0x80 | (c & 0x3F)); }
    else { s += char(0xE0 | (c >> 12)); s += char(0x80 | ((c >> 6) & 0x3F)); s += char(0x80 | (c & 0x3F)); }
  }
  return s;
}

int main() {
  int failed = 0;
  auto expect = [&](const char *name, const String &in, const std::string &want) {
    const bool ok = std::string(thaiDisplay(in)) == want;
    std::cout << (ok ? "✓ " : "✗ ") << name << "\n";
    failed += !ok;
  };
  expect("เพิ่ม: tone over sara i is raised", "เพิ่ม", u({0x0E40, 0x0E1E, 0x0E34, 0xF70A, 0x0E21}));
  expect("สั่ง: tone over mai han-akat is raised", "สั่ง", u({0x0E2A, 0x0E31, 0xF70A, 0x0E07}));
  expect("น้ำ: tone + sara am split", "น้ำ", u({0x0E19, 0x0E4D, 0xF70B, 0x0E32}));
  expect("ทั้งหมด", "ทั้งหมด", u({0x0E17, 0x0E31, 0xF70B, 0x0E07, 0x0E2B, 0x0E21, 0x0E14}));
  expect("ส่ง: tone on a consonant stays", "ส่ง", "ส่ง");
  expect("กุ้ง: tone after a lower vowel stays", "กุ้ง", "กุ้ง");
  expect("ทำ: sara am without tone stays", "ทำ", "ทำ");
  expect("ASCII and ฿ unchanged", "#Q5-AB12 ฿160.50", "#Q5-AB12 ฿160.50");
  return failed ? 1 : 0;
}
