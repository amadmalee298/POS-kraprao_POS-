/**
 * Notification Service for Kaprao POS Enterprise
 * Handles real-time Telegram Bot and LINE Notify alerts.
 * Supports dual-mode transport: Server API route or direct browser fallback for static GitHub Pages.
 * All messages extract 100% REAL data from store state (No fake fallback numbers).
 */

import { Order, Ingredient, Branch, SystemSettings } from '../types';

export interface NotificationCredentials {
  telegramToken: string;
  telegramChatId: string;
  lineToken: string;
}

export interface NotificationTriggers {
  dailySummary: boolean;
  lowStock: boolean;
  voidOrder: boolean;
  newOrder: boolean;
  kdsDelay: boolean;
}

export interface NotificationRules {
  minOrderAmount: number;
  selectedCategories: string[];
  minVoidAmount: number;
  onlyCriticalStock: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  dailySummaryTime: string; // e.g. "22:00"
}

export type NotificationTriggerRules = NotificationRules;

export interface NotificationLogItem {
  id: string;
  time: string;
  date: string;
  channel: 'LINE' | 'Telegram' | 'Both';
  event: string;
  status: string;
  recipient: string;
}

const STORAGE_KEYS = {
  TELEGRAM_TOKEN: 'kaprao_telegram_token',
  TELEGRAM_CHAT_ID: 'kaprao_telegram_chat_id',
  LINE_TOKEN: 'kaprao_line_token',
  TRIGGERS: 'kaprao_notification_triggers',
  RULES: 'kaprao_notification_rules',
  LOGS: 'kaprao_notification_logs',
  LAST_DAILY_DATE: 'kaprao_last_daily_summary_date',
  LAST_LOW_STOCK_ALERT: 'kaprao_last_low_stock_alert_time',
};

export const DEFAULT_TRIGGERS: NotificationTriggers = {
  dailySummary: true,
  lowStock: true,
  voidOrder: true,
  newOrder: true,
  kdsDelay: false,
};

export const DEFAULT_RULES: NotificationRules = {
  minOrderAmount: 0, // 0 = แจ้งเตือนทุกยอดขาย
  selectedCategories: ['all'],
  minVoidAmount: 100,
  onlyCriticalStock: false,
  quietHoursEnabled: false,
  quietHoursStart: '00:00',
  quietHoursEnd: '06:00',
  dailySummaryTime: '22:00',
};

// ==========================================
// LocalStorage Persistence Helpers
// ==========================================

export function getStoredCredentials(): NotificationCredentials {
  return {
    telegramToken: localStorage.getItem(STORAGE_KEYS.TELEGRAM_TOKEN) || '',
    telegramChatId: localStorage.getItem(STORAGE_KEYS.TELEGRAM_CHAT_ID) || '',
    lineToken: localStorage.getItem(STORAGE_KEYS.LINE_TOKEN) || '',
  };
}

export function saveStoredCredentials(creds: Partial<NotificationCredentials>) {
  if (creds.telegramToken !== undefined) {
    localStorage.setItem(STORAGE_KEYS.TELEGRAM_TOKEN, creds.telegramToken.trim());
  }
  if (creds.telegramChatId !== undefined) {
    localStorage.setItem(STORAGE_KEYS.TELEGRAM_CHAT_ID, creds.telegramChatId.trim());
  }
  if (creds.lineToken !== undefined) {
    localStorage.setItem(STORAGE_KEYS.LINE_TOKEN, creds.lineToken.trim());
  }
}

export function getStoredTriggers(): NotificationTriggers {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRIGGERS);
    if (raw) return { ...DEFAULT_TRIGGERS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_TRIGGERS;
}

export function saveStoredTriggers(triggers: NotificationTriggers) {
  localStorage.setItem(STORAGE_KEYS.TRIGGERS, JSON.stringify(triggers));
}

export function getStoredRules(): NotificationRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RULES);
    if (raw) return { ...DEFAULT_RULES, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_RULES;
}

export function saveStoredRules(rules: NotificationRules) {
  localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(rules));
}

export function getStoredLogs(): NotificationLogItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

export function addStoredLog(item: Omit<NotificationLogItem, 'id' | 'time' | 'date'>) {
  try {
    const logs = getStoredLogs();
    const newLog: NotificationLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: 'วันนี้',
      ...item,
    };
    const updated = [newLog, ...logs].slice(0, 30);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updated));
    return newLog;
  } catch {
    return null;
  }
}

// ==========================================
// Transport: Telegram & LINE Sending
// ==========================================

export interface SendResult {
  success: boolean;
  channel: 'telegram' | 'line';
  method: 'server' | 'direct';
  error?: string;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  message: string
): Promise<SendResult> {
  const cleanToken = token.trim().startsWith('bot') ? token.trim().slice(3) : token.trim();
  const cleanChatId = chatId.trim();

  if (!cleanToken || !cleanChatId) {
    return {
      success: false,
      channel: 'telegram',
      method: 'direct',
      error: 'กรุณาระบุ Telegram Bot Token และ Chat ID',
    };
  }

  // 1. Try Server-side proxy first (if server is running)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch('/api/notify/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: cleanToken,
        chatId: cleanChatId,
        message,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        return { success: true, channel: 'telegram', method: 'server' };
      }
    }
  } catch {
    // Server proxy failed or not available (e.g. running statically on GitHub Pages)
  }

  // 2. Direct client-side fetch to Telegram Bot API (Always works directly from browser & GitHub Pages)
  try {
    const telegramUrl = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: message,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) {
      return { success: true, channel: 'telegram', method: 'direct' };
    }

    return {
      success: false,
      channel: 'telegram',
      method: 'direct',
      error: data.description || `Telegram Error HTTP ${response.status}`,
    };
  } catch (err: any) {
    return {
      success: false,
      channel: 'telegram',
      method: 'direct',
      error: err.message || 'ไม่สามารถเชื่อมต่อกับ Telegram Bot API ได้ (โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต)',
    };
  }
}

export async function sendLineMessage(
  token: string,
  message: string
): Promise<SendResult> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return {
      success: false,
      channel: 'line',
      method: 'server',
      error: 'กรุณาระบุ LINE Notify Token',
    };
  }

  try {
    const res = await fetch('/api/notify/line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineToken: cleanToken,
        message,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, channel: 'line', method: 'server' };
    }

    return {
      success: false,
      channel: 'line',
      method: 'server',
      error: data.error || 'ส่ง LINE Notify ไม่สำเร็จ (LINE API ต้องการ Server Proxy)',
    };
  } catch (err: any) {
    return {
      success: false,
      channel: 'line',
      method: 'server',
      error: err.message || 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ LINE Notify ได้',
    };
  }
}

export function isQuietHours(rules: NotificationRules): boolean {
  if (!rules.quietHoursEnabled) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (rules.quietHoursStart || '00:00').split(':').map(Number);
  const [endH, endM] = (rules.quietHoursEnd || '06:00').split(':').map(Number);

  const startTotal = (startH || 0) * 60 + (startM || 0);
  const endTotal = (endH || 0) * 60 + (endM || 0);

  if (startTotal <= endTotal) {
    return currentMinutes >= startTotal && currentMinutes <= endTotal;
  }
  // Crosses midnight (e.g. 23:00 to 06:00)
  return currentMinutes >= startTotal || currentMinutes <= endTotal;
}

/**
 * High-level notification dispatcher
 */
export async function dispatchNotification(
  eventTitle: string,
  message: string,
  options?: {
    force?: boolean;
    channelOverride?: 'telegram' | 'line' | 'both';
  }
): Promise<{ success: boolean; results: SendResult[]; summary: string }> {
  const creds = getStoredCredentials();
  const rules = getStoredRules();

  if (!options?.force && isQuietHours(rules)) {
    return {
      success: false,
      results: [],
      summary: `อยู่ในช่วงเวลาห้ามรบกวน (${rules.quietHoursStart} - ${rules.quietHoursEnd} น.) ข้ามการแจ้งเตือน`,
    };
  }

  const results: SendResult[] = [];
  const channel = options?.channelOverride || 'both';

  // Send Telegram
  if ((channel === 'both' || channel === 'telegram') && creds.telegramToken && creds.telegramChatId) {
    const tgRes = await sendTelegramMessage(creds.telegramToken, creds.telegramChatId, message);
    results.push(tgRes);

    addStoredLog({
      channel: 'Telegram',
      event: eventTitle,
      status: tgRes.success ? `ส่งสำเร็จ (200 OK - ${tgRes.method})` : `ล้มเหลว (${tgRes.error})`,
      recipient: `Chat ID: ${creds.telegramChatId}`,
    });
  }

  // Send LINE
  if ((channel === 'both' || channel === 'line') && creds.lineToken) {
    const lineRes = await sendLineMessage(creds.lineToken, message);
    results.push(lineRes);

    addStoredLog({
      channel: 'LINE',
      event: eventTitle,
      status: lineRes.success ? 'ส่งสำเร็จ (200 OK)' : `ล้มเหลว (${lineRes.error})`,
      recipient: 'LINE Notify Group',
    });
  }

  const atLeastOneSuccess = results.some(r => r.success);
  return {
    success: atLeastOneSuccess,
    results,
    summary: atLeastOneSuccess
      ? 'ส่งการแจ้งเตือนสำเร็จ'
      : results.length === 0
      ? 'ไม่มีการตั้งค่า Token หรือ Chat ID สำหรับส่งการแจ้งเตือน'
      : `การแจ้งเตือนล้มเหลว: ${results.map(r => r.error).filter(Boolean).join(', ')}`,
  };
}

// ==========================================
// Real Data Message Generators (100% Reality)
// ==========================================

export function generateDailySummaryMessage(
  orders: Order[],
  ingredients: Ingredient[],
  branch?: Branch,
  settings?: SystemSettings
): string {
  const shopName = settings?.shopName || 'บริษัท กะเพรา เอ็นเตอร์ไพรส์ จำกัด (สำนักงานใหญ่)';
  const branchName = branch?.name || 'ครัวกะเพรา ตลาด กกท';
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const dateThai = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const timeThai = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  // Filter today's real orders
  const todayOrders = orders.filter(o => {
    const oDate = o.createdAt ? o.createdAt.split('T')[0] : '';
    return oDate === todayStr && o.status !== 'cancelled';
  });

  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const billCount = todayOrders.length;
  const avgBill = billCount > 0 ? todayRevenue / billCount : 0;

  // Real channel breakdown
  const posOrders = todayOrders.filter(o => !o.isQrOrder && (o.orderType === 'dine-in' || o.orderType === 'takeaway' || !o.orderType));
  const qrOrders = todayOrders.filter(o => o.isQrOrder || (o as any).orderType === 'qr');
  const deliveryOrders = todayOrders.filter(o => o.orderType === 'delivery');

  const posTotal = posOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const qrTotal = qrOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const deliveryTotal = deliveryOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);

  // Real payment breakdown
  const cashOrders = todayOrders.filter(o => o.paymentMethod === 'cash');
  const promptPayOrders = todayOrders.filter(o => o.paymentMethod === 'promptpay' || o.paymentMethod === 'transfer');
  const creditOrders = todayOrders.filter(o => o.paymentMethod === 'credit');
  const trueMoneyOrders = todayOrders.filter(o => o.paymentMethod === 'truemoney');

  const cashTotal = cashOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const promptPayTotal = promptPayOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const creditTotal = creditOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  const trueMoneyTotal = trueMoneyOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);

  // Real Top 3 Best-Selling Menu Items
  const itemCounts: Record<string, { qty: number; totalSales: number }> = {};
  todayOrders.forEach(o => {
    o.items?.forEach(it => {
      const name = it.menuItem?.name || 'รายการทั่วไป';
      if (!itemCounts[name]) {
        itemCounts[name] = { qty: 0, totalSales: 0 };
      }
      itemCounts[name].qty += it.quantity || 1;
      itemCounts[name].totalSales += it.totalPrice || 0;
    });
  });

  const sortedItems = Object.entries(itemCounts)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 3);

  const topItemsText = sortedItems.length > 0
    ? sortedItems.map((item, idx) => `  ${idx + 1}. ${item[0]} (${item[1].qty} จาน)`).join('\n')
    : '  (ยังไม่มีรายการขายในวันนี้)';

  // Real low stock count
  const lowStockCount = ingredients.filter(i => i.currentStock <= i.minStockAlert).length;
  const stockSummaryLine = lowStockCount > 0
    ? `⚠️ สถานะสต็อก: พบวัตถุดิบใกล้หมด ${lowStockCount} รายการ`
    : '✅ สถานะสต็อก: วัตถุดิบทุกรายการอยู่ในเกณฑ์ปกติ';

  // Format channels cleanly (only show real channels)
  const channelLines: string[] = [];
  channelLines.push(`  • หน้าร้าน (POS): ฿${posTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${posOrders.length} บิล)`);
  if (qrOrders.length > 0) {
    channelLines.push(`  • สแกนสั่งโต๊ะ (QR): ฿${qrTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${qrOrders.length} บิล)`);
  }
  if (deliveryOrders.length > 0) {
    channelLines.push(`  • เดลิเวอรี่ (Delivery): ฿${deliveryTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${deliveryOrders.length} บิล)`);
  }

  // Format payments cleanly
  const paymentLines: string[] = [];
  paymentLines.push(`  • เงินสด (Cash): ฿${cashTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`);
  paymentLines.push(`  • สแกนโอน (PromptPay/QR): ฿${promptPayTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`);
  if (creditOrders.length > 0) {
    paymentLines.push(`  • บัตรเครดิต (Credit): ฿${creditTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`);
  }
  if (trueMoneyOrders.length > 0) {
    paymentLines.push(`  • TrueMoney Wallet: ฿${trueMoneyTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`);
  }

  return `📊 [${shopName}] - สรุปยอดขายประจำวัน
📅 วันที่: ${dateThai} | เวลา: ${timeThai} น.
🏪 สาขา: ${branchName}
──────────────────────────────
💰 ยอดขายรวมสุทธิ: ฿${todayRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
🧾 จำนวนออเดอร์ขาย: ${billCount} บิล (เฉลี่ย ฿${avgBill.toFixed(2)}/บิล)

💳 สรุปยอดขายตามช่องทาง:
${channelLines.join('\n')}

💵 สรุปยอดตามวิธีชำระเงิน:
${paymentLines.join('\n')}

🏆 เมนูขายดีท็อป 3 ประจำวัน:
${topItemsText}

${stockSummaryLine}
──────────────────────────────
✅ สรุปยอดขายจากข้อมูลจริงเรียบร้อยแล้ว`;
}

export function generateNewOrderMessage(
  order: Order,
  branch?: Branch,
  settings?: SystemSettings
): string {
  const shopName = settings?.shopName || 'ครัวกะเพรา POS';
  const branchName = branch?.name || 'ครัวกะเพรา ตลาด กกท';
  const now = new Date();
  const timeThai = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  const channelText = order.orderType === 'dine-in'
    ? `โต๊ะ ${order.tableNumber || 'หน้าร้าน'}`
    : order.orderType === 'takeaway'
    ? 'สั่งกลับบ้าน (Takeaway)'
    : order.orderType === 'delivery'
    ? 'เดลิเวอรี่ (Delivery)'
    : 'สแกนสั่งอาหาร (QR Order)';

  const paymentText = order.paymentMethod === 'cash'
    ? 'เงินสด (Cash)'
    : order.paymentMethod === 'promptpay'
    ? 'พร้อมเพย์ / สแกนโอน QR'
    : order.paymentMethod === 'credit'
    ? 'บัตรเครดิต'
    : order.paymentMethod === 'truemoney'
    ? 'TrueMoney Wallet'
    : 'ชำระเงินเรียบร้อย';

  const itemsList = order.items && order.items.length > 0
    ? order.items.map(it => {
        const addOnsText = it.selectedAddOns && it.selectedAddOns.length > 0
          ? ` (+${it.selectedAddOns.map(a => a.name).join(', ')})`
          : '';
        return `  • ${it.menuItem?.name || 'เมนู'} x${it.quantity}${addOnsText} (฿${(it.totalPrice || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })})`;
      }).join('\n')
    : '  • รายการอาหารทั่วไป';

  return `🔔 [NEW ORDER] มีออเดอร์ใหม่เข้าจากลูกค้า!
🏪 สาขา: ${branchName}
🪑 โต๊ะ / ช่องทาง: ${channelText}
🧾 เลขออเดอร์: ${order.orderNumber}
🕒 เวลาที่สั่ง: ${timeThai} น.
──────────────────────────────
🍲 รายการอาหารที่สั่ง (${order.items?.length || 0} รายการ):
${itemsList}

💰 ยอดเงินรวมทั้งสิ้น: ฿${(order.grandTotal || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} (${paymentText})
🍳 สถานะครัว: ส่งเข้าคิวทำอาหารเรียบร้อยแล้ว`;
}

export function generateVoidOrderMessage(
  order: Order,
  reason: string,
  note?: string,
  staffName?: string,
  branch?: Branch
): string {
  const branchName = branch?.name || 'ครัวกะเพรา ตลาด กกท';
  const now = new Date();
  const timeThai = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  const itemsList = order.items && order.items.length > 0
    ? order.items.map(it => `  • ${it.menuItem?.name || 'เมนู'} x${it.quantity} (฿${(it.totalPrice || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })})`).join('\n')
    : '  • รายการอาหารทั่วไป';

  return `❌ [SECURITY ALERT] แจ้งเตือนการยกเลิกบิล / คืนเงิน
🏪 สาขา: ${branchName}
🧾 บิลเลขที่: ${order.orderNumber}
🕒 เวลาทำรายการ: ${timeThai} น.
──────────────────────────────
💵 ยอดเงินที่ยกเลิก: ฿${(order.grandTotal || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
👤 พนักงานขาย: ${staffName || 'เจ้าหน้าที่ประจำเครื่อง'}
📝 เหตุผลที่ยกเลิก: ${reason}${note ? ` (${note})` : ''}

📋 รายการอาหารในบิลที่ยกเลิก:
${itemsList}`;
}

export function generateLowStockMessage(
  lowStockItems: Ingredient[],
  branch?: Branch,
  onlyCritical = false
): string {
  const branchName = branch?.name || 'ครัวกะเพรา ตลาด กกท';
  const now = new Date();
  const timeThai = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  if (lowStockItems.length === 0) {
    return `✅ [STOCK HEALTH] ตรวจสอบสต็อกวัตถุดิบ
🏪 สาขา: ${branchName}
🕒 เวลาตรวจ: ${timeThai} น.
──────────────────────────────
วัตถุดิบทุกรายการอยู่ในเกณฑ์ปกติ ไม่พบสินค้าใกล้หมดสต็อก`;
  }

  const itemsList = lowStockItems.map((ing, idx) => {
    return `  ${idx + 1}. ${ing.name} (เหลือ: ${ing.currentStock} ${ing.unit} | เกณฑ์เตือน: ${ing.minStockAlert} ${ing.unit})`;
  }).join('\n');

  return `⚠️ [ALERT] แจ้งเตือนวัตถุดิบใกล้หมดสต็อก!
🏪 สาขา: ${branchName}
🕒 เวลาตรวจพบ: ${timeThai} น.
⚙️ โหมดตรวจเช็ค: ${onlyCritical ? 'สต็อกวิกฤต (<= 20% ของเกณฑ์)' : 'ต่ำกว่าเกณฑ์สั่งซื้อด่วน'}
──────────────────────────────
📦 รายการวัตถุดิบที่ต้องสั่งเพิ่ม (${lowStockItems.length} รายการ):
${itemsList}

💡 คำแนะนำ: โปรดดำเนินการสั่งซื้อวัตถุดิบเพิ่มเติมจาก Supplier เพื่อป้องกันสินค้าขาดหน้าร้าน`;
}

export function generateKdsDelayMessage(
  order?: Order,
  branch?: Branch,
  delayMinutes = 15
): string {
  const branchName = branch?.name || 'ครัวกะเพรา ตลาด กกท';
  const tableText = order?.tableNumber ? `โต๊ะ ${order.tableNumber}` : 'ออเดอร์หน้าร้าน/กลับบ้าน';
  const orderNum = order?.orderNumber || '#ORD-KDS-PENDING';
  const itemsText = order?.items && order.items.length > 0
    ? order.items.map(it => `  • ${it.menuItem?.name || 'เมนู'} x${it.quantity}`).join('\n')
    : '  • รายการอาหารในครัว';

  return `⏰ [KDS DELAY WARNING] แจ้งเตือนออเดอร์ช้าเกินกำหนดในครัว!
🏪 สาขา: ${branchName}
🪑 โต๊ะ / ช่องทาง: ${tableText}
🧾 เลขออเดอร์: ${orderNum}
⏱️ รอนานแล้ว: เกินกว่า ${delayMinutes} นาที
──────────────────────────────
🍳 เมนูที่กำลังทำค้างอยู่:
${itemsText}

💡 โปรดประสานงานเชฟในครัวเพื่อเร่งปรุงอาหารให้ลูกค้าทันที`;
}
