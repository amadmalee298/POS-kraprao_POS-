// คัดลอกไฟล์นี้เป็น include/config.h แล้วกรอกค่าของร้าน (config.h ไม่ถูก commit ขึ้น git)
// Copy to include/config.h and fill in your shop's values (config.h is git-ignored).
#pragma once

// --- Wi-Fi ร้าน (2.4 GHz เท่านั้น — ESP32 ไม่รองรับ 5 GHz) ---
#define WIFI_SSID      "ชื่อWiFiร้าน"
#define WIFI_PASSWORD  "รหัสWiFi"

// --- Firebase (ค่าเดียวกับ firebase-applet-config.json ของแอป POS) ---
#define FIREBASE_API_KEY     "AIza..."
#define FIREBASE_PROJECT_ID  "krua-kaprao-pos"
// ถ้า API key ถูกจำกัดด้วย HTTP referrer ใน Google Cloud Console ให้ใส่โดเมนเว็บ POS ที่อนุญาตไว้
// (เช่น "https://krua-kaprao-pos.firebaseapp.com/") ไม่ได้จำกัด = ปล่อยว่าง
#define FIREBASE_REFERER     ""

// --- สาขา: id เดียวกับ ?b= ในลิงก์ QR โต๊ะ (ตั้งค่า → QR สั่งอาหาร) ---
#define BRANCH_ID      "branch-1786349847821"

// --- เครื่องนี้ ---
#define DEVICE_NAME    "จอโต๊ะ 1"   // แสดงในบิลที่ POS: "สั่งจากจอ ESP32: จอโต๊ะ 1"
#define DEFAULT_TABLE  "1"          // โต๊ะเริ่มต้น (เปลี่ยนได้บนจอ) — "" = ให้เลือกทุกครั้ง
#define DEVICE_PIN     "1234"       // PIN สำหรับเข้าหน้าตั้งค่าบนจอ (เปลี่ยนโต๊ะ / รีโหลดเมนู)

// เวลาประเทศไทย (UTC+7) สำหรับแสดงนาฬิกา — ออเดอร์ส่งเวลาเป็น UTC เหมือนแอป POS
#define TZ_OFFSET_SEC  (7 * 3600)

// โหมดเครื่อง (เปลี่ยนได้ในหน้าตั้งค่าบนจอ)
// 0 = จอรับออเดอร์ (ลูกค้า/พนักงานสั่งอาหาร)
// 1 = จอแสดง QR ชำระเงินหน้าเคาน์เตอร์ (POS ส่งยอด+QR พร้อมเพย์มาแสดงให้ลูกค้าสแกน)
#define DEVICE_MODE    0
// โหมดจอ QR: ถามสถานะจาก Firestore ทุกกี่มิลลิวินาที (1 ครั้ง = อ่าน 1 document)
#define PAYMENT_POLL_MS 1500

// 1 = โต๊ะล็อก: เปลี่ยนเลขโต๊ะต้องใส่ PIN (จอติดโต๊ะลูกค้า)  0 = เปลี่ยนได้เลย (พนักงานถือรับออเดอร์)
#define LOCK_TABLE     1

// --- ฮาร์ดแวร์ ---
// 1 = ILI9341 (บอร์ด ESP32-2432S028R ทั่วไป, USB 1 ช่อง)
// 2 = ILI9341 แบบสีกลับ (ถ้าสีบนจอดูเพี้ยน/กลับสี ให้ลองค่านี้)
// 3 = ST7789 (บอร์ดรุ่น USB 2 ช่อง "CYD2USB")
#define CYD_PANEL        1
#define SCREEN_ROTATION  0   // 0 = แนวตั้ง, 2 = แนวตั้งกลับหัว
