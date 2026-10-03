// Network task: Wi-Fi, clock, Firebase sign-in and the Firestore REST calls.
//
// The terminal is a "customer" of the shop's Firebase project, exactly like a phone that scanned
// a table QR code: it signs in anonymously, reads public_menu/{branchId}, creates orders that wait
// for approval (status "pending-qr") and follows their status. No change to firestore.rules or
// to the POS app is needed, and the POS approves, cooks, charges and deducts stock as usual.
//
// Everything here runs on its own FreeRTOS task (core 0). The UI (LVGL, core 1) only talks to
// it through two queues, so a slow TLS handshake never freezes the screen.
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <algorithm>
#include <memory>
#include <sys/time.h>
#include <time.h>

#include "app.h"
#include "certs.h"
#include "documents.h"

namespace {

enum JobType : uint8_t { JOB_MENU, JOB_ORDER, JOB_RESET_ID };
struct Job {
  JobType type;
  OrderDraft *draft;
};

QueueHandle_t jobQueue;
QueueHandle_t eventQueue;

constexpr uint32_t MENU_REFRESH_MS = 5 * 60 * 1000;
constexpr uint32_t MENU_RETRY_MS = 30 * 1000;
constexpr uint32_t STATUS_POLL_MS = 10 * 1000;
constexpr size_t MAX_TRACKED = 8;

String idToken;
String refreshToken;
uint32_t tokenExpiresAt = 0;  // millis()
bool menuLoaded = false;
uint32_t lastMenuAttempt = 0;
uint32_t lastStatusPoll = 0;

struct Tracked {
  String id;
  String status;
};
std::vector<Tracked> tracked;

const String FIRESTORE_BASE = String("https://firestore.googleapis.com/v1/projects/") + FIREBASE_PROJECT_ID +
                              "/databases/(default)/documents";

// ---------------------------------------------------------------------------
// Events to the UI
// ---------------------------------------------------------------------------
void emit(EventType type, bool ok, const String &msg = "", const String &id = "", const String &extra = "",
          Menu *menu = nullptr) {
  NetEvent ev{};
  ev.type = type;
  ev.ok = ok;
  ev.menu = menu;
  strlcpy(ev.msg, msg.c_str(), sizeof(ev.msg));
  strlcpy(ev.id, id.c_str(), sizeof(ev.id));
  if (type == EV_ORDER_STATUS)
    strlcpy(ev.status, extra.c_str(), sizeof(ev.status));
  else
    strlcpy(ev.number, extra.c_str(), sizeof(ev.number));
  if (xQueueSend(eventQueue, &ev, pdMS_TO_TICKS(1000)) != pdTRUE && menu) delete menu;
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
bool clockReady() { return time(nullptr) > 1700000000; }

uint64_t nowMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return uint64_t(tv.tv_sec) * 1000ULL + tv.tv_usec / 1000;
}

// Same format as JavaScript's Date.toISOString(), which the POS sorts orders by
String isoNow() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  struct tm t;
  gmtime_r(&tv.tv_sec, &t);
  char date[24];
  strftime(date, sizeof(date), "%Y-%m-%dT%H:%M:%S", &t);
  char out[32];
  snprintf(out, sizeof(out), "%s.%03dZ", date, int(tv.tv_usec / 1000));
  return out;
}

// ---------------------------------------------------------------------------
// HTTPS
// ---------------------------------------------------------------------------
void addCommonHeaders(HTTPClient &http, bool withAuth) {
  if (withAuth) http.addHeader("Authorization", "Bearer " + idToken);
  if (strlen(FIREBASE_REFERER) > 0) http.addHeader("Referer", FIREBASE_REFERER);
}

int request(const char *method, const String &url, const String &body, const char *contentType, bool withAuth,
            String &response) {
  WiFiClientSecure client;
  client.setCACert(GOOGLE_ROOT_CA);
  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(15000);
  if (!http.begin(client, url)) return -1;
  if (contentType) http.addHeader("Content-Type", contentType);
  addCommonHeaders(http, withAuth);
  const int code = http.sendRequest(method, body);
  if (code > 0) response = http.getString();
  http.end();
  return code;
}

String errorMessage(int code, const String &response) {
  if (code < 0) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (" + HTTPClient::errorToString(code) + ")";
  JsonDocument doc;
  String detail;
  if (!deserializeJson(doc, response)) {
    detail = doc["error"]["message"] | "";
    if (detail.isEmpty()) detail = doc["error"]["status"] | "";
  }
  if (code == 403) return "ไม่มีสิทธิ์ (403) " + detail;
  if (code == 404) return "ไม่พบข้อมูล (404) " + detail;
  return "ผิดพลาด " + String(code) + " " + detail;
}

// ---------------------------------------------------------------------------
// Firebase anonymous sign-in (Identity Toolkit + Secure Token REST APIs)
// ---------------------------------------------------------------------------
void saveRefreshToken() {
  Preferences prefs;
  prefs.begin("fb", false);
  prefs.putString("rt", refreshToken);
  prefs.end();
}

bool useTokenResponse(const String &response, const char *idKey, const char *refreshKey, const char *expiresKey) {
  JsonDocument doc;
  if (deserializeJson(doc, response)) return false;
  const char *id = doc[idKey];
  const char *refresh = doc[refreshKey];
  if (!id || !refresh) return false;
  idToken = id;
  refreshToken = refresh;
  const long expiresIn = atol(doc[expiresKey] | "3600");
  tokenExpiresAt = millis() + uint32_t(expiresIn) * 1000UL;
  saveRefreshToken();
  return true;
}

bool signInAnonymously(String &err) {
  String response;
  const String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=") + FIREBASE_API_KEY;
  const int code = request("POST", url, "{\"returnSecureToken\":true}", "application/json", false, response);
  if (code == 200 && useTokenResponse(response, "idToken", "refreshToken", "expiresIn")) return true;
  err = code == 400 && response.indexOf("ADMIN_ONLY_OPERATION") >= 0
            ? String("ยังไม่ได้เปิด Anonymous sign-in ใน Firebase")
            : "เข้าสู่ระบบ Firebase ไม่ได้: " + errorMessage(code, response);
  return false;
}

bool refreshIdToken() {
  String response;
  const String url = String("https://securetoken.googleapis.com/v1/token?key=") + FIREBASE_API_KEY;
  const int code = request("POST", url, "grant_type=refresh_token&refresh_token=" + refreshToken,
                           "application/x-www-form-urlencoded", false, response);
  return code == 200 && useTokenResponse(response, "id_token", "refresh_token", "expires_in");
}

bool ensureSignedIn(String &err) {
  // Renew five minutes before the one-hour token runs out
  if (!idToken.isEmpty() && int32_t(tokenExpiresAt - millis()) > 5 * 60 * 1000) return true;
  // Reusing the stored user keeps one anonymous account per device instead of one per boot
  if (!refreshToken.isEmpty() && refreshIdToken()) return true;
  return signInAnonymously(err);
}

void loadMenu() {
  lastMenuAttempt = millis();
  String err;
  if (!ensureSignedIn(err)) {
    emit(EV_MENU_FAILED, false, err);
    return;
  }

  JsonDocument filter;
  buildMenuFilter(filter);

  WiFiClientSecure client;
  client.setCACert(GOOGLE_ROOT_CA);
  HTTPClient http;
  http.useHTTP10(true);  // no chunked encoding, so the body can be parsed straight from the socket
  http.setConnectTimeout(10000);
  http.setTimeout(20000);
  http.begin(client, FIRESTORE_BASE + "/public_menu/" + BRANCH_ID);
  addCommonHeaders(http, true);
  const int code = http.GET();
  if (code != 200) {
    const String response = code > 0 ? http.getString() : "";
    http.end();
    if (code == 401) idToken = "";
    emit(EV_MENU_FAILED, false,
         code == 404 ? String("ยังไม่มีเมนูของสาขานี้ — เปิดแอป POS (เครื่องร้าน) ให้เผยแพร่เมนูก่อน")
                     : "โหลดเมนูไม่ได้: " + errorMessage(code, response));
    return;
  }
  JsonDocument doc;
  const DeserializationError jsonErr = deserializeJson(doc, http.getStream(), DeserializationOption::Filter(filter),
                                                       DeserializationOption::NestingLimit(24));
  http.end();
  if (jsonErr) {
    emit(EV_MENU_FAILED, false, String("อ่านเมนูไม่ได้: ") + jsonErr.c_str());
    return;
  }
  Menu *menu = parseMenu(doc["fields"].as<JsonObjectConst>());
  doc.clear();
  if (menu->items.empty()) {
    delete menu;
    emit(EV_MENU_FAILED, false, "เมนูว่างเปล่า");
    return;
  }
  menuLoaded = true;
  emit(EV_MENU_LOADED, true, "", "", "", menu);
}

void track(const String &id) {
  for (const auto &t : tracked)
    if (t.id == id) return;
  if (tracked.size() >= MAX_TRACKED) tracked.erase(tracked.begin());
  Tracked t;
  t.id = id;
  t.status = "pending-qr";
  tracked.push_back(t);
}

void submitOrder(OrderDraft *draft) {
  std::unique_ptr<OrderDraft> d(draft);
  String err;
  if (!clockReady()) {
    emit(EV_ORDER_FAILED, false, "นาฬิกายังไม่ตั้งเวลา (รอเชื่อมอินเทอร์เน็ตสักครู่)", d->id);
    return;
  }
  if (!ensureSignedIn(err)) {
    emit(EV_ORDER_FAILED, false, err, d->id);
    return;
  }
  const String body = buildOrderBody(*d, isoNow());
  const String url = FIRESTORE_BASE + "/orders?documentId=" + d->id;
  String response;
  int code = request("POST", url, body, "application/json", true, response);
  if (code == 401) {  // token revoked or expired early: sign in again once
    idToken = "";
    if (ensureSignedIn(err)) code = request("POST", url, body, "application/json", true, response);
  }
  // 409: an earlier attempt that timed out on our side did reach Firestore
  if (code == 200 || code == 409) {
    track(d->id);
    lastStatusPoll = millis();
    emit(EV_ORDER_SENT, true, "", d->id, d->orderNumber);
    return;
  }
  emit(EV_ORDER_FAILED, false,
       code == 403 ? String("ร้านไม่รับออเดอร์นี้ (ตรวจสอบยอด/จำนวนรายการ หรือ firestore.rules)")
                   : "ส่งออเดอร์ไม่สำเร็จ: " + errorMessage(code, response),
       d->id);
}

bool isFinal(const String &status) { return status == "served" || status == "cancelled"; }

void pollStatuses() {
  lastStatusPoll = millis();
  String err;
  if (tracked.empty() || !ensureSignedIn(err)) return;
  for (auto &t : tracked) {
    if (isFinal(t.status)) continue;
    String response;
    const int code = request("GET", FIRESTORE_BASE + "/orders/" + t.id + "?mask.fieldPaths=status", "", nullptr, true,
                             response);
    String status;
    if (code == 200) {
      JsonDocument doc;
      if (deserializeJson(doc, response)) continue;
      status = fsString(doc["fields"]["status"]);
    } else if (code == 404) {
      status = "cancelled";  // deleted at the shop
    } else {
      if (code == 401) idToken = "";
      continue;
    }
    if (!status.isEmpty() && status != t.status) {
      t.status = status;
      emit(EV_ORDER_STATUS, true, "", t.id, status);
    }
  }
  tracked.erase(std::remove_if(tracked.begin(), tracked.end(), [](const Tracked &t) { return isFinal(t.status); }),
                tracked.end());
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------
void netTask(void *) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  bool wasOnline = false;
  uint32_t lastReconnect = millis();
  for (;;) {
    const bool online = WiFi.status() == WL_CONNECTED;
    if (online != wasOnline) {
      wasOnline = online;
      emit(EV_NET_STATE, online, online ? "Wi-Fi " + WiFi.localIP().toString() : String("กำลังเชื่อม Wi-Fi…"));
    }
    if (!online) {
      if (millis() - lastReconnect > 20000) {
        lastReconnect = millis();
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      }
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    Job job;
    if (xQueueReceive(jobQueue, &job, pdMS_TO_TICKS(300)) == pdTRUE) {
      switch (job.type) {
        case JOB_MENU: loadMenu(); break;
        case JOB_ORDER: submitOrder(job.draft); break;
        case JOB_RESET_ID:
          idToken = "";
          refreshToken = "";
          tokenExpiresAt = 0;
          saveRefreshToken();
          tracked.clear();
          break;
      }
      continue;
    }

    const uint32_t now = millis();
    if (now - lastMenuAttempt > (menuLoaded ? MENU_REFRESH_MS : MENU_RETRY_MS) || lastMenuAttempt == 0) {
      loadMenu();
    } else if (!tracked.empty() && now - lastStatusPoll > STATUS_POLL_MS) {
      pollStatuses();
    }
  }
}

}  // namespace

// ---------------------------------------------------------------------------
// Public API (called from the UI task)
// ---------------------------------------------------------------------------
void cloudBegin() {
  jobQueue = xQueueCreate(8, sizeof(Job));
  eventQueue = xQueueCreate(16, sizeof(NetEvent));
  Preferences prefs;
  prefs.begin("fb", true);
  refreshToken = prefs.getString("rt", "");
  prefs.end();
  xTaskCreatePinnedToCore(netTask, "net", 16 * 1024, nullptr, 1, nullptr, 0);
}

bool cloudPoll(NetEvent &ev) { return xQueueReceive(eventQueue, &ev, 0) == pdTRUE; }

void cloudRequestMenu() {
  Job job{JOB_MENU, nullptr};
  xQueueSend(jobQueue, &job, 0);
}

void cloudSubmitOrder(OrderDraft *draft) {
  Job job{JOB_ORDER, draft};
  if (xQueueSend(jobQueue, &job, 0) != pdTRUE) {
    emit(EV_ORDER_FAILED, false, "เครื่องกำลังทำงานอื่นอยู่ ลองใหม่อีกครั้ง", draft->id);
    delete draft;
  }
}

void cloudResetIdentity() {
  Job job{JOB_RESET_ID, nullptr};
  xQueueSend(jobQueue, &job, 0);
}

// Easy-to-read random characters (no 0/O or 1/I), as in src/utils/orderUtils.ts
static String randomSuffix(int length) {
  static const char alphabet[] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  String out;
  for (int i = 0; i < length; i++) out += alphabet[esp_random() % 32];
  return out;
}

String newOrderId() {
  String suffix = randomSuffix(6);
  suffix.toLowerCase();
  char ms[24];
  snprintf(ms, sizeof(ms), "%llu", (unsigned long long)nowMs());
  return String("ord-") + ms + "-" + suffix;
}

String newOrderNumber(const String &table) {
  String safe;
  for (size_t i = 0; i < table.length() && safe.length() < 8; i++) {
    const char c = table[i];
    if (isalnum(uint8_t(c)) || c == '-') safe += c;
  }
  if (safe.isEmpty()) safe = "0";
  return "#Q" + safe + "-" + randomSuffix(4);
}
