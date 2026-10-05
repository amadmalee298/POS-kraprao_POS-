import React, { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { getStoredCredentials } from '../../services/notificationService';
import { clientClaudeKey, vercelBase } from '../../services/receiptScan';
import { INBOX_STATUS_EVENT, inboxEnabledHere, keepAwakeHere, readInboxStatus, setInboxEnabledHere, setKeepAwakeHere } from '../../services/telegramInbox';
import { BotMode, readBotMode, writeBotMode } from '../../services/telegramBot';
import { hasBackend } from '../../utils/apiClient';
import { usePOS } from '../../context/POSContext';
import { updateServerBotConfig } from '../../services/telegramServer';
import { TelegramServerSettings, useServerBot } from './TelegramServerSettings';

/** Switch this device on as the one that receives receipt photos from Telegram, with setup steps. */
export const TelegramInboxSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(inboxEnabledHere);
  const [status, setStatus] = useState(readInboxStatus);
  const [keepAwake, setKeepAwake] = useState(keepAwakeHere);
  const [mode, setMode] = useState<BotMode>(readBotMode);
  const { currentBranch } = usePOS();
  const bot = useServerBot();
  const chooseMode = (m: BotMode) => {
    writeBotMode(m);
    setMode(m);
    // The bot on the server reads it from the shop's settings
    if (bot.onServer && currentBranch?.id) void updateServerBotConfig(currentBranch.id, { mode: m });
  };
  // Every device shows the mode the server uses
  useEffect(() => {
    const m = bot.config?.mode;
    if (bot.onServer && (m === 'auto' || m === 'approve') && m !== mode) {
      writeBotMode(m);
      setMode(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.onServer, bot.config?.mode]);

  useEffect(() => {
    const refresh = () => {
      setEnabled(inboxEnabledHere());
      setStatus(readInboxStatus());
      setKeepAwake(keepAwakeHere());
    };
    window.addEventListener(INBOX_STATUS_EVENT, refresh);
    return () => window.removeEventListener(INBOX_STATUS_EVENT, refresh);
  }, []);

  const creds = getStoredCredentials();
  const aiReady = hasBackend() || !!vercelBase() || !!clientClaudeKey();

  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-3 shadow-xl text-xs text-slate-300">
      <div className="flex items-center gap-2 text-sky-300 font-bold text-sm">
        <Inbox className="w-5 h-5" /> บอทบันทึกบัญชีใน Telegram (ส่งสลิป/บิล หรือพิมพ์จด)
      </div>
      <p className="text-slate-400">
        บอทอ่านสลิป/บิลด้วย AI แล้วตอบกลับเป็นการ์ดสรุปพร้อมปุ่ม ดูใบแทนใบเสร็จ · เพิ่มรูป · แก้ไข · ลบ เหมือนบอทบัญชีใน LINE
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="วิธีบันทึกบิลจาก Telegram">
        {(
          [
            ['auto', 'บันทึกทันที (แนะนำ)', 'ส่งสลิปแล้วบันทึกเป็นรายจ่ายเลย สร้างใบรับรองแทนใบเสร็จให้อัตโนมัติ แก้ไข/ลบได้จากปุ่มในแชท'],
            ['approve', 'รอผู้จัดการอนุมัติ', 'บิลเข้า “การเงิน → บิลจาก Telegram” ให้ผู้จัดการตรวจก่อน และรับของเข้าสต็อกได้ตอนอนุมัติ']
          ] as [BotMode, string, string][]
        ).map(([m, label, hint]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => chooseMode(m)}
            className={`text-left p-3 rounded-2xl border transition ${mode === m ? 'border-sky-500 bg-sky-950/40 text-sky-100' : 'border-slate-700 text-slate-300'}`}
          >
            <div className="font-bold">{mode === m ? '◉' : '○'} {label}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>
          </button>
        ))}
      </div>

      <TelegramServerSettings bot={bot} />

      {!bot.onServer && (
        <div className="p-4 rounded-2xl border border-slate-700 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-slate-100">หรือ: รับบิลที่เครื่องนี้ (ต้องเปิดแอปค้างไว้)</div>
              <div className="text-[11px] text-slate-400">ใช้เมื่อยังไม่มีเว็บ Vercel · เปิดที่เครื่องเดียว เช่น แท็บเล็ตแคชเชียร์</div>
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
      {enabled && (
        <div className={`p-3 rounded-xl border ${status.error ? 'bg-rose-950/40 border-rose-800/60 text-rose-200' : 'bg-emerald-950/30 border-emerald-700/40 text-emerald-200'}`}>
          {status.error
            ? `ยังรับบิลไม่ได้: ${status.error}`
            : status.lastCheck
              ? `บอททำงานอยู่ · เช็กล่าสุด ${new Date(status.lastCheck).toLocaleTimeString('th-TH')}`
              : 'กำลังเริ่ม...'}
        </div>
      )}
      {enabled && (
        <div className="p-3 rounded-xl border border-amber-700/50 bg-amber-950/30 text-amber-100 space-y-2">
          <p>
            ⚠️ บอททำงานเฉพาะตอนที่แอปนี้ <strong>เปิดอยู่บนหน้าจอ</strong> ถ้าสลับไปแอปอื่นหรือจอดับ iPhone/iPad จะหยุดแอปไว้
            ข้อความที่ส่งเข้ามาระหว่างนั้นไม่หาย บอทจะตอบทั้งหมดทันทีเมื่อกลับมาเปิดแอป
          </p>
          <p className="text-amber-200/80">แนะนำ: ใช้แท็บเล็ตหรือมือถือเครื่องเก่าที่เสียบชาร์จ เปิดแอปค้างไว้ที่ร้าน และเปิด “กันหน้าจอดับ” ด้านล่าง</p>
          <label className="flex items-center gap-2 text-slate-100">
            <input type="checkbox" checked={keepAwake} onChange={e => setKeepAwakeHere(e.target.checked)} className="w-5 h-5 accent-orange-500" />
            กันหน้าจอดับขณะเปิดแอปนี้ (เครื่องนี้)
          </label>
        </div>
      )}
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
          <li>ใส่ Telegram Bot Token และ Group Chat ID ด้านบน แล้วกดบันทึก (ใช้บอทและกลุ่มเดียวกับการแจ้งเตือน หรือใช้แชทส่วนตัวกับบอทก็ได้)</li>
          <li>
            ถ้าใช้ในกลุ่ม: ใน Telegram คุยกับ <strong>@BotFather</strong> พิมพ์ /setprivacy เลือกบอทของร้าน แล้วเลือก <strong>Disable</strong> (ไม่เช่นนั้นบอทจะไม่เห็นรูปและข้อความในกลุ่ม)
            หรือตั้งบอทเป็นแอดมินของกลุ่ม
          </li>
          <li>
            <strong>แนะนำ — บอทบนเซิร์ฟเวอร์:</strong> ใส่ลิงก์เว็บ Vercel ของร้านในช่อง “ที่อยู่ตัวส่ง LINE (Vercel)”, ใส่ ANTHROPIC_API_KEY ใน Vercel
            (Settings → Environment Variables แล้ว Redeploy), กด “เชื่อมบัญชีร้าน” ที่เครื่องนี้ แล้วกด “ย้ายบอทไปทำงานบนเซิร์ฟเวอร์”
            (เอกสารลง Google Drive: แอปเครื่องใดก็ได้ที่เปิดอยู่จะเก็บให้เองภายหลัง)
          </li>
          <li>หรือถ้ายังไม่มี Vercel: เปิดสวิตช์ “รับบิลที่เครื่องนี้” ที่เครื่องที่เปิดแอปค้างไว้</li>
          <li>พิมพ์ <strong>/menu</strong> ในแชท จะมีปุ่มเมนูขึ้นใต้ช่องพิมพ์</li>
          <li>
            <strong>ส่งบิล:</strong> ส่งรูปสลิปโอนเงิน ใบเสร็จ หรือบิลเงินสด บอทตอบ “✅ บันทึกเรียบร้อย” พร้อมการ์ดสรุป (ยอด วันที่ หมวดหมู่ ร้านค้า เอกสาร)
            ถ้าเป็นเงินรับ ให้พิมพ์ “รายรับ” ใต้รูป
          </li>
          <li>
            <strong>พิมพ์จด:</strong> พิมพ์ <code>จ่าย ค่าผัก 135 บาท ร้านค้า ป้าแดง</code> หรือ <code>รับ 500 ค่าจัดเลี้ยง</code> (ใส่ <code>วันที่ 5/10/69</code> ได้ ไม่ใส่ = วันนี้)
          </li>
          <li>
            <strong>ปุ่มใต้การ์ด:</strong> 📄 ดูใบแทนใบเสร็จ (เปิดหน้าเอกสาร พิมพ์/บันทึก PDF ได้) · ➕ เพิ่มรูปสินค้า (ส่งหลายรูปพร้อมกันได้) · ✏️ แก้ไข หมวดหมู่/ยอด/รายการ/วันที่/ร้านค้า/โน้ต · 🗑 ลบ
          </li>
          <li>
            <strong>เมนู:</strong> 📊 สรุปวันนี้ / 📅 สรุปเดือนนี้ (ยอดขาย รายรับ รายจ่าย คงเหลือ) · 🧾 รายการล่าสุด · 📁 Google Drive (พิมพ์ “ขอ link google drive” ก็ได้)
          </li>
          <li>ลายเซ็นผู้เบิกและผู้อนุมัติบนใบรับรองแทนใบเสร็จ เซ็นได้ในหน้า “การเงิน → ค่าใช้จ่าย” ของระบบ POS</li>
        </ol>
      </details>
    </div>
  );
};
