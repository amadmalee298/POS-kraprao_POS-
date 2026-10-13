// Thai PromptPay QR payload (EMVCo), the same as generatePromptPayPayload() in src/utils/promptpay.ts
#include "app.h"

static String crc16(const String &data) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < data.length(); i++) {
    uint8_t x = ((crc >> 8) ^ uint8_t(data[i])) & 0xFF;
    x ^= x >> 4;
    crc = (crc << 8) ^ (uint16_t(x) << 12) ^ (uint16_t(x) << 5) ^ x;
  }
  char out[5];
  snprintf(out, sizeof(out), "%04X", crc);
  return out;
}

static String len2(size_t n) {
  char out[3];
  snprintf(out, sizeof(out), "%02u", unsigned(n));
  return out;
}

// Empty when the id is not a 10-digit mobile number, 13-digit tax id or 15-digit e-wallet id
String promptPayPayload(const String &id, float amount) {
  String digits;
  for (size_t i = 0; i < id.length(); i++)
    if (isdigit(uint8_t(id[i]))) digits += id[i];
  // Demo placeholders would send money to a stranger
  if (digits == "0812345678" || digits == "0000000000") return "";

  String tag, target;
  if (digits.length() == 10 && digits[0] == '0') {
    tag = "01";
    target = "0066" + digits.substring(1);
  } else if (digits.length() == 13) {
    tag = "02";
    target = digits;
  } else if (digits.length() == 15) {
    tag = "03";
    target = digits;
  } else {
    return "";
  }

  const String sub = "0016A000000677010111" + tag + len2(target.length()) + target;
  // Point of initiation: 12 = with amount, 11 = static
  String payload = String("00020101") + "02" + (amount > 0 ? "12" : "11") + "29" + len2(sub.length()) + sub + "5802TH5303764";
  if (amount > 0) {
    char amt[16];
    snprintf(amt, sizeof(amt), "%.2f", round(double(amount) * 100.0) / 100.0);
    payload += "54" + len2(strlen(amt)) + amt;
  }
  payload += "6304";
  return payload + crc16(payload);
}
