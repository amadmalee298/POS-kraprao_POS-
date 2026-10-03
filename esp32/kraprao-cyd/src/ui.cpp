// LVGL screens for the 240x320 portrait order terminal.
//
//   Menu ──tap dish──▶ Options (spice / protein / toppings / qty) ──▶ back to Menu
//     │
//     └─cart bar──▶ Cart (qty, dine-in/takeaway, pay at counter / PromptPay) ──send──▶ Orders
//   Orders: live status of this terminal's orders (+ PromptPay QR with the amount)
//   Long-press the shop name ──PIN──▶ Settings (table, reload menu, touch calibration, …)
//
// Pages are rebuilt on every visit (lv_obj_clean) so only one page lives in RAM at a time.
#include <Preferences.h>
#include <WiFi.h>
#include <lvgl.h>

#include "app.h"

#ifndef LOCK_TABLE
#define LOCK_TABLE 1
#endif

namespace {

// Colours of the web POS (dark kitchen theme)
constexpr uint32_t C_BG = 0x0d0704;
constexpr uint32_t C_CARD = 0x1d130c;
constexpr uint32_t C_BORDER = 0x3a2517;
constexpr uint32_t C_ACCENT = 0xff6a13;
constexpr uint32_t C_TEXT = 0xf6efe7;
constexpr uint32_t C_MUTED = 0xb3a393;
constexpr uint32_t C_GREEN = 0x22c55e;
constexpr uint32_t C_RED = 0xef4444;
constexpr uint32_t C_AMBER = 0xf59e0b;

constexpr int MAX_ITEMS_PER_ORDER = 40;     // same limits as the QR page
constexpr float MAX_ORDER_TOTAL = 50000;    // firestore.rules refuse bigger QR orders
constexpr uint32_t ORDER_COOLDOWN_MS = 30000;
constexpr size_t MAX_ORDERS_SHOWN = 6;

enum Page { P_LOADING, P_MENU, P_ITEM, P_CART, P_ORDERS, P_KEYPAD, P_SETTINGS };
enum KeypadMode { KP_PIN_SETTINGS, KP_PIN_TABLE, KP_TABLE };

// --- state ------------------------------------------------------------------
Menu *menu = nullptr;
Menu *pendingMenu = nullptr;  // arrived while a dish was open; applied on the next menu visit
std::vector<CartLine> cart;
std::vector<TrackedOrder> orders;
String table;
String orderType = "dine-in";
String payment = "cash";
String category = "all";
bool online = false;
String netText = "กำลังเชื่อม Wi-Fi…";
String menuError;
Page page = P_LOADING;

// Order being sent: the same id is reused on retry so Firestore never gets it twice
String pendingId;
String pendingNumber;
bool submitting = false;
float submittingTotal = 0;
String submittingPayment;
uint32_t lastOrderAt = 0;

// Dish being configured
struct Draft {
  int itemIndex = -1;
  int qty = 1;
  int spice = 0;
  int protein = 0;
  std::vector<int> addOnIdx;  // indexes into menu->addOns allowed for this dish
  std::vector<bool> addOnOn;
} draft;

KeypadMode keypadMode;
String keypadValue;
lv_obj_t *keypadLabel = nullptr;
lv_obj_t *itemAddButton = nullptr;
lv_obj_t *menuList = nullptr;
lv_obj_t *categoryBar = nullptr;
lv_obj_t *wifiIcon = nullptr;
lv_obj_t *overlay = nullptr;
lv_timer_t *ledTimer = nullptr;

// --- helpers ----------------------------------------------------------------
String baht(float v) {
  char b[24];
  if (fabsf(v - roundf(v)) < 0.005f)
    snprintf(b, sizeof(b), "฿%.0f", v);
  else
    snprintf(b, sizeof(b), "฿%.2f", v);
  return b;
}

lv_color_t hex(uint32_t c) { return lv_color_hex(c); }

void clearMenuDependents() {
  menuList = nullptr;
  categoryBar = nullptr;
  itemAddButton = nullptr;
  keypadLabel = nullptr;
  wifiIcon = nullptr;
}

lv_obj_t *newPage(Page p) {
  page = p;
  lv_obj_t *scr = lv_screen_active();
  lv_obj_clean(scr);
  clearMenuDependents();
  lv_obj_set_style_bg_color(scr, hex(C_BG), 0);
  lv_obj_set_style_text_color(scr, hex(C_TEXT), 0);
  lv_obj_set_flex_flow(scr, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_all(scr, 0, 0);
  lv_obj_set_style_pad_row(scr, 0, 0);
  lv_obj_remove_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
  return scr;
}

lv_obj_t *plain(lv_obj_t *parent) {
  lv_obj_t *o = lv_obj_create(parent);
  lv_obj_remove_style_all(o);
  lv_obj_set_size(o, LV_PCT(100), LV_SIZE_CONTENT);
  return o;
}

lv_obj_t *row(lv_obj_t *parent, int gap = 6) {
  lv_obj_t *o = plain(parent);
  lv_obj_set_flex_flow(o, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(o, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(o, gap, 0);
  return o;
}

lv_obj_t *label(lv_obj_t *parent, const String &text, uint32_t color = C_TEXT, const lv_font_t *font = nullptr) {
  lv_obj_t *l = lv_label_create(parent);
  lv_label_set_text(l, thaiDisplay(text).c_str());
  lv_obj_set_style_text_color(l, hex(color), 0);
  if (font) lv_obj_set_style_text_font(l, font, 0);
  return l;
}

// Label that wraps inside its parent's width
lv_obj_t *para(lv_obj_t *parent, const String &text, uint32_t color = C_TEXT, const lv_font_t *font = nullptr) {
  lv_obj_t *l = label(parent, text, color, font);
  lv_label_set_long_mode(l, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(l, LV_PCT(100));
  return l;
}

lv_obj_t *button(lv_obj_t *parent, const String &text, uint32_t bg, lv_event_cb_t cb, void *data = nullptr,
                 uint32_t fg = C_TEXT) {
  lv_obj_t *b = lv_button_create(parent);
  lv_obj_set_style_bg_color(b, hex(bg), 0);
  lv_obj_set_style_radius(b, 10, 0);
  lv_obj_set_style_shadow_width(b, 0, 0);
  lv_obj_set_style_pad_hor(b, 10, 0);
  lv_obj_set_style_pad_ver(b, 6, 0);
  lv_obj_t *l = lv_label_create(b);
  lv_label_set_text(l, thaiDisplay(text).c_str());
  lv_obj_set_style_text_color(l, hex(fg), 0);
  lv_obj_center(l);
  if (cb) lv_obj_add_event_cb(b, cb, LV_EVENT_CLICKED, data);
  return b;
}

lv_obj_t *card(lv_obj_t *parent) {
  lv_obj_t *c = plain(parent);
  lv_obj_set_style_bg_color(c, hex(C_CARD), 0);
  lv_obj_set_style_bg_opa(c, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(c, hex(C_BORDER), 0);
  lv_obj_set_style_border_width(c, 1, 0);
  lv_obj_set_style_radius(c, 10, 0);
  lv_obj_set_style_pad_all(c, 8, 0);
  return c;
}

// Scrolling middle part of a page
lv_obj_t *body(lv_obj_t *scr) {
  lv_obj_t *b = plain(scr);
  lv_obj_set_flex_grow(b, 1);
  lv_obj_set_flex_flow(b, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_all(b, 6, 0);
  lv_obj_set_style_pad_row(b, 6, 0);
  lv_obj_set_scroll_dir(b, LV_DIR_VER);
  return b;
}

lv_obj_t *footer(lv_obj_t *scr) {
  lv_obj_t *f = row(scr, 6);
  lv_obj_set_style_pad_all(f, 6, 0);
  lv_obj_set_style_bg_color(f, hex(C_CARD), 0);
  lv_obj_set_style_bg_opa(f, LV_OPA_COVER, 0);
  return f;
}

int cartCount() {
  int n = 0;
  for (const auto &c : cart) n += c.qty;
  return n;
}

float cartSubtotal() {
  float s = 0;
  for (const auto &c : cart) s += c.lineTotal();
  return s;
}

int activeOrders() {
  int n = 0;
  for (const auto &o : orders)
    if (o.status != "served" && o.status != "cancelled") n++;
  return n;
}

String statusText(const String &s) {
  if (s == "pending-qr") return "รอร้านยืนยัน";
  if (s == "pending") return "ร้านรับออเดอร์แล้ว";
  if (s == "cooking") return "กำลังทำอาหาร";
  if (s == "ready") return "พร้อมเสิร์ฟ!";
  if (s == "served") return "เสิร์ฟแล้ว";
  if (s == "cancelled") return "ยกเลิก";
  return s;
}

uint32_t statusColor(const String &s) {
  if (s == "ready" || s == "served") return C_GREEN;
  if (s == "cancelled") return C_RED;
  if (s == "cooking" || s == "pending") return C_AMBER;
  return C_MUTED;
}

void saveTable() {
  Preferences prefs;
  prefs.begin("pos", false);
  prefs.putString("table", table);
  prefs.end();
}

void toast(const String &text, uint32_t color = C_ACCENT, uint32_t ms = 3000) {
  lv_obj_t *t = lv_label_create(lv_layer_top());
  lv_label_set_text(t, thaiDisplay(text).c_str());
  lv_label_set_long_mode(t, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(t, 220);
  lv_obj_set_style_bg_color(t, hex(color), 0);
  lv_obj_set_style_bg_opa(t, LV_OPA_COVER, 0);
  lv_obj_set_style_text_color(t, hex(0x1a0d05), 0);
  lv_obj_set_style_pad_all(t, 10, 0);
  lv_obj_set_style_radius(t, 10, 0);
  lv_obj_set_style_text_align(t, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_align(t, LV_ALIGN_BOTTOM_MID, 0, -64);
  lv_obj_delete_delayed(t, ms);
}

void ledFor(bool r, bool g, bool b, uint32_t ms) {
  setLed(r, g, b);
  if (ledTimer) lv_timer_delete(ledTimer);
  ledTimer = lv_timer_create([](lv_timer_t *) {
    setLed(false, false, false);
    lv_timer_delete(ledTimer);
    ledTimer = nullptr;
  }, ms, nullptr);
}

void showOverlay(const String &text) {
  if (overlay) lv_obj_delete(overlay);
  overlay = lv_obj_create(lv_layer_top());
  lv_obj_remove_style_all(overlay);
  lv_obj_set_size(overlay, LV_PCT(100), LV_PCT(100));
  lv_obj_set_style_bg_color(overlay, hex(0x000000), 0);
  lv_obj_set_style_bg_opa(overlay, LV_OPA_70, 0);
  lv_obj_add_flag(overlay, LV_OBJ_FLAG_CLICKABLE);  // swallow taps while busy
  lv_obj_t *sp = lv_spinner_create(overlay);
  lv_obj_set_size(sp, 56, 56);
  lv_obj_align(sp, LV_ALIGN_CENTER, 0, -20);
  lv_obj_set_style_arc_color(sp, hex(C_ACCENT), LV_PART_INDICATOR);
  lv_obj_t *l = label(overlay, text);
  lv_obj_align(l, LV_ALIGN_CENTER, 0, 34);
}

void hideOverlay() {
  if (overlay) lv_obj_delete(overlay);
  overlay = nullptr;
}

// --- forward declarations -----------------------------------------------------
void showLoading();
void showMenu();
void showItem(int index);
void showCart();
void showOrders();
void showKeypad(KeypadMode mode);
void showSettings();

// --- header -------------------------------------------------------------------
String tableText() {
  if (orderType == "takeaway") return "กลับบ้าน";
  return table.isEmpty() ? String("เลือกโต๊ะ") : "โต๊ะ " + table;
}

void onTableTap(lv_event_t *) {
  if (LOCK_TABLE && !table.isEmpty())
    showKeypad(KP_PIN_TABLE);
  else
    showKeypad(KP_TABLE);
}

void onTitleLongPress(lv_event_t *) { showKeypad(KP_PIN_SETTINGS); }

void header(lv_obj_t *scr, const String &title, lv_event_cb_t back) {
  lv_obj_t *h = row(scr, 4);
  lv_obj_set_height(h, 42);
  lv_obj_set_style_pad_hor(h, 4, 0);
  lv_obj_set_style_bg_color(h, hex(C_CARD), 0);
  lv_obj_set_style_bg_opa(h, LV_OPA_COVER, 0);
  lv_obj_set_style_border_side(h, LV_BORDER_SIDE_BOTTOM, 0);
  lv_obj_set_style_border_color(h, hex(C_BORDER), 0);
  lv_obj_set_style_border_width(h, 1, 0);

  if (back) {
    lv_obj_t *b = button(h, LV_SYMBOL_LEFT, C_BORDER, back);
    lv_obj_set_size(b, 40, 34);
  } else {
    lv_obj_t *b = button(h, tableText(), C_BORDER, onTableTap, nullptr, C_ACCENT);
    lv_obj_set_height(b, 34);
  }

  lv_obj_t *t = label(h, title);
  lv_label_set_long_mode(t, LV_LABEL_LONG_DOT);
  lv_obj_set_height(t, lv_font_get_line_height(&font_th_18));
  lv_obj_set_flex_grow(t, 1);
  lv_obj_add_flag(t, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(t, onTitleLongPress, LV_EVENT_LONG_PRESSED, nullptr);

  wifiIcon = label(h, LV_SYMBOL_WIFI, online ? C_GREEN : C_RED, &lv_font_montserrat_16);

  const int active = activeOrders();
  lv_obj_t *o = button(h, active ? String(LV_SYMBOL_BELL " ") + active : String(LV_SYMBOL_BELL),
                       active ? C_ACCENT : C_BORDER, [](lv_event_t *) { showOrders(); }, nullptr,
                       active ? 0x1a0d05 : C_TEXT);
  lv_obj_set_height(o, 34);
  lv_obj_set_style_text_font(lv_obj_get_child(o, 0), &lv_font_montserrat_16, 0);
}

void goMenu(lv_event_t *) { showMenu(); }

// --- loading ------------------------------------------------------------------
void showLoading() {
  lv_obj_t *scr = newPage(P_LOADING);
  lv_obj_set_flex_align(scr, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_row(scr, 12, 0);
  lv_obj_set_style_pad_all(scr, 16, 0);
  label(scr, "ครัวกะเพรา POS", C_ACCENT, &font_th_24);
  if (menuError.isEmpty()) {
    lv_obj_t *sp = lv_spinner_create(scr);
    lv_obj_set_size(sp, 48, 48);
    lv_obj_set_style_arc_color(sp, hex(C_ACCENT), LV_PART_INDICATOR);
  }
  lv_obj_t *l = label(scr, menuError.isEmpty() ? (online ? String("กำลังโหลดเมนู…") : netText) : menuError,
                      menuError.isEmpty() ? C_TEXT : C_RED);
  lv_label_set_long_mode(l, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(l, 208);
  lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_text_align(para(scr, String(DEVICE_NAME) + "\n" + BRANCH_ID, C_MUTED), LV_TEXT_ALIGN_CENTER, 0);
  if (!menuError.isEmpty())
    button(scr, LV_SYMBOL_REFRESH " ลองใหม่", C_ACCENT, [](lv_event_t *) {
      menuError = "";
      cloudRequestMenu();
      showLoading();
    }, nullptr, 0x1a0d05);
  lv_obj_t *s = button(scr, LV_SYMBOL_SETTINGS " ตั้งค่า", C_BORDER, [](lv_event_t *) { showKeypad(KP_PIN_SETTINGS); });
  (void)s;
}

// --- menu ---------------------------------------------------------------------
void fillMenuList();

void onCategory(lv_event_t *e) {
  const intptr_t i = intptr_t(lv_event_get_user_data(e));
  category = i < 0 ? String("all") : menu->categories[i].id;
  // restyle the tabs
  for (uint32_t c = 0; c < lv_obj_get_child_count(categoryBar); c++) {
    lv_obj_t *tab = lv_obj_get_child(categoryBar, c);
    const bool on = tab == lv_event_get_target_obj(e);
    lv_obj_set_style_bg_color(tab, hex(on ? C_ACCENT : C_BORDER), 0);
    lv_obj_set_style_text_color(lv_obj_get_child(tab, 0), hex(on ? 0x1a0d05 : C_TEXT), 0);
  }
  fillMenuList();
}

void onDish(lv_event_t *e) { showItem(int(intptr_t(lv_event_get_user_data(e)))); }

void fillMenuList() {
  lv_obj_clean(menuList);
  int shown = 0;
  for (size_t i = 0; i < menu->items.size(); i++) {
    const MenuEntry &m = menu->items[i];
    if (category != "all" && m.category != category) continue;
    shown++;
    lv_obj_t *b = lv_button_create(menuList);
    lv_obj_set_size(b, LV_PCT(100), 46);
    lv_obj_set_style_bg_color(b, hex(C_CARD), 0);
    lv_obj_set_style_border_color(b, hex(C_BORDER), 0);
    lv_obj_set_style_border_width(b, 1, 0);
    lv_obj_set_style_radius(b, 10, 0);
    lv_obj_set_style_shadow_width(b, 0, 0);
    lv_obj_set_style_pad_hor(b, 8, 0);
    lv_obj_set_flex_flow(b, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(b, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    lv_obj_t *n = label(b, (m.popular ? String(LV_SYMBOL_OK " ") : String("")) + m.name, m.soldOut ? C_MUTED : C_TEXT);
    lv_label_set_long_mode(n, LV_LABEL_LONG_DOT);
    lv_obj_set_height(n, lv_font_get_line_height(&font_th_18));  // one line, "…" when too long
    lv_obj_set_flex_grow(n, 1);
    label(b, m.soldOut ? String("หมด") : baht(m.price), m.soldOut ? C_RED : C_ACCENT);
    if (m.soldOut)
      lv_obj_add_state(b, LV_STATE_DISABLED);
    else
      lv_obj_add_event_cb(b, onDish, LV_EVENT_CLICKED, (void *)intptr_t(i));
  }
  if (!shown) label(menuList, "ไม่มีเมนูในหมวดนี้", C_MUTED);
  lv_obj_scroll_to_y(menuList, 0, LV_ANIM_OFF);
}

void addCategoryTab(const String &name, intptr_t index, bool on) {
  lv_obj_t *b = button(categoryBar, name, on ? C_ACCENT : C_BORDER, onCategory, (void *)index, on ? 0x1a0d05 : C_TEXT);
  lv_obj_set_height(b, 32);
}

void showMenu() {
  if (pendingMenu) {
    delete menu;
    menu = pendingMenu;
    pendingMenu = nullptr;
  }
  if (!menu) {
    showLoading();
    return;
  }
  lv_obj_t *scr = newPage(P_MENU);
  header(scr, menu->branchName.isEmpty() ? String("ครัวกะเพรา") : menu->branchName, nullptr);

  // Category tabs (only categories that have dishes)
  categoryBar = row(scr, 6);
  lv_obj_set_height(categoryBar, 44);
  lv_obj_set_style_pad_hor(categoryBar, 6, 0);
  lv_obj_set_scroll_dir(categoryBar, LV_DIR_HOR);
  lv_obj_set_scrollbar_mode(categoryBar, LV_SCROLLBAR_MODE_OFF);
  bool known = category == "all";
  addCategoryTab("ทั้งหมด", -1, category == "all");
  for (size_t c = 0; c < menu->categories.size(); c++) {
    const Category &cat = menu->categories[c];
    bool used = false;
    for (const auto &m : menu->items)
      used = used || m.category == cat.id;
    if (!used) continue;
    if (cat.id == category) known = true;
    addCategoryTab(cat.name, intptr_t(c), cat.id == category);
  }
  if (!known) category = "all";

  menuList = body(scr);
  lv_obj_set_style_pad_top(menuList, 0, 0);
  fillMenuList();

  lv_obj_t *f = footer(scr);
  const int count = cartCount();
  lv_obj_t *b = button(f,
                       count ? String(LV_SYMBOL_LIST " ตะกร้า ") + count + " · " +
                                   baht(calculateTotals(cartSubtotal(), *menu).grandTotal)
                             : String("แตะเมนูเพื่อสั่ง"),
                       count ? C_ACCENT : C_BORDER, [](lv_event_t *) { showCart(); }, nullptr,
                       count ? 0x1a0d05 : C_MUTED);
  lv_obj_set_size(b, LV_PCT(100), 42);
  if (!count) lv_obj_add_state(b, LV_STATE_DISABLED);
}

// --- dish options ---------------------------------------------------------------
float draftUnitPrice() {
  const MenuEntry &m = menu->items[draft.itemIndex];
  float unit = m.price;
  if (!m.proteins.empty()) unit += m.proteins[draft.protein].extraPrice;
  for (size_t i = 0; i < draft.addOnIdx.size(); i++)
    if (draft.addOnOn[i]) unit += menu->addOns[draft.addOnIdx[i]].price;
  return unit;
}

void refreshAddButton() {
  if (!itemAddButton) return;
  const String text = String(LV_SYMBOL_PLUS " เพิ่ม ") + draft.qty + " · " + baht(draftUnitPrice() * draft.qty);
  lv_label_set_text(lv_obj_get_child(itemAddButton, 0), thaiDisplay(text).c_str());
}

lv_obj_t *qtyLabel = nullptr;

void onDraftQty(lv_event_t *e) {
  draft.qty = constrain(draft.qty + int(intptr_t(lv_event_get_user_data(e))), 1, 20);
  lv_label_set_text(qtyLabel, String(draft.qty).c_str());
  refreshAddButton();
}

void addDraftToCart(lv_event_t *) {
  const MenuEntry &m = menu->items[draft.itemIndex];
  CartLine line;
  line.itemId = m.id;
  line.name = m.name;
  line.qty = draft.qty;
  line.unitPrice = draftUnitPrice();
  if (!m.spiceLevels.empty()) line.spice = m.spiceLevels[draft.spice];
  if (!m.proteins.empty()) line.protein = m.proteins[draft.protein].name;
  std::vector<String> ids;
  for (size_t i = 0; i < draft.addOnIdx.size(); i++)
    if (draft.addOnOn[i]) {
      const AddOn &a = menu->addOns[draft.addOnIdx[i]];
      line.addOnNames.push_back(a.name);
      ids.push_back(a.id);
    }
  std::sort(ids.begin(), ids.end());
  String joined;
  for (size_t i = 0; i < ids.size(); i++) joined += (i ? "+" : "") + ids[i];
  // Same key as the QR page: identical dish + options stack on one line
  line.key = m.id + "|" + line.spice + "|" + line.protein + "|" + joined + "|";

  bool merged = false;
  for (auto &c : cart)
    if (c.key == line.key) {
      c.qty += line.qty;
      merged = true;
    }
  if (!merged) cart.push_back(line);
  pendingId = "";  // cart changed: a new order id on the next send
  showMenu();
  toast("เพิ่ม " + m.name + " แล้ว", C_GREEN, 1500);
}

void showItem(int index) {
  const MenuEntry &m = menu->items[index];
  draft = Draft();
  draft.itemIndex = index;
  for (size_t s = 0; s < m.spiceLevels.size(); s++)
    if (m.spiceLevels[s] == "เผ็ดปานกลาง") draft.spice = s;  // defaultSpiceLevel() in orderUtils.ts
  if (m.allowAddOns)
    for (size_t a = 0; a < menu->addOns.size(); a++) {
      const AddOn &addOn = menu->addOns[a];
      bool allowed = m.allowedAddOnIds.empty();
      for (const auto &id : m.allowedAddOnIds) allowed = allowed || id == addOn.id;
      if (allowed) {
        draft.addOnIdx.push_back(a);
        draft.addOnOn.push_back(false);
      }
    }

  lv_obj_t *scr = newPage(P_ITEM);
  header(scr, m.name, goMenu);
  lv_obj_t *b = body(scr);

  lv_obj_t *title = label(b, m.name, C_TEXT, &font_th_24);
  lv_label_set_long_mode(title, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(title, LV_PCT(100));
  label(b, baht(m.price), C_ACCENT);

  if (!m.spiceLevels.empty()) {
    label(b, "ระดับความเผ็ด", C_MUTED);
    lv_obj_t *dd = lv_dropdown_create(b);
    lv_obj_set_width(dd, LV_PCT(100));
    String opts;
    for (size_t s = 0; s < m.spiceLevels.size(); s++) opts += (s ? "\n" : "") + m.spiceLevels[s];
    lv_dropdown_set_options(dd, thaiDisplay(opts).c_str());
    lv_dropdown_set_selected(dd, draft.spice);
    lv_obj_add_event_cb(dd, [](lv_event_t *e) {
      draft.spice = lv_dropdown_get_selected(lv_event_get_target_obj(e));
    }, LV_EVENT_VALUE_CHANGED, nullptr);
  }

  if (!m.proteins.empty()) {
    label(b, "เนื้อสัตว์", C_MUTED);
    lv_obj_t *dd = lv_dropdown_create(b);
    lv_obj_set_width(dd, LV_PCT(100));
    String opts;
    for (size_t p = 0; p < m.proteins.size(); p++) {
      opts += (p ? "\n" : "") + m.proteins[p].name;
      if (m.proteins[p].extraPrice > 0) opts += " +" + baht(m.proteins[p].extraPrice);
    }
    lv_dropdown_set_options(dd, thaiDisplay(opts).c_str());
    lv_obj_add_event_cb(dd, [](lv_event_t *e) {
      draft.protein = lv_dropdown_get_selected(lv_event_get_target_obj(e));
      refreshAddButton();
    }, LV_EVENT_VALUE_CHANGED, nullptr);
  }

  if (!draft.addOnIdx.empty()) {
    label(b, "ท็อปปิ้ง", C_MUTED);
    for (size_t i = 0; i < draft.addOnIdx.size(); i++) {
      const AddOn &a = menu->addOns[draft.addOnIdx[i]];
      lv_obj_t *cb = lv_checkbox_create(b);
      lv_checkbox_set_text(cb, thaiDisplay(a.name + "  +" + baht(a.price)).c_str());
      lv_obj_add_event_cb(cb, [](lv_event_t *e) {
        const size_t i = size_t(intptr_t(lv_event_get_user_data(e)));
        draft.addOnOn[i] = lv_obj_has_state(lv_event_get_target_obj(e), LV_STATE_CHECKED);
        refreshAddButton();
      }, LV_EVENT_VALUE_CHANGED, (void *)intptr_t(i));
    }
  }

  label(b, "จำนวน", C_MUTED);
  lv_obj_t *q = row(b, 16);
  lv_obj_set_flex_align(q, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_size(button(q, LV_SYMBOL_MINUS, C_BORDER, onDraftQty, (void *)intptr_t(-1)), 52, 40);
  qtyLabel = label(q, "1", C_TEXT, &font_th_24);
  lv_obj_set_size(button(q, LV_SYMBOL_PLUS, C_BORDER, onDraftQty, (void *)intptr_t(1)), 52, 40);

  lv_obj_t *f = footer(scr);
  itemAddButton = button(f, "", C_ACCENT, addDraftToCart, nullptr, 0x1a0d05);
  lv_obj_set_size(itemAddButton, LV_PCT(100), 42);
  refreshAddButton();
}

// --- cart -----------------------------------------------------------------------
void onLineQty(lv_event_t *e) {
  const intptr_t v = intptr_t(lv_event_get_user_data(e));
  const size_t i = size_t(v >> 1);
  if (i >= cart.size()) return;
  cart[i].qty += (v & 1) ? 1 : -1;
  if (cart[i].qty <= 0) cart.erase(cart.begin() + i);
  pendingId = "";
  if (cart.empty())
    showMenu();
  else
    showCart();
}

void sendOrder(lv_event_t *);

void showCart() {
  if (cart.empty()) {
    showMenu();
    return;
  }
  lv_obj_t *scr = newPage(P_CART);
  header(scr, "ตะกร้า", goMenu);
  lv_obj_t *b = body(scr);

  for (size_t i = 0; i < cart.size(); i++) {
    const CartLine &c = cart[i];
    lv_obj_t *k = card(b);
    lv_obj_set_flex_flow(k, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(k, 2, 0);
    lv_obj_t *n = label(k, c.name);
    lv_label_set_long_mode(n, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(n, LV_PCT(100));
    String opts = c.spice;
    if (!c.protein.isEmpty()) opts += (opts.isEmpty() ? "" : " · ") + c.protein;
    for (const auto &a : c.addOnNames) opts += (opts.isEmpty() ? "+" : " · +") + a;
    if (!opts.isEmpty()) {
      lv_obj_t *o = label(k, opts, C_MUTED);
      lv_label_set_long_mode(o, LV_LABEL_LONG_WRAP);
      lv_obj_set_width(o, LV_PCT(100));
    }
    lv_obj_t *r = row(k, 8);
    lv_obj_set_size(button(r, LV_SYMBOL_MINUS, C_BORDER, onLineQty, (void *)intptr_t(i << 1)), 40, 32);
    label(r, String(c.qty));
    lv_obj_set_size(button(r, LV_SYMBOL_PLUS, C_BORDER, onLineQty, (void *)intptr_t((i << 1) | 1)), 40, 32);
    lv_obj_t *sum = label(r, baht(c.lineTotal()), C_ACCENT);
    lv_obj_set_flex_grow(sum, 1);
    lv_obj_set_style_text_align(sum, LV_TEXT_ALIGN_RIGHT, 0);
  }

  // Dine-in / takeaway
  lv_obj_t *t = row(b, 6);
  const bool dineIn = orderType == "dine-in";
  lv_obj_t *d = button(t, table.isEmpty() ? String("ทานที่ร้าน") : "โต๊ะ " + table, dineIn ? C_ACCENT : C_BORDER,
                       [](lv_event_t *) {
                         orderType = "dine-in";
                         if (table.isEmpty()) showKeypad(KP_TABLE);
                         else showCart();
                       }, nullptr, dineIn ? 0x1a0d05 : C_TEXT);
  lv_obj_set_flex_grow(d, 1);
  lv_obj_t *w = button(t, "กลับบ้าน", dineIn ? C_BORDER : C_ACCENT,
                       [](lv_event_t *) {
                         orderType = "takeaway";
                         showCart();
                       }, nullptr, dineIn ? C_TEXT : 0x1a0d05);
  lv_obj_set_flex_grow(w, 1);

  // Payment: at the counter, or PromptPay when the shop has a valid id
  const bool canPromptPay = !promptPayPayload(menu->promptPayId, 1).isEmpty();
  if (!canPromptPay) payment = "cash";
  if (canPromptPay) {
    lv_obj_t *p = row(b, 6);
    const bool cash = payment == "cash";
    lv_obj_t *pc = button(p, "จ่ายที่ร้าน", cash ? C_ACCENT : C_BORDER, [](lv_event_t *) {
      payment = "cash";
      showCart();
    }, nullptr, cash ? 0x1a0d05 : C_TEXT);
    lv_obj_set_flex_grow(pc, 1);
    lv_obj_t *pp = button(p, "พร้อมเพย์", cash ? C_BORDER : C_ACCENT, [](lv_event_t *) {
      payment = "promptpay";
      showCart();
    }, nullptr, cash ? C_TEXT : 0x1a0d05);
    lv_obj_set_flex_grow(pp, 1);
  }

  const Totals totals = calculateTotals(cartSubtotal(), *menu);
  lv_obj_t *s = card(b);
  lv_obj_set_flex_flow(s, LV_FLEX_FLOW_COLUMN);
  if (totals.vat > 0)
    label(s, String(menu->vatType == "exclusive" ? "VAT " : "รวม VAT แล้ว ") + baht(totals.vat), C_MUTED);
  label(s, "ยอดรวม " + baht(totals.grandTotal), C_ACCENT, &font_th_24);

  lv_obj_t *f = footer(scr);
  lv_obj_t *send = button(f, String(LV_SYMBOL_UPLOAD " ส่งออเดอร์ · ") + baht(totals.grandTotal), online ? C_GREEN : C_BORDER, sendOrder, nullptr,
                          online ? 0x06210f : C_MUTED);
  lv_obj_set_size(send, LV_PCT(100), 42);
}

void sendOrder(lv_event_t *) {
  if (submitting) return;
  // Check the cart against the newest menu (sold-out changes arrive every few minutes)
  if (pendingMenu) {
    delete menu;
    menu = pendingMenu;
    pendingMenu = nullptr;
  }
  if (!online) {
    toast("ยังไม่ได้เชื่อม Wi-Fi", C_RED);
    return;
  }
  if (cartCount() > MAX_ITEMS_PER_ORDER) {
    toast(String("สั่งได้ไม่เกิน ") + MAX_ITEMS_PER_ORDER + " ชิ้นต่อครั้ง", C_RED);
    return;
  }
  if (calculateTotals(cartSubtotal(), *menu).grandTotal > MAX_ORDER_TOTAL) {
    toast("ยอดเกิน " + baht(MAX_ORDER_TOTAL) + " ต่อออเดอร์ กรุณาสั่งที่เคาน์เตอร์", C_RED);
    return;
  }
  if (orderType == "dine-in" && table.isEmpty()) {
    showKeypad(KP_TABLE);
    return;
  }
  if (pendingId.isEmpty() && lastOrderAt && millis() - lastOrderAt < ORDER_COOLDOWN_MS) {
    toast("เพิ่งส่งออเดอร์ไป รออีก " + String((ORDER_COOLDOWN_MS - (millis() - lastOrderAt)) / 1000 + 1) + " วินาที",
          C_AMBER);
    return;
  }
  // Drop dishes that sold out since they were added
  for (size_t i = 0; i < cart.size();) {
    const MenuEntry *m = menu->find(cart[i].itemId);
    if (!m || m->soldOut) {
      toast(cart[i].name + " หมดแล้ว — นำออกจากตะกร้า", C_RED);
      cart.erase(cart.begin() + i);
      pendingId = "";
    } else {
      i++;
    }
  }
  if (cart.empty()) {
    showMenu();
    return;
  }
  if (pendingId.isEmpty()) {
    pendingId = newOrderId();
    pendingNumber = newOrderNumber(orderType == "dine-in" ? table : String("TA"));
  }

  auto *d = new OrderDraft();
  d->id = pendingId;
  d->orderNumber = pendingNumber;
  d->table = table;
  d->orderType = orderType;
  d->payment = payment;
  d->branchName = menu->branchName;
  d->totals = calculateTotals(cartSubtotal(), *menu);
  d->lines = cart;
  submitting = true;
  submittingTotal = d->totals.grandTotal;
  submittingPayment = payment;
  showOverlay("กำลังส่งออเดอร์…");
  cloudSubmitOrder(d);
}

// --- orders -------------------------------------------------------------------------
void showOrders() {
  lv_obj_t *scr = newPage(P_ORDERS);
  header(scr, "ออเดอร์ของเครื่องนี้", goMenu);
  lv_obj_t *b = body(scr);

  if (orders.empty()) label(b, "ยังไม่มีออเดอร์", C_MUTED);

  for (size_t i = 0; i < orders.size(); i++) {
    const TrackedOrder &o = orders[i];
    lv_obj_t *k = card(b);
    lv_obj_set_flex_flow(k, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(k, 4, 0);
    lv_obj_t *r = row(k, 6);
    lv_obj_t *n = label(r, o.number, C_TEXT, i == 0 ? &font_th_24 : nullptr);
    lv_obj_set_flex_grow(n, 1);
    label(r, baht(o.total), C_ACCENT);
    // PromptPay QR with the amount for the latest order (sized to fit without scrolling)
    const String payload = i == 0 && o.payment == "promptpay" && o.status != "cancelled"
                               ? promptPayPayload(menu ? menu->promptPayId : String(""), o.total)
                               : String("");
    label(k, statusText(o.status), statusColor(o.status), i == 0 && payload.isEmpty() ? &font_th_24 : nullptr);

    if (!payload.isEmpty()) {
      lv_obj_set_flex_align(k, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
      lv_obj_t *qr = lv_qrcode_create(k);
      lv_obj_set_style_pad_all(k, 6, 0);
      lv_obj_set_style_pad_row(k, 2, 0);
      lv_qrcode_set_size(qr, 118);
      lv_qrcode_set_dark_color(qr, lv_color_black());
      lv_qrcode_set_light_color(qr, lv_color_white());
      lv_qrcode_update(qr, payload.c_str(), payload.length());
      lv_obj_set_style_border_color(qr, lv_color_white(), 0);
      lv_obj_set_style_border_width(qr, 4, 0);
      para(k, "สแกนจ่ายพร้อมเพย์ " + baht(o.total) + " แล้วแจ้งพนักงาน", C_MUTED);
    } else if (i == 0 && o.status == "pending-qr") {
      para(k, "พนักงานจะยืนยันออเดอร์สักครู่", C_MUTED);
    }
  }

  lv_obj_t *f = footer(scr);
  lv_obj_t *more = button(f, LV_SYMBOL_PLUS " สั่งเพิ่ม", C_ACCENT, goMenu, nullptr, 0x1a0d05);
  lv_obj_set_size(more, LV_PCT(100), 42);
}

// --- keypad (PIN / table number) ---------------------------------------------------
const char *KEYPAD_MAP[] = {"1", "2", "3", "\n", "4", "5", "6", "\n", "7", "8", "9", "\n", LV_SYMBOL_BACKSPACE, "0",
                            LV_SYMBOL_OK, ""};

void refreshKeypadLabel() {
  if (keypadMode == KP_TABLE)
    lv_label_set_text(keypadLabel, keypadValue.isEmpty() ? "-" : keypadValue.c_str());
  else {
    String dots;
    for (size_t i = 0; i < keypadValue.length(); i++) dots += "*";
    lv_label_set_text(keypadLabel, dots.isEmpty() ? "-" : dots.c_str());
  }
}

void onKeypad(lv_event_t *e) {
  lv_obj_t *m = lv_event_get_target_obj(e);
  const char *key = lv_buttonmatrix_get_button_text(m, lv_buttonmatrix_get_selected_button(m));
  if (!key) return;
  if (strcmp(key, LV_SYMBOL_BACKSPACE) == 0) {
    if (!keypadValue.isEmpty()) keypadValue.remove(keypadValue.length() - 1);
  } else if (strcmp(key, LV_SYMBOL_OK) == 0) {
    if (keypadMode == KP_TABLE) {
      table = keypadValue;
      orderType = table.isEmpty() ? "takeaway" : "dine-in";
      pendingId = "";
      saveTable();
      if (cart.empty()) showMenu();
      else showCart();
    } else if (keypadValue == DEVICE_PIN) {
      if (keypadMode == KP_PIN_TABLE) showKeypad(KP_TABLE);
      else showSettings();
    } else {
      keypadValue = "";
      toast("PIN ไม่ถูกต้อง", C_RED, 1500);
      refreshKeypadLabel();
    }
    return;
  } else if (keypadValue.length() < (keypadMode == KP_TABLE ? 4u : 8u)) {
    keypadValue += key;
  }
  refreshKeypadLabel();
}

void showKeypad(KeypadMode mode) {
  keypadMode = mode;
  keypadValue = mode == KP_TABLE ? table : String("");
  lv_obj_t *scr = newPage(P_KEYPAD);
  header(scr, mode == KP_TABLE ? "เลขโต๊ะ" : "ใส่ PIN", [](lv_event_t *) {
    if (menu) showMenu();
    else showLoading();
  });
  lv_obj_t *top = row(scr, 0);
  lv_obj_set_height(top, 50);
  lv_obj_set_flex_align(top, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  keypadLabel = label(top, "", C_ACCENT, &font_th_24);
  refreshKeypadLabel();

  lv_obj_t *m = lv_buttonmatrix_create(scr);
  lv_buttonmatrix_set_map(m, KEYPAD_MAP);
  lv_obj_set_width(m, LV_PCT(100));
  lv_obj_set_flex_grow(m, 1);
  lv_obj_set_style_bg_opa(m, LV_OPA_TRANSP, 0);
  lv_obj_set_style_border_width(m, 0, 0);
  lv_obj_set_style_text_font(m, &lv_font_montserrat_16, LV_PART_ITEMS);
  lv_obj_add_event_cb(m, onKeypad, LV_EVENT_VALUE_CHANGED, nullptr);
}

// --- settings -----------------------------------------------------------------------
void showSettings() {
  lv_obj_t *scr = newPage(P_SETTINGS);
  header(scr, "ตั้งค่าเครื่อง", [](lv_event_t *) {
    if (menu) showMenu();
    else showLoading();
  });
  lv_obj_t *b = body(scr);

  lv_obj_t *info = card(b);
  lv_obj_set_flex_flow(info, LV_FLEX_FLOW_COLUMN);
  label(info, String("เครื่อง: ") + DEVICE_NAME);
  label(info, String("สาขา: ") + (menu ? menu->branchName : String(BRANCH_ID)), C_MUTED);
  para(info, online ? "Wi-Fi " + WiFi.localIP().toString() + " (" + WiFi.RSSI() + " dBm)" : netText,
       online ? C_GREEN : C_RED);
  label(info, String("เมนู ") + (menu ? String(menu->items.size()) + " รายการ" : String("ยังไม่โหลด")), C_MUTED);
  label(info, String("RAM ว่าง ") + ESP.getFreeHeap() / 1024 + " KB", C_MUTED);

  auto full = [](lv_obj_t *btn) { lv_obj_set_size(btn, LV_PCT(100), 40); };
  full(button(b, "เปลี่ยนเลขโต๊ะ", C_BORDER, [](lv_event_t *) { showKeypad(KP_TABLE); }));
  full(button(b, LV_SYMBOL_REFRESH " โหลดเมนูใหม่", C_BORDER, [](lv_event_t *) {
    cloudRequestMenu();
    toast("กำลังโหลดเมนู…", C_AMBER, 1500);
  }));
  full(button(b, "ปรับจอสัมผัส", C_BORDER, [](lv_event_t *) { displayCalibrate(); }));
  full(button(b, "ทดสอบเสียง/ไฟ", C_BORDER, [](lv_event_t *) {
    beep(2);
    ledFor(false, true, false, 1500);
  }));
  full(button(b, "รีเซ็ตบัญชี Firebase ของเครื่อง", C_BORDER, [](lv_event_t *) {
    cloudResetIdentity();
    orders.clear();
    toast("รีเซ็ตแล้ว", C_AMBER, 1500);
  }));
  full(button(b, LV_SYMBOL_POWER " รีสตาร์ท", C_RED, [](lv_event_t *) { ESP.restart(); }));
}

}  // namespace

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------
void uiBegin() {
  lv_display_t *disp = lv_display_get_default();
  lv_theme_t *theme = lv_theme_default_init(disp, hex(C_ACCENT), hex(0xff8a3d), true, &font_th_18);
  lv_display_set_theme(disp, theme);

  Preferences prefs;
  prefs.begin("pos", true);
  table = prefs.getString("table", DEFAULT_TABLE);
  prefs.end();
  orderType = table.isEmpty() ? "takeaway" : "dine-in";
  showLoading();
}

void uiHandleEvent(const NetEvent &ev) {
  switch (ev.type) {
    case EV_NET_STATE:
      online = ev.ok;
      netText = ev.msg;
      if (wifiIcon) lv_obj_set_style_text_color(wifiIcon, hex(online ? C_GREEN : C_RED), 0);
      if (page == P_LOADING) showLoading();
      break;

    case EV_MENU_LOADED: {
      const bool first = menu == nullptr && pendingMenu == nullptr;
      menuError = "";
      // The periodic reload usually brings the same menu: keep the screen as it is
      const Menu *current = pendingMenu ? pendingMenu : menu;
      if (current && current->publishedAt == ev.menu->publishedAt && !ev.menu->publishedAt.isEmpty()) {
        delete ev.menu;
        break;
      }
      delete pendingMenu;
      pendingMenu = ev.menu;
      // Swap now unless someone is in the middle of choosing a dish
      if (page == P_LOADING || page == P_MENU) showMenu();
      if (first) beep(1);
      break;
    }

    case EV_MENU_FAILED:
      if (!menu && !pendingMenu) {
        menuError = ev.msg;
        if (page == P_LOADING) showLoading();
      }
      break;

    case EV_ORDER_SENT: {
      submitting = false;
      hideOverlay();
      TrackedOrder o;
      o.id = ev.id;
      o.number = ev.number;
      o.total = submittingTotal;
      o.payment = submittingPayment;
      o.status = "pending-qr";
      o.placedAtMs = millis();
      orders.insert(orders.begin(), o);
      if (orders.size() > MAX_ORDERS_SHOWN) orders.pop_back();
      cart.clear();
      pendingId = "";
      lastOrderAt = millis();
      beep(1);
      ledFor(false, false, true, 3000);
      showOrders();
      break;
    }

    case EV_ORDER_FAILED:
      submitting = false;
      hideOverlay();
      toast(String(ev.msg) + "\nแตะส่งอีกครั้งได้", C_RED, 5000);
      break;

    case EV_ORDER_STATUS:
      for (auto &o : orders) {
        if (o.id != ev.id) continue;
        o.status = ev.status;
        if (o.status == "ready") {
          beep(3);
          ledFor(false, true, false, 15000);
          toast(o.number + " พร้อมเสิร์ฟ!", C_GREEN, 6000);
        } else if (o.status == "pending" || o.status == "cooking") {
          toast(o.number + " " + statusText(o.status), C_AMBER, 2500);
        } else if (o.status == "cancelled") {
          beep(2);
          ledFor(true, false, false, 8000);
          toast(o.number + " ถูกยกเลิก", C_RED, 6000);
        }
      }
      if (page == P_ORDERS) showOrders();
      break;
  }
}
