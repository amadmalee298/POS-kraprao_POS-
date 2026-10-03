// Firestore REST documents: reading the public menu and writing an order.
// Kept free of Wi-Fi/HTTP code so it can be tested on a computer (see test/).
#include "documents.h"

#include <algorithm>

// ---------------------------------------------------------------------------
// Firestore value helpers (REST JSON uses typed values)
// ---------------------------------------------------------------------------
String fsString(JsonVariantConst v) { return v["stringValue"] | ""; }

namespace {

float fsNumber(JsonVariantConst v, float fallback = 0) {
  if (v["integerValue"].is<const char *>()) return atof(v["integerValue"].as<const char *>());
  if (v["doubleValue"].is<double>()) return v["doubleValue"].as<float>();
  return fallback;
}

bool fsBool(JsonVariantConst v, bool fallback) {
  return v["booleanValue"].is<bool>() ? v["booleanValue"].as<bool>() : fallback;
}

JsonArrayConst fsArray(JsonVariantConst v) { return v["arrayValue"]["values"].as<JsonArrayConst>(); }
JsonObjectConst fsMap(JsonVariantConst v) { return v["mapValue"]["fields"].as<JsonObjectConst>(); }

void putString(JsonObject f, const char *key, const String &value) { f[key]["stringValue"] = value; }
void putNull(JsonObject f, const char *key) { f[key]["nullValue"] = nullptr; }
void putBool(JsonObject f, const char *key, bool value) { f[key]["booleanValue"] = value; }
// Whole baht as integers, satang as doubles: the same types the web app's numbers produce
void putNumber(JsonObject f, const char *key, float value) {
  const double v = round(double(value) * 100.0) / 100.0;
  if (v == floor(v))
    f[key]["integerValue"] = String(long(v));
  else
    f[key]["doubleValue"] = v;
}

}  // namespace

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
// The document also carries descriptions and image links; the filter drops them while
// parsing so the menu fits in the ESP32's RAM.
void buildMenuFilter(JsonDocument &filter) {
  JsonObject item = filter["fields"]["menuItems"]["arrayValue"]["values"][0]["mapValue"]["fields"].to<JsonObject>();
  for (const char *key : {"id", "name", "category", "price", "isSoldOut", "isPopular", "allowAddOns",
                          "availableSpiceLevels", "availableProteins", "allowedAddOnIds"})
    item[key] = true;
  for (const char *key : {"categories", "addOns", "settings", "branch", "publishedAt"}) filter["fields"][key] = true;
}

Menu *parseMenu(JsonObjectConst f) {
  auto *menu = new Menu();
  JsonObjectConst branch = fsMap(f["branch"]);
  JsonObjectConst settings = fsMap(f["settings"]);
  menu->branchName = fsString(branch["name"]);
  menu->promptPayId = fsString(branch["promptpayMobileOrTaxId"]);
  menu->shopName = fsString(settings["shopName"]);
  if (menu->branchName.isEmpty()) menu->branchName = menu->shopName;
  menu->vatEnabled = fsBool(settings["enableVat"], true);
  menu->vatRate = fsNumber(settings["vatRate"], 7);
  const String vatType = fsString(settings["vatType"]);
  if (!vatType.isEmpty()) menu->vatType = vatType;
  menu->publishedAt = fsString(f["publishedAt"]);

  for (JsonVariantConst c : fsArray(f["categories"])) {
    JsonObjectConst cf = fsMap(c);
    Category cat;
    cat.id = fsString(cf["id"]);
    cat.name = fsString(cf["name"]);
    menu->categories.push_back(cat);
  }
  for (JsonVariantConst a : fsArray(f["addOns"])) {
    JsonObjectConst af = fsMap(a);
    AddOn addOn;
    addOn.id = fsString(af["id"]);
    addOn.name = fsString(af["name"]);
    addOn.price = fsNumber(af["price"]);
    menu->addOns.push_back(addOn);
  }
  for (JsonVariantConst m : fsArray(f["menuItems"])) {
    JsonObjectConst mf = fsMap(m);
    MenuEntry e;
    e.id = fsString(mf["id"]);
    e.name = fsString(mf["name"]);
    e.category = fsString(mf["category"]);
    e.price = fsNumber(mf["price"]);
    e.soldOut = fsBool(mf["isSoldOut"], false);
    e.popular = fsBool(mf["isPopular"], false);
    e.allowAddOns = fsBool(mf["allowAddOns"], true);
    for (JsonVariantConst s : fsArray(mf["availableSpiceLevels"])) e.spiceLevels.push_back(fsString(s));
    for (JsonVariantConst p : fsArray(mf["availableProteins"])) {
      JsonObjectConst pf = fsMap(p);
      Protein protein;
      protein.name = fsString(pf["name"]);
      protein.extraPrice = fsNumber(pf["extraPrice"]);
      e.proteins.push_back(protein);
    }
    for (JsonVariantConst id : fsArray(mf["allowedAddOnIds"])) e.allowedAddOnIds.push_back(fsString(id));
    if (!e.id.isEmpty() && !e.name.isEmpty()) menu->items.push_back(std::move(e));
  }
  // Popular dishes first, as on the QR page
  std::stable_sort(menu->items.begin(), menu->items.end(),
                   [](const MenuEntry &a, const MenuEntry &b) { return a.popular && !b.popular; });
  return menu;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
// Same document as buildOrderPayload() in the web app for a customer QR order. The security
// rules only accept it as status "pending-qr", unpaid, no discount, at most 40 lines.
String buildOrderBody(const OrderDraft &d, const String &now) {
  JsonDocument doc;
  JsonObject f = doc["fields"].to<JsonObject>();
  putString(f, "id", d.id);
  putString(f, "orderNumber", d.orderNumber);
  putString(f, "branchId", BRANCH_ID);
  putString(f, "branchName", d.branchName);
  putString(f, "orderType", d.orderType);
  putString(f, "tableNumber", d.orderType == "dine-in" ? d.table : "");

  int count = 0;
  JsonArray items = f["items"]["arrayValue"]["values"].to<JsonArray>();
  for (const CartLine &line : d.lines) {
    count += line.qty;
    JsonObject it = items.add<JsonObject>()["mapValue"]["fields"].to<JsonObject>();
    putString(it, "cartItemId", line.key);
    putString(it, "menuItemId", line.itemId);
    putString(it, "name", line.name);
    putNumber(it, "quantity", line.qty);
    putNumber(it, "unitPrice", line.unitPrice);
    putNumber(it, "totalPrice", line.lineTotal());
    if (line.spice.isEmpty()) putNull(it, "spiceLevel");
    else putString(it, "spiceLevel", line.spice);
    if (line.protein.isEmpty()) putNull(it, "proteinChoice");
    else putString(it, "proteinChoice", line.protein);
    JsonArray addOns = it["selectedAddOns"]["arrayValue"]["values"].to<JsonArray>();
    for (const String &name : line.addOnNames) addOns.add<JsonObject>()["stringValue"] = name;
    putString(it, "specialNotes", "");
  }
  putNumber(f, "itemsCount", count);
  putNumber(f, "subtotal", d.totals.subtotal);
  putNumber(f, "discountAmount", 0);
  putString(f, "discountType", "fixed");
  putString(f, "discountNote", String("สั่งจากจอ ESP32: ") + DEVICE_NAME);
  putNumber(f, "vatAmount", d.totals.vat);
  putNumber(f, "grandTotal", d.totals.grandTotal);
  putString(f, "paymentMethod", d.payment);
  putNumber(f, "tenderedAmount", 0);
  putNumber(f, "changeAmount", 0);
  putString(f, "status", "pending-qr");
  putString(f, "createdAt", now);
  putNull(f, "completedAt");
  putNull(f, "customerTaxInfo");
  putString(f, "customerName", "");
  putString(f, "customerPhone", "");
  putBool(f, "isFullTaxInvoiceRequested", false);
  putBool(f, "isQrOrder", true);
  putString(f, "orderSource", "qr");
  putString(f, "syncedAt", now);
  putBool(f, "isOfflineOrder", false);
  putBool(f, "isSynced", true);
  f["updatedAt"]["timestampValue"] = now;
  putString(f, "checksum", "");
  putString(f, "paymentStatus", "unpaid");
  putNull(f, "paidAt");
  putNull(f, "acceptedAt");

  String body;
  serializeJson(doc, body);
  return body;
}

// calculateOrderTotals() in src/utils/tax.ts, without discounts
Totals calculateTotals(float subtotal, const Menu &menu) {
  auto round2 = [](double v) { return float(round(v * 100.0) / 100.0); };
  Totals t;
  t.subtotal = round2(subtotal);
  t.grandTotal = t.subtotal;
  if (menu.vatEnabled && menu.vatRate > 0 && menu.vatType != "none") {
    if (menu.vatType == "exclusive") {
      t.vat = round2(subtotal * menu.vatRate / 100.0);
      t.grandTotal = round2(subtotal + subtotal * menu.vatRate / 100.0);
    } else {
      t.vat = round2(subtotal * menu.vatRate / (100.0 + menu.vatRate));
    }
  }
  return t;
}
