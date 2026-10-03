// Screenshot simulator: runs the terminal's real UI code (src/ui.cpp + LVGL + Thai fonts) on a
// computer, taps through an order, and saves each 240x320 screen as a PPM image.
//   sim order <public_menu.json> <out-dir>     ordering terminal
//   sim pay <snapshot-dir> <out-dir>           payment display (pay-*.json from test/host/run.sh)
// The network task is replaced by events this file sends, as cloud.cpp would.
#include <lvgl.h>

#include <chrono>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>

#include "WiFi.h"
#include "app.h"
#include "documents.h"

// --- stand-ins for the hardware and the network task ---------------------------------
static uint32_t fakeMs = 0;
uint32_t millis() { return fakeMs; }
EspClass ESP;
WiFiSim WiFi;
void beep(int) {}
void setLed(bool, bool, bool) {}
void displayCalibrate() {}
void displaySetBacklight(uint8_t) {}
void cloudRequestMenu() {}
void cloudResetIdentity() {}
static OrderDraft *submitted = nullptr;
void cloudSubmitOrder(OrderDraft *d) { submitted = d; }
String newOrderId() { return "ord-1790000000000-k7xm2a"; }
String newOrderNumber(const String &table) { return "#Q" + table + "-K7XM"; }
int simDeviceMode = 0;
static uint64_t epochAtStart = 0;
uint64_t epochMs() { return epochAtStart + fakeMs; }

static std::string readFile(const std::string &path) {
  std::ifstream in(path);
  std::stringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

// --- display / touch ---------------------------------------------------------------------
static uint16_t fb[240 * 320];
static uint8_t buf[240 * 40 * 2];
static bool pressed = false;
static lv_point_t point;

static void flush(lv_display_t *d, const lv_area_t *a, uint8_t *px) {
  const uint16_t *src = reinterpret_cast<uint16_t *>(px);
  for (int y = a->y1; y <= a->y2; y++)
    for (int x = a->x1; x <= a->x2; x++) fb[y * 240 + x] = *src++;
  lv_display_flush_ready(d);
}

static void readTouch(lv_indev_t *, lv_indev_data_t *data) {
  data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
  data->point = point;
}

static void run(uint32_t ms) {
  for (uint32_t t = 0; t < ms; t += 5) {
    fakeMs += 5;
    lv_timer_handler();
  }
}

static std::string outDir;
static void shot(const char *name) {
  run(400);
  lv_refr_now(nullptr);
  std::ofstream f(outDir + "/" + name + ".ppm", std::ios::binary);
  f << "P6\n240 320\n255\n";
  for (uint16_t c : fb) {
    const uint8_t rgb[3] = {uint8_t(((c >> 11) & 0x1f) * 255 / 31), uint8_t(((c >> 5) & 0x3f) * 255 / 63),
                            uint8_t((c & 0x1f) * 255 / 31)};
    f.write(reinterpret_cast<const char *>(rgb), 3);
  }
  std::cout << "saved " << name << "\n";
}

static void tapAt(int x, int y, uint32_t hold = 80) {
  point.x = x;
  point.y = y;
  pressed = true;
  run(hold);
  pressed = false;
  run(150);
}

// Center of the first visible label whose text contains `text`
static lv_obj_t *findLabel(lv_obj_t *obj, const char *text) {
  if (lv_obj_check_type(obj, &lv_label_class) && strstr(lv_label_get_text(obj), text)) return obj;
  if (lv_obj_check_type(obj, &lv_checkbox_class) && strstr(lv_checkbox_get_text(obj), text)) return obj;
  for (uint32_t i = 0; i < lv_obj_get_child_count(obj); i++)
    if (lv_obj_t *hit = findLabel(lv_obj_get_child(obj, i), text)) return hit;
  return nullptr;
}

static void tap(const char *raw, uint32_t hold = 80) {
  lv_refr_now(nullptr);
  const String shaped = thaiDisplay(raw);  // labels hold the text as drawn
  const char *text = shaped.c_str();
  lv_obj_t *l = findLabel(lv_layer_top(), text);
  if (!l) l = findLabel(lv_screen_active(), text);
  if (!l) {
    std::cerr << "no label: " << raw << "\n";
    exit(1);
  }
  lv_obj_scroll_to_view_recursive(l, LV_ANIM_OFF);
  lv_refr_now(nullptr);
  lv_area_t a;
  lv_obj_get_coords(l, &a);
  tapAt((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2, hold);
}

// Keypad: 3 columns x 4 rows (ui.cpp KEYPAD_MAP)
static void tapKey(const char *key) {
  static const char *keys[] = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"};
  lv_obj_t *scr = lv_screen_active();
  lv_obj_t *m = nullptr;
  for (uint32_t i = 0; i < lv_obj_get_child_count(scr); i++)
    if (lv_obj_check_type(lv_obj_get_child(scr, i), &lv_buttonmatrix_class)) m = lv_obj_get_child(scr, i);
  int idx = 0;
  while (strcmp(keys[idx], key) != 0) idx++;
  lv_area_t a;
  lv_obj_get_coords(m, &a);
  const int w = lv_area_get_width(&a), h = lv_area_get_height(&a);
  tapAt(a.x1 + w * (2 * (idx % 3) + 1) / 6, a.y1 + h * (2 * (idx / 3) + 1) / 8);
}

static NetEvent event(EventType type) {
  NetEvent ev{};
  ev.type = type;
  ev.ok = true;
  return ev;
}

static int payScenario(const std::string &dir);

int main(int argc, char **argv) {
  if (argc < 4) return 2;
  const std::string mode = argv[1];
  outDir = argv[3];
  epochAtStart = std::chrono::duration_cast<std::chrono::milliseconds>(
                     std::chrono::system_clock::now().time_since_epoch()).count();
  simDeviceMode = mode == "pay" ? 1 : 0;

  lv_init();
  lv_tick_set_cb([]() -> uint32_t { return fakeMs; });
  lv_display_t *disp = lv_display_create(240, 320);
  lv_display_set_flush_cb(disp, flush);
  lv_display_set_buffers(disp, buf, nullptr, sizeof(buf), LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_indev_t *indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, readTouch);

  // Menu from the emulator run (test/host/run.sh)
  if (mode == "pay") return payScenario(argv[2]);
  const std::string json = readFile(argv[2]);
  JsonDocument filter;
  buildMenuFilter(filter);
  JsonDocument doc;
  deserializeJson(doc, json.c_str(), DeserializationOption::Filter(filter), DeserializationOption::NestingLimit(24));

  uiBegin();
  shot("01-loading");

  NetEvent net = event(EV_NET_STATE);
  strcpy(net.msg, "Wi-Fi 192.168.1.50");
  uiHandleEvent(net);
  NetEvent menu = event(EV_MENU_LOADED);
  menu.menu = parseMenu(doc["fields"].as<JsonObjectConst>());
  uiHandleEvent(menu);
  shot("02-menu");

  tap("กะเพราหมูสับโบราณ");
  shot("03-dish");
  tap("ไข่ดาว");
  tap(LV_SYMBOL_PLUS);
  shot("04-dish-options");
  tap("เพิ่ม 2");
  run(300);
  shot("05-menu-cart");

  tap("ตะกร้า");
  tap("พร้อมเพย์");
  shot("06-cart");
  tap("ส่งออเดอร์");
  shot("07-sending");

  NetEvent sent = event(EV_ORDER_SENT);
  strcpy(sent.id, submitted->id.c_str());
  strcpy(sent.number, submitted->orderNumber.c_str());
  uiHandleEvent(sent);
  shot("08-order-promptpay");

  NetEvent ready = event(EV_ORDER_STATUS);
  strcpy(ready.id, submitted->id.c_str());
  strcpy(ready.status, "ready");
  uiHandleEvent(ready);
  shot("09-ready");

  run(7000);  // toast gone
  tap("สั่งเพิ่ม");
  tap("สาขา", 1200);  // long-press the shop name
  for (const char *k : {"1", "2", "3", "4"}) tapKey(k);
  shot("10-pin");
  tapKey("ok");
  shot("11-settings");
  return 0;
}

// Payment display: idle -> PromptPay QR -> gateway bitmap QR -> paid -> back to idle by itself
static NetEvent payEvent(const std::string &file) {
  JsonDocument raw;
  deserializeJson(raw, readFile(file).c_str());
  NetEvent ev = event(EV_PAYMENT);
  ev.payment = parsePaymentDisplay(raw["fields"].as<JsonObjectConst>());
  return ev;
}

static int payScenario(const std::string &dir) {
  // Run the clock from when the snapshots were written (a waiting QR lasts 10 minutes)
  NetEvent first = payEvent(dir + "/pay-waiting.json");
  epochAtStart = first.payment->expiresAt - 10 * 60 * 1000 + 1000 - fakeMs;
  delete first.payment;
  uiBegin();
  NetEvent net = event(EV_NET_STATE);
  strcpy(net.msg, "Wi-Fi 192.168.1.51");
  uiHandleEvent(net);
  shot("20-pay-idle");
  uiHandleEvent(payEvent(dir + "/pay-waiting.json"));
  shot("21-pay-promptpay");
  uiHandleEvent(payEvent(dir + "/pay-bitmap.json"));
  shot("22-pay-gateway");
  uiHandleEvent(payEvent(dir + "/pay-paid.json"));
  shot("23-pay-paid");
  run(9000);  // the "paid" screen expires
  shot("24-pay-back-to-idle");
  return 0;
}
