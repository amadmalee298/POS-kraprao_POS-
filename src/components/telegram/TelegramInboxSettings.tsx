import React, { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { getStoredCredentials } from '../../services/notificationService';
import { clientClaudeKey, vercelBase } from '../../services/receiptScan';
import { INBOX_STATUS_EVENT, inboxEnabledHere, readInboxStatus, setInboxEnabledHere } from '../../services/telegramInbox';
import { hasBackend } from '../../utils/apiClient';

/** Switch this device on as the one that receives receipt photos from Telegram, with setup steps. */
export const TelegramInboxSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(inboxEnabledHere);
  const [status, setStatus] = useState(readInboxStatus);

  useEffect(() => {
    const refresh = () => {
      setEnabled(inboxEnabledHere());
      setStatus(readInboxStatus());
    };
    window.addEventListener(INBOX_STATUS_EVENT, refresh);
    return () => window.removeEventListener(INBOX_STATUS_EVENT, refresh);
  }, []);

  const creds = getStoredCredentials();
  const aiReady = hasBackend() || !!vercelBase() || !!clientClaudeKey();

  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-3 shadow-xl text-xs text-slate-300">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sky-300 font-bold text-sm">
          <Inbox className="w-5 h-5" /> รับบิลจาก Telegram (ส่งรูปใบเสร็จ/บิลเงินสด → รออนุมัติ)
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="รับบิลจาก Telegram ที่เครื่องนี้"
          onClick={() => setInboxEnabledHere(!enabled)}
          className={`w-12 h-7 rounded-full p-1 transition shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
        >
          <span className={`block w-5 h-5 rounded-full bg-white transition ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      <p className="text-slate-400">
        เปิดที่ <strong>เครื่องเดียว</strong> ที่เปิดแอปค้างไว้ในร้าน (เช่น แท็บเล็ตแคชเชียร์) เครื่องนี้จะเช็กบอททุก 20 วินาที อ่านยอดด้วย AI
        แล้วส่งเข้า “การเงิน → บิลจาก Telegram” ให้ผู้จัดการอนุมัติ
      </p>

      {enabled && (
        <div className={`p-3 rounded-xl border ${status.error ? 'bg-rose-950/40 border-rose-800/60 text-rose-200' : 'bg-emerald-950/30 border-emerald-700/40 text-emerald-200'}`}>
          {status.error
            ? `ยังรับบิลไม่ได้: ${status.error}`
            : status.lastCheck
              ? `กำลังรับบิล · เช็กล่าสุด ${new Date(status.lastCheck).toLocaleTimeString('th-TH')}`
              : 'กำลังเริ่ม...'}
        </div>
      )}
      {status.ignoredChatId && status.ignoredChatId !== creds.telegramChatId && (
        <p className="text-amber-300">
          มีรูปส่งมาจากแชทอื่น (Chat ID {status.ignoredChatId}{status.ignoredChatName ? ` · ${status.ignoredChatName}` : ''}) ระบบไม่รับเพื่อความปลอดภัย
          ถ้าเป็นแชทของร้าน ให้ใส่ Chat ID นี้ในช่อง Group Chat ID แล้วบันทึก
        </p>
      )}
      {!aiReady && (
        <p className="text-amber-300">
          ยังไม่มี AI อ่านบิล: ใส่ ANTHROPIC_API_KEY ใน Vercel (แล้ววางลิงก์ Vercel ในช่องตัวส่ง LINE) หรือใส่ Claude API Key ที่ปุ่ม “AI ใบเสร็จ” ในหน้าการเงิน
          (ไม่มี AI ก็ยังรับรูปได้ แต่ต้องกรอกยอดเอง)
        </p>
      )}

      <details className="rounded-2xl bg-slate-950 border border-slate-800 p-3">
        <summary className="font-bold cursor-pointer">วิธีตั้งค่า</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1.5">
          <li>ใส่ Telegram Bot Token และ Group Chat ID ด้านบน แล้วกดบันทึก (ใช้บอทและกลุ่มเดียวกับการแจ้งเตือน)</li>
          <li>
            ถ้าส่งรูปในกลุ่ม: ใน Telegram คุยกับ <strong>@BotFather</strong> พิมพ์ /setprivacy เลือกบอทของร้าน แล้วเลือก <strong>Disable</strong> (ไม่เช่นนั้นบอทจะไม่เห็นรูปในกลุ่ม)
            หรือตั้งบอทเป็นแอดมินของกลุ่ม
          </li>
          <li>เปิดสวิตช์ด้านบนที่เครื่องที่เปิดแอปค้างไว้</li>
          <li>ส่งรูปใบเสร็จหรือบิลเงินสดเข้ากลุ่ม บอทจะตอบว่า “รับบิลแล้ว รออนุมัติ” พร้อมยอดที่อ่านได้ ถ้าเป็นเงินรับ ให้พิมพ์ “รายรับ” ใต้รูป</li>
          <li>ผู้จัดการเปิด “การเงิน → บิลจาก Telegram” ตรวจ แก้ไข แล้วกดอนุมัติ ระบบบันทึกเป็นค่าใช้จ่าย/รายรับพร้อมรูปบิล และบอทแจ้งกลับในกลุ่ม</li>
        </ol>
      </details>
    </div>
  );
};
