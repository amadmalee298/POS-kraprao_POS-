// Shared types for the ESP32 order terminal.
// The menu mirrors the `public_menu/{branchId}` document the POS publishes for QR ordering,
// and orders are written in the same shape as the web QR page (src/services/firebaseService.ts
// buildOrderPayload), so the POS, KDS and stock see them like any other QR order.
#pragma once

#include <Arduino.h>
#include <vector>

#if __has_include("config.h")
#include "config.h"
#else
#warning "include/config.h not found: using config.example.h (copy it to config.h and fill in your shop's values)"
#include "config.example.h"
#endif

#ifndef CYD_PANEL
#define CYD_PANEL 1  // 1 = ILI9341, 2 = ILI9341 with inverted colours, 3 = ST7789 (2-USB boards)
#endif
#ifndef SCREEN_ROTATION
#define SCREEN_ROTATION 0  // 0 = portrait, 2 = portrait upside down
#endif

// ---------------------------------------------------------------------------
// Menu (public_menu document)
// ---------------------------------------------------------------------------
struct Protein {
  String name;
  float extraPrice = 0;
};

struct AddOn {
  String id;
  String name;
  float price = 0;
};

struct MenuEntry {
  String id;
  String name;
  String category;
  float price = 0;
  bool soldOut = false;
  bool popular = false;
  bool allowAddOns = true;
  std::vector<String> spiceLevels;
  std::vector<Protein> proteins;
  std::vector<String> allowedAddOnIds;
};

struct Category {
  String id;
  String name;
};

struct Menu {
  String branchName;
  String shopName;
  String promptPayId;
  bool vatEnabled = true;
  float vatRate = 7;
  String vatType = "inclusive";  // inclusive | exclusive | none
  String publishedAt;
  std::vector<Category> categories;
  std::vector<MenuEntry> items;
  std::vector<AddOn> addOns;

  const MenuEntry *find(const String &id) const {
    for (const auto &m : items)
      if (m.id == id) return &m;
    return nullptr;
  }
};

// ---------------------------------------------------------------------------
// Cart and orders
// ---------------------------------------------------------------------------
struct CartLine {
  String key;  // same item + options = same line (as on the QR page)
  String itemId;
  String name;
  int qty = 1;
  float unitPrice = 0;
  String spice;
  String protein;
  std::vector<String> addOnNames;
  float lineTotal() const { return unitPrice * qty; }
};

struct Totals {
  float subtotal = 0;
  float vat = 0;
  float grandTotal = 0;
};

struct OrderDraft {
  String id;           // ord-<ms>-<6 chars>; kept across retries so a resend never duplicates
  String orderNumber;  // #Q<table>-<4 chars>
  String table;
  String orderType;  // dine-in | takeaway
  String payment;    // cash | promptpay
  String branchName;
  Totals totals;
  std::vector<CartLine> lines;
};

struct TrackedOrder {
  String id;
  String number;
  float total = 0;
  String payment;
  String status;  // pending-qr | pending | cooking | ready | served | cancelled
  uint32_t placedAtMs = 0;
};

Totals calculateTotals(float subtotal, const Menu &menu);

// ---------------------------------------------------------------------------
// Network task <-> UI
// ---------------------------------------------------------------------------
enum EventType : uint8_t {
  EV_NET_STATE,    // msg = status text, ok = online
  EV_MENU_LOADED,  // menu = new Menu (UI takes ownership)
  EV_MENU_FAILED,  // msg
  EV_ORDER_SENT,   // id, number
  EV_ORDER_FAILED, // id, msg
  EV_ORDER_STATUS, // id, status
};

struct NetEvent {
  EventType type;
  bool ok;
  Menu *menu;
  char id[48];
  char number[24];
  char status[16];
  char msg[120];
};

void cloudBegin();                        // starts the network task (core 0)
bool cloudPoll(NetEvent &ev);             // UI side: next event, if any
void cloudRequestMenu();                  // reload the menu now
void cloudSubmitOrder(OrderDraft *draft); // network task takes ownership
void cloudResetIdentity();                // forget the anonymous Firebase user
String newOrderId();
String newOrderNumber(const String &table);

// Display + touch (display.cpp)
void displayBegin();
void displayCalibrate();
void displaySetBacklight(uint8_t level);

// Feedback (main.cpp)
void beep(int times);
void setLed(bool r, bool g, bool b);

// Thai text prepared for the LVGL fonts (thai.cpp); display only
String thaiDisplay(const String &text);

// PromptPay (promptpay.cpp)
String promptPayPayload(const String &id, float amount);

// UI (ui.cpp)
void uiBegin();
void uiHandleEvent(const NetEvent &ev);
