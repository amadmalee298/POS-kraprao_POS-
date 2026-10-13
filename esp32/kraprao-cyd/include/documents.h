// Firestore REST JSON <-> menu and order (documents.cpp)
#pragma once

#include <ArduinoJson.h>

#include "app.h"

// {"stringValue": "..."} -> "..." (empty for anything else)
String fsString(JsonVariantConst value);
// Keeps only the menu fields the terminal uses while streaming public_menu/{branchId}
void buildMenuFilter(JsonDocument &filter);
// `fields` of the public_menu document -> Menu (caller owns it)
Menu *parseMenu(JsonObjectConst fields);
// Body for POST .../documents/orders?documentId=<id>; `now` is an ISO-8601 UTC time
String buildOrderBody(const OrderDraft &draft, const String &now);
// `fields` of payment_display/{branchId} -> PaymentDisplay (caller owns it)
PaymentDisplay *parsePaymentDisplay(JsonObjectConst fields);
