// Host test tool for documents.cpp
//   menu-test parse <public_menu.json>                 -> what the terminal understood (JSON)
//   menu-test order <public_menu.json> <id> <now>      -> order body the terminal would POST
//   menu-test paydisplay <payment_display.json>       -> what the payment screen understood
// The order uses a fixed cart (see buildCart) that emulator-check.ts recomputes on its own.
#include <fstream>
#include <iostream>
#include <sstream>

#include "documents.h"

static void buildCart(const Menu &menu, OrderDraft &d) {
  // 1) first dish with protein choices: last protein, first spice level, first allowed topping, x2
  // 2) first other dish that is not sold out, default options, x1
  for (const auto &m : menu.items) {
    if (m.soldOut || m.proteins.empty()) continue;
    CartLine l;
    l.itemId = m.id;
    l.name = m.name;
    l.qty = 2;
    l.unitPrice = m.price + m.proteins.back().extraPrice;
    l.protein = m.proteins.back().name;
    if (!m.spiceLevels.empty()) l.spice = m.spiceLevels.front();
    String addOnId;
    if (m.allowAddOns)
      for (const auto &a : menu.addOns) {
        bool ok = m.allowedAddOnIds.empty();
        for (const auto &id : m.allowedAddOnIds) ok = ok || id == a.id;
        if (!ok) continue;
        l.addOnNames.push_back(a.name);
        l.unitPrice += a.price;
        addOnId = a.id;
        break;
      }
    l.key = m.id + "|" + l.spice + "|" + l.protein + "|" + addOnId + "|";
    d.lines.push_back(l);
    break;
  }
  for (const auto &m : menu.items) {
    if (m.soldOut || (!d.lines.empty() && m.id == d.lines[0].itemId)) continue;
    CartLine l;
    l.itemId = m.id;
    l.name = m.name;
    l.unitPrice = m.price;
    l.key = m.id + "||||";
    d.lines.push_back(l);
    break;
  }
}

int main(int argc, char **argv) {
  if (argc < 3) return 2;
  std::ifstream in(argv[2]);
  std::stringstream ss;
  ss << in.rdbuf();
  const std::string json = ss.str();

  if (std::string(argv[1]) == "paydisplay") {
    JsonDocument raw;
    if (deserializeJson(raw, json.c_str())) return 1;
    PaymentDisplay *p = parsePaymentDisplay(raw["fields"].as<JsonObjectConst>());
    JsonDocument out;
    out["state"] = p->state;
    out["amount"] = p->amount;
    out["label"] = p->label;
    out["shopName"] = p->shopName;
    out["payload"] = p->payload;
    out["qrSize"] = p->qrSize;
    out["qrBytes"] = p->qrBits.size();
    out["session"] = p->session;
    out["expiresAt"] = std::to_string(p->expiresAt);
    // Checksum of the bitmap so the test can compare it with what the POS packed
    uint32_t sum = 0;
    for (uint8_t b : p->qrBits) sum = sum * 31 + b;
    out["qrChecksum"] = sum;
    serializeJson(out, std::cout);
    return 0;
  }

  JsonDocument filter;
  buildMenuFilter(filter);
  JsonDocument doc;
  if (deserializeJson(doc, json.c_str(), DeserializationOption::Filter(filter),
                      DeserializationOption::NestingLimit(24))) {
    std::cerr << "bad json\n";
    return 1;
  }
  Menu *menu = parseMenu(doc["fields"].as<JsonObjectConst>());

  JsonDocument out;
  if (std::string(argv[1]) == "parse") {
    out["branchName"] = menu->branchName;
    out["shopName"] = menu->shopName;
    out["promptPayId"] = menu->promptPayId;
    out["vatEnabled"] = menu->vatEnabled;
    out["vatRate"] = menu->vatRate;
    out["vatType"] = menu->vatType;
    for (const auto &c : menu->categories) {
      JsonObject o = out["categories"].add<JsonObject>();
      o["id"] = c.id;
      o["name"] = c.name;
    }
    for (const auto &a : menu->addOns) {
      JsonObject o = out["addOns"].add<JsonObject>();
      o["id"] = a.id;
      o["name"] = a.name;
      o["price"] = a.price;
    }
    for (const auto &m : menu->items) {
      JsonObject o = out["items"].add<JsonObject>();
      o["id"] = m.id;
      o["name"] = m.name;
      o["category"] = m.category;
      o["price"] = m.price;
      o["soldOut"] = m.soldOut;
      o["popular"] = m.popular;
      o["allowAddOns"] = m.allowAddOns;
      JsonArray s = o["spiceLevels"].to<JsonArray>();
      for (const auto &v : m.spiceLevels) s.add(v);
      JsonArray p = o["proteins"].to<JsonArray>();
      for (const auto &v : m.proteins) {
        JsonObject po = p.add<JsonObject>();
        po["name"] = v.name;
        po["extraPrice"] = v.extraPrice;
      }
      JsonArray ids = o["allowedAddOnIds"].to<JsonArray>();
      for (const auto &v : m.allowedAddOnIds) ids.add(v);
    }
    serializeJson(out, std::cout);
    return 0;
  }

  if (argc < 5) return 2;
  OrderDraft d;
  d.id = argv[3];
  d.orderNumber = "#Q5-TEST";
  d.table = "5";
  d.orderType = "dine-in";
  d.payment = "cash";
  d.branchName = menu->branchName;
  buildCart(*menu, d);
  float subtotal = 0;
  for (const auto &l : d.lines) subtotal += l.lineTotal();
  d.totals = calculateTotals(subtotal, *menu);
  std::cout << buildOrderBody(d, argv[4]).c_str();
  return 0;
}
