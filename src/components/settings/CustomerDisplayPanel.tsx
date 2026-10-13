import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, QrCode } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { publishPaymentDisplay } from '../../services/firebaseService';
import {
  idleDisplay,
  onCustomerDisplayEnabledChange,
  readCustomerDisplayEnabled,
  waitingDisplay,
  writeCustomerDisplayEnabled
} from '../../utils/customerDisplay';
import { generatePromptPayPayload, resolvePromptPayId } from '../../utils/promptpay';

const TEST_MS = 15_000;

/** Customer payment display at the counter (ESP32 2.8" in payment mode): on/off for this device */
export const CustomerDisplayPanel: React.FC = () => {
  const { settings, currentBranch } = usePOS();
  const [on, setOn] = useState(readCustomerDisplayEnabled);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => onCustomerDisplayEnabledChange(() => setOn(readCustomerDisplayEnabled())), []);

  const shopName = currentBranch.name || settings.shopName || '';
  const payload = generatePromptPayPayload(resolvePromptPayId(settings, currentBranch));

  // A QR without an amount (the customer types it) for a quick look at the display
  const test = async () => {
    setMsg(null);
    if (!payload) {
      setMsg({ ok: false, text: 'ยังไม่ได้ตั้งเบอร์/เลขพร้อมเพย์ของร้าน' });
      return;
    }
    setBusy(true);
    const ok = await publishPaymentDisplay(
      currentBranch.id,
      waitingDisplay({ amount: 0, label: 'ทดสอบจอ', shopName, session: `test-${Date.now()}`, payload })
    );
    setBusy(false);
    setMsg(
      ok
        ? { ok: true, text: 'ส่งแล้ว — จอควรแสดง QR ภายในไม่กี่วินาที แล้วกลับหน้าปกติใน 15 วินาที' }
        : { ok: false, text: 'ส่งไม่สำเร็จ: ต้องล็อกอินบัญชีร้าน ออนไลน์ และ deploy firestore.rules ล่าสุดแล้ว' }
    );
    if (ok) setTimeout(() => publishPaymentDisplay(currentBranch.id, idleDisplay(shopName)), TEST_MS);
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
      <div className="flex items-center gap-2">
        <QrCode className="w-5 h-5 text-orange-400" />
        <div className="flex-1">
          <h3 className="font-bold text-sm text-slate-100">จอแสดง QR ชำระเงินให้ลูกค้า (ESP32)</h3>
          <p className="text-[11px] text-slate-400">
            เมื่อรับเงินด้วยพร้อมเพย์ จอ 2.8" ที่หน้าเคาน์เตอร์จะแสดง QR พร้อมยอด และขึ้น “ชำระแล้ว” เมื่อจ่ายเสร็จ · เปิดที่เครื่องแคชเชียร์เครื่องเดียวต่อสาขา
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="ส่ง QR ไปจอลูกค้า"
          onClick={() => writeCustomerDisplayEnabled(!on)}
          className={`w-12 h-7 rounded-full p-1 transition shrink-0 ${on ? 'bg-emerald-500' : 'bg-slate-700'}`}
        >
          <span className={`block w-5 h-5 rounded-full bg-white transition ${on ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      <div className="text-[11px] text-slate-400">
        ตั้งจอเป็นโหมด “จอ QR ชำระเงิน” และใส่ id สาขา <span className="font-mono text-slate-200 select-all">{currentBranch.id}</span>
      </div>
      <button
        type="button"
        onClick={test}
        disabled={busy}
        className="h-10 px-4 rounded-xl border border-slate-600 font-bold flex items-center gap-1.5 disabled:opacity-50"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} ทดสอบจอ
      </button>
      {msg && (
        <div role="status" className={`p-2.5 rounded-xl text-[12px] flex gap-2 ${msg.ok ? 'bg-emerald-950/40 border border-emerald-700/50 text-emerald-200' : 'bg-rose-950/40 border border-rose-800/60 text-rose-200'}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />} {msg.text}
        </div>
      )}
    </div>
  );
};
